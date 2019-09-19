---
layout: post
title: ZooKeeper Atomic Broadcast协议
categories: [ZooKeeper]
description: ZooKeeper Atomic Broadcast协议
keywords: ZooKeeper
---

## ZAB基本特性

ZooKeeper并没有完全采用Paxos算法，而是使用了一种称为ZooKeeper Atomic Broadcast(ZAB，ZooKeeper原子消息广播协议)的协议作为其数据一致性的核心算法。

ZooKeeper使用一个单一的主进程(集群中的Leader)来接收并处理客户端的所有事务请求，并采用ZAB原子广播协议将服务器数据的状态变更以事务Proposal的形式广播到所有的副本进程上。

1. ZAB协议保证同一时刻集群中只有一个主进程广播服务器的状态变更，能够很好地处理客户端大量的并发请求。

2. ZAB协议能够保证一个全局的变更序列，如果一个状态变更已经被处理，那么所有其依赖的状态变更都已经被提前处理。

3. ZAB协议在当前主进程出现崩溃退出或重启时，能够通过选举的方式快速切换主进程，保证集群正常工作。

```
ZAB协议保证了ZooKeeper的五个**分布式一致性特性**：

1. 顺序一致性

同一个客户端发起的事务请求，将会严格按照发起顺序被应用到ZooKeeper中。

2. 原子性

所有事务请求的处理结果在整个集群中所有机器上的应用情况是一致的。要么都成功应用，要么都没有。

3. 单一视图(Single System Image)

无论客户端连接的是哪个ZooKeeper服务器，其看到的服务端数据模型都是一致的。

4. 可靠性

一旦服务端成功应用了一个事务，并完成对客户端响应。该事务引起的服务端状态改变将会被一直保留，直到另一个事务对其进行变更。

5. 实时性

ZooKeeper并不保证绝对实时性。

ZooKeeper仅仅保证在**一定的时间段内**，客户端最终一定能够从服务端上读取到最新的数据状态。

```

## ZAB的四个阶段

- 选举阶段
- 发现阶段
- 同步阶段
- 广播阶段

实际实现时将发现阶段和同步阶段合并为一个**恢复阶段**。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_zab_three_phase.png)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_zab_four_phase.png)

在集群启动过程中，或者Leader宕机时，ZAB会进入选举阶段，产生新的Leader服务器后，进入恢复阶段，与集群中过半机器完成数据同步。

当集群中已经有过半的Follower服务器完成了和Leader服务器的状态同步，集群进入消息广播模式。

新加入的服务器会自觉进入恢复阶段：找到Leader服务器并进行数据同步，然后进入广播阶段。

### 选举阶段

选举阶段的算法和实现见《第七章 ZooKeeper技术内幕.4 Leader选举》。

进入选举流程的前提：
- 机器初始化启动，进入LOOKING状态。
- Follower运行期间无法与Leader保持连接，Follower进入LOOKING状态。
- ==Leader无法收到半数或以上Follower的心跳检测，Leader进入LOOKING状态。==

1. 每个LOOKING状态服务器会与所有其他服务器(大id向小id发送连接请求)建立TCP连接，监听专门的选举端口(默认3888)。

2. 为了确保提交已经被Leader提交的事务Proposal，选举出最新epoch下，ZXID最大的服务器作为Leader。

3. 如果机器进入选举流程后，当前集群已经选举出Leader，则会被告知Leader的信息，当前机器将进入Following状态，与新Leader直接建立连接。

4. 获得超过一半Follower的投票即成为Leader。

**选举出来的Leader仅仅是准Leader，此时集群还无法对外提供服务。**

### 发现阶段

发现阶段和同步阶段共同组成恢复阶段。

==为了防止网络原因造成的数据错误，在发现阶段，准Leader将接收完成选举阶段的Follower的{最新epoch, 最大Zxid, 事务提交历史}。==

准Leader将基于所有Follower的数据，生成最新的epoch、得到最大Zxid以及更新自身的历史事务日志。

1. 获取最新epoch

- Follower向Leader发送当前epoch消息：`FOLLOWERINFO(F.acceptedEpoch)`。
- Leader选出接收到的最大`acceptedEpoch`，值加一得到新的epoch。
- 只有当过半Follower向Leader发送FOLLOWERINFO后，Leader才会解除阻塞，得到最大acceptedEpoch计算新epoch。    

2. 统一epoch

   Leader向Follower发送：`NEWEPOCH(e')`。

3. Follower接收新epoch值，并与当前`acceptedEpoch`比较

    - e' >= acceptedEpoch, 向Leader发送ACKEPOCH，并带上本机事务历史和最大Zxid：`ACKEPOCH(F: currentEpoch, F:history, F:lastZxid)`，进入同步阶段。
    - e' < acceptedEpoch，则表明发生数据错误，当前节点重新进入**选举阶段**，向其他节点发送投票。
    
4. ==Leader接收`ACKEPOCH`，找出lastZxid最大值，并同步最新的事务，进入同步阶段。==

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_zab_discovery_phase.png)

消息类型 | 发送方 | 接收方
--- | --- | ---
FOLLOWERINFO | Follower | Leader
NEWEPOCH | Leader | Follower
ACKEPOCH | Follower | Leader


==**选举阶段和发现阶段规则，保证Leader具有集群中最高的Zxid，保证已经处理过的Proposal不被丢弃。**==

### 同步阶段

发现阶段，准Leader已经获得了集群中最新事务历史，进入同步阶段，准Leader将基于最新Proposal的历史，对所有Follower进行同步。

当超过半数的服务器完成同步，准Leader才真正称为Leader，集群进入广播阶段，开始对外提供服务。

1. 执行同步策略

同步阶段有四种策略：

    - 差异化同步(DIFF同步)
    - 回滚同步(TRUNC同步)
    - 先回滚再差异化同步(TRUNC + DIFF同步)
    - 全量同步(SNAP同步)
    
参见《第七章 ZooKeeper技术内幕.6 数据存储与数据同步》

涉及到的指令：SNAP、TRUNC、DIFF、Proposal、Commit

2. Leader向Learner发送NEWLEADER，表示完成发送所有待同步的Proposal。

3. Learner向Leader反馈ACK，表示完成所有Proposal的同步。

4. Leader阻塞，**直到接收到过半Learner反馈ACK，向所有Learner发送UPTODATE，表示完成同步**。

5. Learner向Leader反馈ACK。

消息类型 | 发送方 | 接收方
--- | --- | ---
SNAP/TRUNC/DIFF | Leader | Follower
Proposal | Leader | Follower
Commit | Leader | Follower
NEWLEADER | Leader | Follower
ACK to NEWLEADER | Follower | Leader
UPTODATE | Leader | Follower
ACK to UPTODATE | Follower | Leader

==**同步阶段保证已经丢弃的Proposal不被处理。**==，即可能出现的前Leader应用的commit但还没有被follower确认，应当丢弃。

### 广播阶段

广播阶段类似于2PC(二阶段提交协议)，但是移除了事务回滚。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_zab_broadcast.png)

1. Follower和Observer会把事务请求转发给Leader。
2. Leader将针对每个事务请求向Follower广播Proposal。
3. Follower在事务日志中记录接收到的Proposal，并向Leader反馈ACK。
4. Leader阻塞等待有超过半数Follower反馈ACK，向Follower广播COMMIT，向Observer广播INFORM。
5. Follower/Observer接收到COMMIT/INFORM，将对应Proposal加入commit队列，逐个提交事务。

完整步骤参见：《第七章 ZooKeeper技术内幕.5 角色、通信及请求处理》。

**如何保证事务的顺序性：**

- 在Leader中，无论是Proposal还是Commit都是针对每个Learner维护一个列表，按序发送。
- 每个Learner维护一个commit队列，同样是按序提交。
- Follower收到Commit时，将与之前收到的最新Proposal事务比较，如果Zxid不一致，将重新与Leader同步。

### 两种特殊情况

#### Leader已Commit，Follower未Commit 

##### 问题

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_broadcast_special_one.png)

如图所示，Leader在提交C2后崩溃，C2未发出，Follower未提交C2。

由于Leader服务器提交C2后已经对客户端作出了响应，因此，此时要确保Leader已经提交的P2C2不被丢弃。

##### 处理方式

旧Leader提交了C2，则必然已经接受到半数或以上Follower返回的ACK，也就是半数或以上Follower已经将P2写入事务日志。

旧Leader崩溃后，Follower重新选举出的新Leader必然包含P2(最大Zxid)，新Leader将对所有Follower进行同步，应用C2。

#### Leader已Proposal，未Commit，Follower未收到Proposal

##### 问题

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_broadcast_special_two.png)

如图所示，Leader在提出P3时崩溃，且集群中其他服务器都没收到P3，重新选举后继续继续提供服务。

在P10时旧Leader苏醒并广播P3，由于此时集群已经应用了其他事务，要保证顺序性，必须确保丢弃P3。

##### 处理方式

其他Follower接收到旧Leader发出的P3，由于epoch不同，将直接丢弃。

旧Leader重新加入集群后将成为Follower，新的准Leader将对该Follower执行TRUNC + DIFF同步。

## ZAB协议和PAXOS协议的区别

## REFS
- https://www.jianshu.com/p/8e2bfb0cb7a7
- https://dbaplus.cn/news-141-1875-1.html
- http://www.importnew.com/24519.html
- http://zhongmingmao.me/2017/07/09/zk-zab/
- https://blog.xiaohansong.com/zab.html
- https://blog.reactor.top/2018/04/09/zookeeper%E6%BA%90%E7%A0%81-ZAB%E5%8D%8F%E8%AE%AE%E4%B9%8B%E9%9B%86%E7%BE%A4%E5%90%8C%E6%AD%A5_3/
- https://www.cnblogs.com/sunddenly/p/4138580.html
 
```
本文地址：https://cheng-dp.github.io/2019/04/05/zookeeper-atomic-broadcast/
```
 
