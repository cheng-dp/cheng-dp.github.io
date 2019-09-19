---
layout: post
title: ZooKeeper客户端实现简介
categories: [ZooKeeper]
description: ZooKeeper客户端实现简介
keywords: ZooKeeper
---

## 客户端

ZooKeeper的客户端主要由以下几个核心组件组成：
- ZooKeeper实例：客户端的入口。
- ClientWatchManager：客户端Watcher管理器。
- HostProvider：客户端地址列表管理器。
- ClientCnxn：客户端核心线程，包括SendThread和EventThread。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_client_structure.png)

### ZooKeeper初始化及会话流程

ZooKeeper实例的创建过程，就是ZooKeeper客户端的初始化与气动环节。
```
ZooKeeper客户端的构造方法：
ZooKeeper(String connectString, int sessionTimeout, Watcher watcher);
ZooKeeper(String connectString, int sessionTimeout, Watcher watcher, boolean canBeReadOnly);
ZooKeeper(String connectString, int sessionTimeout, Watcher watcher, long sessionId, byte[] sessionPasswd);
ZooKeeper(String connectString, int sessionTimeout, Watcher watcher, long sessionId, byte[] sessionPasswd, boolean canBeReadOnly);
```

#### 初始化阶段

1. 初始化ZooKeeper对象

- 构造方法实例化ZooKeeper对象。
- 创建客户端Watcher管理器ClientWatchManager。

2. 设置默认Watcher

将构造方法传入的Watcher对象作为defaultWatcher存入ClientWatchManager。

3. 构造==服务器地址列表管理器HostProvider==

解析connectString, 将传入的服务器地址保存在HostProvider。

4. 初始化客户端网路连接器 ClientCnxn

CLientCnxn负责客户端与服务器的网路交互：
- outgoingQueue + pendingQueue：客户端请求发送队列 + 服务端响应等待队列。
- SendThread：负责客户端和服务器端之间的所有网络I/O。
- EventThread：负责事件处理。

#### 会话创建阶段

1. 启动SendThread和EventThread。
2. 从HostProvider随机获取一个地址，创建TCP连接。
3. SendThread发出连接请求ConnectRequest。

#### 响应处理阶段

1. ClientCnxn接收服务端响应。
2. 处理Response，通知SendThread及HostProvider连接成功。
3. 生成SyncConencted-None连接成功事件。
4. EventThread查询SyncConnected-None对应的Watcher并执行。

### 服务器地址解析


##### ConnectStringParser

在构造ZooKeeper实例时，传入的connectString是一个服务器地址列表：
```
// 所有地址在一个字符串上，使用英文逗号分隔
192.168.0.1:2181,192.168.0.2:2181/apps/X,192.168.0.3:2181/apps/X
```
ZooKeeper客户端内部接收到服务器地址列表后，封装至ConnectStringParser对象中：
```Java
public final class ConnectStringParser {
    String chrootPath;
    ArrayList<InetSocketAddress> serverAddresses = new ArrayList<InetSocketAddress>();
}
```
chrootPath是客户端隔离命令空间，用来设置应用的根目录。一旦设置了Chroot之后，客户端和ZooKeeper服务器发起的所有请求中相关的节点路径，都是一个相对路径，根路径就是Chroot。

serverAddresses保存了所有设置的服务器的IP和Port。

##### HostProvider 地址列表管理器

客户端通过HostProvider从地址列表中选择连接服务器。

```
public interface HostProvider{
    public int size(); // 返回当前服务器地址列表个数
    public InetSocketAddress next(long spinDelay); // 选择一个服务器地址并返回
    public void onConnected(); // 如果客户端与服务器成功创建连接，会调用该回调方法
}
```

**StaticHostProvider**是HostProvider接口的默认实现。

**StaticHostProvider**首先将服务器地址列表随机排列后组织成一个环形列表，之后就一直按照该环形顺序获取服务器地址。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_staticHostProvider_next.png)

### CientCnxn 网络I/O

ClientCnxn是客户端的核心工作类，负责维护客户端与服务端之间的网络通信。

#### Packet

Packet是ClientCnxn内部定义的对ZooKeeper协议层的封装，是ZooKeeper中请求与响应的载体。

```
Packet
- requestHeader: RquestHeader // 请求头
- replyHeader: ReplyHeader // 响应头
- request: Record // 请求体
- response: Record // 响应体
- bb: ByteBuffer
- clientPath: String // 节点路径
- serverPath: String // 节点路径
- finished: boolean
- cb: AsyncCallback
- ctx: Object
- watchRegistration: WatchRegistration // 注册的Watcher
- readOnly: boolean
-------------------------
+ createBB(): void
```

只有`requestHeader`、`request`、`readOnly`会被发送给服务端，其余都直接保存在客户端的上下文中。

#### outgoingQueue和pendingQueue

outgoingQueue：

存储需要发送到服务端的Packet集合。

pendingQueue:

存储已经从客户端发送到服务端，但是需要等待服务端响应的Packet集合。

#### SendThread

SendThread是客户端ClientCnxn的核心I/O调度线程。

1. ==维护客户端与服务端的会话生命周期。==

- 周期地向服务端发送PING包实现心跳检测。
- 如果和服务端的TCP连接断开，自动且透明化地完成重连。

2. 管理客户端所有的请求发送和响应接收操作。

3. 负责传递服务端的事件给EventThread。

#### EventThread

负责客户端事件处理，触发客户端注册的Watcher监听回调。

1. 维护watingEvents队列，包括客户端注册的Watcher和异步接口中注册的AsyncCallback。
2. 不断从watingEvents队列中取出Object，根据类型(Watcher/AsyncCallback)执行回调。
 
```
本文地址：https://cheng-dp.github.io/2019/04/08/zookeeper-client/
```
 
