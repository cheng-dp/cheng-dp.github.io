---
layout: post
title: ZooKeeper数据模型及Watcher机制
categories: [ZooKeeper]
description: ZooKeeper数据模型及Watcher机制
keywords: ZooKeeper
---

## ZooKeeper系统模型

### 数据模型

ZooKeeper的视图结构和标准的Unix文件系统类似，但是没有目录和文件等相关概念，而是**数据节点**，即ZNode。

ZNode是ZooKeeper中数据的最小单元，每个ZNode上都可以保存数据，同时还可以挂载子节点，因此构成了一个层次化的命名空间，即树。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_znode.png)

### 事务ID

在ZooKeeper中，事务是指能够改变ZooKeeper服务器状态的操作，包括数据节点创建与删除、数据节点内容更新和客户端会话创建与失效等。

**ZXID**：为每一个事务请求分配的全局唯一事务ID。

### 节点类型及状态

#### 节点类型

- 持久节点 PERSISTENT
- 临时节点 EPHEMERAL
- 顺序节点 SEQUENTIAL

节点组合类型：

1. 持久节点 PERSISTENT

创建后一直存在，直到有操作主动删除。

2. 持久顺序节点 PERSISTENT SEQUENTIAL

一直存在，且每个父节点都会为它的第一级子节点维护一份顺序，记录下每个子节点创建的先后顺序。

3. 临时节点 EPHEMERAL

如果客户端会话失效，这个节点会被自动清理掉。

==**不能基于临时节点来创建子节点，即临时节点只能作为叶子节点。**==

4. 临时顺序节点 EPHEMERAL_SEQUENTIAL

在临时节点的基础上，添加了顺序的特性。

#### 节点状态

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_node_state.png)

get命令获取一个数据节点的内容时，第一行返回节点的数据内容，从第二行开始就是节点的状态信息。

### Watcher

#### 模型

1. 客户端向ZooKeeper服务器注册Watcher的同时，将Watcher对象存储在客户端的WatchManager中。
2. ZooKeeper服务器触发Watcher事件后，向客户端发送通知。
3. 客户端根据通知内容，从WatchManager中取出Watcher对象来执行回调逻辑。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_watcher_structure.png)

#### Watcher接口

Watcher接口定义了一个事件处理器，包括:
- KeeperState 通知状态
- EventType 事件类型
- process(WatchedEvent event) 回调方法

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_watcher_interface_field.png)

#### WatchedEvent

当事件发生时，ZooKeeper会向客户端发送WatchedEvent，客户端找到对应的Watcher实现，并调用process回调方法。

WatchedEvent包括：
- KeeperState 通知状态
- EventType 事件类型
- path 节点路径

从WatchedEvent包含的数据中可知：

==**客户端无法直接从事件中得到对应数据节点的原始数据及新数据内容，而是需要再次去主动重新获取。**==

#### Watcher注册机制

客户端可以通过getData、getChildren和exist三个接口来向ZooKeeper服务器注册Watcher。

##### 客户端注册Watcher

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_client_register_watch.png)

1. 首先对当前客户端请求request进行标记，将其设置为“使用Watcher监听”。

2. 封装一个Watcher注册信息WatchRegistration对象，保存数据节点的路径和Watcher的对应关系。

```
WatcherRegistration
- watcher: Watcher
- clientPath: String
```

3. 向服务端发送request，如果响应成功，则客户端将Watcher注册到自身的ZKWatchManager中进行管理。

```
ZKWatchManager
- dataWatches: Map<String, Set<Watcher>>
- existWatches: Map<String, Set<Watcher>>
- childWatches: Map<String, Set<Watcher>>
- defaultWatcher: Watcher
```
4. ==客户端向服务端发送的request中，并没有包含封装的Watcher对象。==

##### 服务端处理Watcher

1. 服务端通过客户端发送的request中的标记，判断是否需要注册watcher。

客户端发送的request中没有包含封装的Watcher对象，只有一个watch标记为true or false。

服务端存储的Watcher实质为ServerCnxn(服务端和客户端连接实体)和节点路径的组合。

2. 根据客户端请求的方法，判断注册哪种watcher，并注册在服务端WatchManager中。

WatchManager是ZooKeeper服务端Watcher的管理者，其内部有watchTable和Watch2Paths两个存储结构：
- watchTable：从数据节点路径的粒度存储Watcher。
- watch2Paths：从Watcher的粒度来控制事件触发需要触发的数据节点。

服务端包含两个WatchManager：
- dataWatches：数据变更Watcher
- childWatches：子节点变更Watcher

判断注册Watcher：
- 客户端发送getData：将ServerCnxn和Path注册至dataWatches。
- 客户端发送getChildren：将ServerCnxn和Path注册至childWatches。

3. 服务端触发Watch通知。

- 服务端监听Watch事件发生。
- 封装WatchedEvent(通知状态 + 事件类型 + 节点路径)
- 在dataWatches/childWatches的watchTable和watch2Paths中查找Watcher(ServerCnxn + path)，提取并从WatchManager中删除。
- 调用ServerCnxn中定义的process方法，向客户端发送封装的WatchedEvent。

==**Watcher在服务端触发后会被删除，是一次性的**==

##### 客户端回调Watcher

- 根据WatchEvent从ZKWatchManager中取出所有相关Watcher。
- 所有Watcher存入WatingEvents队列，==串行同步处理==每一个Watcher的process回调方法。

### Watcher特性总结

1. 一次性

一旦一个Watcher被触发，ZooKeeper将删除该Watcher。

2. 客户端串行执行

对每一个Watch事件的所有回调串行执行。

3. 轻量

WatchedEvent中包含发生的事件，不包含具体内容，需要客户端另外请求。