---
layout: post
title: ZooKeeper的Session机制
categories: [ZooKeeper]
description: ZooKeeper的Session机制
keywords: ZooKeeper
---

客户端与服务端之间的任何交互操作都与会话息息相关，包括临时节点的生命周期、客户端请求的顺序执行以及Watcher通知机制等。

ZooKeeper的连接与会话就是客户端通过实例化ZooKeeper对象来实现客户端与服务器创建并保持TCP连接的过程。

### 会话状态

- CONNECTING
- CONNECTED
- RECONNECTING
- RECONNECTED
- CLOSE

当客户端开始创建ZooKeeper对象时，状态变为CONNECTING。逐个选取服务器地址列表中的IP地址尝试连接，成功连接上后状态变更为CONNECTED。

伴随着网络问题，客户端与服务器的连接可能断开，此时客户端会自动进行重连，状态再次变更为CONNETING，脸上后又变为CONNECTED，因此，运行期间，客户端的状态是介于CONNECTING和CONNECTED之间。

会话超时、权限检查失败、客户端主动退出时，客户端状态变更为CLOSE。

### 会话创建

#### Session

**Session**是ZooKeeper中的会话实体，包括：
1. sessionID 会话全局唯一ID

2. TimeOut 会话超时时间

客户端在构造ZooKeeper实例时，向服务器发送配置的SessionTimeout参数，服务器根据自己的超时时间限制确定最终会话超时时间。

3. TickTime 下次会话超时时间

ZooKeeper对会话实行**分桶策略**，根据当前时间、Timeout计算得出。

4. isClosing 会话是否已经关闭

当`isClosing = true`时，服务器不再处理来自该会话的新请求。


#### SessionTracker

SessionTracker是ZooKeeper服务端的会话管理器，负责会话的创建、管理和清理工作。其中维护了三个Map：

1. HashMap<Long, SessionImpl> **sessionsById**

根据sessionId得到Session实体。

2. ConcurrentHashMap<Long, Integer> **sessionsWithTimeout**

根据sessionID得到会话超时时间。

3. HashMap<Long, SessionSet> **sessionSets**

根据**分桶策略**管理会话。

#### 分桶策略

将**下次超时时间点(ExpirationTime)**相同的会话放在同一个区块中同一管理。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_session_bucket_expiration_management.png)

ZooKeeper Leader服务器每隔**ExpirationInterval**会检查会清理超时会话，为了方便多多个会话同时检查，**ExpirationTime**是**ExpirationInterval**的整数倍：

```
ExpirationTime_ = CurrentTime + SessionTimeout
ExpirationTime = (ExpirationTime_/ExpirationInterval + 1) * ExpirationInterval
```

#### 会话管理

1. 会话激活 TouchSession (保持会话的有效性)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/Users/cdp/Work/ImageHostInGithub/zookeeper_session_touch.png)

- 每当客户端向服务端发送请求，会触发会话激活。
- 客户端在`sessionTimeout/3`时间内未和服务器进行过任何通信时，客户端会向服务端发送PING请求。

2. 会话超时检查

SessionTracker中单独的线程进行会话超时检查。

线程每隔ExpirationInterval时间，逐个依次地对会话桶中剩下的会话进行清理。

#### 会话清理

SessionTracker超时检查线程会对已经过期的会话进行会话清理。

1. 标记isClosing = true。

2. 提交“会话关闭”请求，使会话关闭操作在整个服务端集群中都生效。

3. 收集需要清理的临时节点。

ZooKeeper内存数据库中维护了“会话ID -- 临时节点集合”的表。

4. 删除临时节点

逐个将这些临时界定啊转换成“节点删除”请求并删除会话对应的所有临时节点。

5. 移除会话

从SessionTracker中得sessionsById、sessionsWithTimeout和sessionSets中移除会话。

6. 关闭 NIOServerCnxn

#### 重连

客户端和服务端网络连接断开时，客户端会自动反复重连，再次连接上的客户端状态可能是：

1. CONNECTED

在会话超时时间内重新连接上集群中任意一台机器。

2. EXPIRED

在会话超时时间外重新连接上。


当客户端与服务器端连接出现问题断开时，客户端可能出现的异常有：

1. CONNECTION_LOSS (org.apache.zookeeper.KeeperException$ConnectionLossException)

场景：

客户端在请求服务端时，网络异常，客户端会立即接受到事件None-Disconnected通知，并抛出ConnectionLossException。

应对策略：

应用程序应该捕获该异常，并等待客户端自动完成重连，成功重连后客户端会受到None-SyncConnected通知，此时可以重新发送请求。

2. SESSION_EXPIRED

场景：

在CONNECTION\_LOSS期间，由于重连耗时过长，超过了会话超时时间(sessionTimeout)，成功重连后，服务器会告知客户端会话超时(SESSION_EXPIRED)。

应对策略：

用户需要重新实例化一个ZooKeeper对象。

3. SESSION_MOVED

场景：

客户端和服务器S1之间的连接断开后，CONNECTION_LOSS期间，客户端重新连接了新的服务器S2。

```
可能出现的问题：
1. C1向S1发送请求R1 setData(/app/data, 1);
2. 请求R1到达S1之前，C1与S1之间的连接断开，并重连上S2。
3. C1向S2发送请求R2 setData(/app/data, 2);
4. S2处理了R2后，此时R1到达S1，对于客户端来说，正确的请求R2被错误的请求R1覆盖。
```

应对策略：

服务端在处理客户端请求的时候，会首先检查会话所有者，如果所有者不是当前服务器，则向客户端发出SessionMovedException。