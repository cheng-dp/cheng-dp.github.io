---
layout: post
title: ZooKeeper角色、通信及请求处理
categories: [ZooKeeper]
description: ZooKeeper角色、通信及请求处理
keywords: ZooKeeper
---


## 服务器角色

ZooKeeper集群中，分别有Leader、Follower和Observer三种类型的服务器角色。

ZooKeeper使用责任链模式处理每一个客户端的请求。

### Leader

Leader是事务请求的唯一调度者和处理者，保证集群事务处理的顺序性。

Leader是集群内部各服务器的调度者。

#### Leader的请求处理链

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_leader_responsibility_pattern.png)

1. PrepRequestProcessor 事务预处理处理器

识别当前请求是否是事务请求，并对事务请求进行预处理，如创建请求事务头、事务体、会话检查、ACL检查和版本检查等。

2. ProposalRequestProcessor 事务投票处理器

ProposalRequestProcessor是Leader服务器事务处理流程的发起者。

- 对于事务请求，根据请求类型创建对应的Proposal提议，并发送给所有的Follower服务器，发起一次集群内的事务投票。

- 将事务请求交付给SyncRequestProcessor进行事务日志的记录。

- 将所有请求交给CommitProcessor。

3. SyncRequestProcessor 事务日志记录处理器

将事务请求记录到事务日志文件中，同时触发ZooKeeper进行数据快照。

4. AckRequestProcessor

负责在事务日志记录处理器完成记录后，向Proposal的投票收集器发送ACK反馈，以通知投票收集器当前服务器已经完成了对该Proposal的事务日志记录。

5. CommitProcessor 事务提交处理器

- 对事务请求，等待集群内针对Proposal的投票直到该Proposal可被提交。

- 对非事务请求，直接交付给下一级处理器ToBeCommitProcessor。

6. ToBeCommitProcessor

将被CommitProcessor处理过的可被提交的Proposal逐个交付给FinalRequestProcessor处理器。

7. FinalRequestProcessor

最后一个处理器，进行客户端请求返回之前的收尾工作。

#### LearnerHandler

Leader服务器会与每一个Follower/Observer服务器建立一个TCP长连接，同时也会为每个Follower/Observer服务器都创建一个名为LearnerHandler的实体。Leader服务器保存了所有Follower/Observer对应的LearnerHandler。

LearnerHandler主要负责Follower/Observer服务器和Leader服务器之间的一系列网络通信，包括数据同步、请求转发和Proposal提议的投票等。


### Follower

- 处理客户端非事务请求，转发事务请求给Leader服务器。
- 参与事务请求Proposal的投票。
- 参与Leader选举投票。

#### Follower的请求处理链

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_follower_responsibility_patterh.png)

1. FollowerRequestProcessor

识别当前请求是否是事务请求，如果是事务请求则转发给Leader服务器。

2. CommitProcessor

同Leader。

3. SyncRequestProcessor

同Leader。

4. SendAckRequestProcessor

和Leader上的AckRequestProcessor想听，在SyncRequestProcessor处理器完成事务日志记录后，会向Leader服务器发送ACK消息以表明自身完成了事务日志的记录工作。

### Observer

- 和Follower一样，事务请求转发给Leader服务器进行处理。
- 和Follower的区别在，Observer不参与任何投票，包括Proposal投票和Leader选举投票。

Observer的请求链路和Follower也一样。

## 服务器消息通信

ZooKeeper服务器间消息类型分为：
- 数据同步型
- 服务器初始化型
- 请求处理型
- 会话管理型

### 数据同步型

消息类型 | 发送方 | 接收方 | 说明
---|---|---|---
DIFF | Leader | Learner | Leader通知Learner服务器，Leader即将与其进行DIFF方式的数据同步
SNAP | Leader | Learner | Leader通知Learner服务器，Leader即将与其进行全量方式的数据同步
UPTODATE | Leader | Learner | Leader通知Learner服务器，已经完成数据同步，可以开始对外提供服务
TRUNC | Leader | Learner | Leader触发Learner进行内存数据库的回滚

### 服务器初始化型

消息类型 | 发送方 | 接收方 | 说明
---|---|---|---
OBSERVERINFO | Observer | Leader | Observer启动时向Leader服务器注册自己，表明当前角色是Observer。消息中包含服务器SID和ZXID。
FOLLOWERINFO | Follower | Leader | Follower启动时向Leader注册自己，表明当前角色是Follower，消息中包含服务器SID和ZXID。
LEADERINFO | Leader | Learner | Leader在接收到OBSERVERINFO和FOLLOWERINFO后回复LEARNERINFO，包含当前Leader服务器的EPOCH值。
ACKEPOCH | Learner | Leader | Follower和Observer接收到LEADERINFO后，回复ACKEPOCH，包含最新的ZXID和EPOCH。
NEWLEADER | Leader | Learner | Leader在和Learner完成一个交互流程后，向Learner发送NEWLEADER消息，同时带上当前Leader服务器最新ZXID。

### 请求处理型

消息类型 | 发送方 | 接收方 | 说明
---|---|---|---
REQUEST | Learner | Leader | Learner服务器向Leader服务器转发事务请求
PROPOSAL | Leader | Follower | ZAB算法核心消息，Leader服务器将事务请求以PROPOSAL消息的形式创建投票发送给所有Follower进行事务日志记录
ACK | Follower | Leader | Follower接收到来自Leader的PROPOSAL消息后，进行事务日志记录，完成后反馈ACK给Leader。
COMMIT | Leader | Follower | 用于通知集群中所有的Follower服务器，可以进行事务请求的提交了。Leader服务器在接收到过半的Follower反馈的ACK消息后，生成COMMIT消息，告知所有的Follower服务器进行事务请求的提交。
INFORM | Leader | Observer | 事务提交阶段，对Follower只需要发送COMMIT，因为之前发送的Proposal中已经包含事务内容，Follower可以从缓存中再次获取到事务请求并执行提交。<br> 对Observer，因为之前没有参与事务投票，因此需要另外的INFORM消息，消息中包含事务请求的内容。
SYNC | Leader | Learner | 通知Learner服务器已经完成了Sync操作

### 会话管理型

消息类型 | 发送方 | 接收方 | 说明
---|---|---|---
PING | Leader | Learner | 用于Leader同步Learner服务器上的**客户端**心跳检测。<br>ZooKeeper客户端随机和任意一个Zookeeper服务器保持连接，因此Leader服务器需要委托给Learner来保存这些客户端的心跳检测记录。<br>Leader定时向Learner发送PING消息，Learner将这段时间内保持心跳检测的客户端列表，同样以PING消息的形式反馈给Leader。<br>Leader服务器逐个对接收到的客户端进行会话激活。
REVALIDATE | Learner | Leader | 在客户端重连时，重新连接上的新服务器会向Leader发送REVALIDATE确定会话是否已经超时，同时也激活会话。

## 请求处理

ZooKeeper服务端对于会话创建的处理，大体可以分为请求接收、会话创建、预处理、事务处理、事务应用和会话响应6大环节。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_server_session_start_process.png)

### 请求接收

1. NIOServerCnxn接收请求

2. 判断是否是客户端“会话创建”请求

每个会话对应一个NIOServerCnxn实体，如果当前NIOServerCnxn实体未初始化，就是“会话创建”请求。

3. 反序列化ConnectRequest请求

4. 判断是否是ReadOnly客户端

如果服务器是以ReadOnly模式启动，那么所有来自非ReadOnly客户端的请求将无法被处理。

5. 检查客户端ZXID

同一个ZooKeeper集群中，服务端的ZXID必定大于客户端的ZXID，否则服务端将不接受客户端的“会话创建”请求。

6. 协商sessionTimeout

客户端构造ZooKeeper实例时，会向服务端发送sessionTimeout参数。

服务端对超时时间的限制介于2个tickTime到20个tickTime之间，如果tickTime为2000毫秒，服务端会限制客户端sessionTimeout在4秒到40秒之间。

7. 判断是否需要重新创建会话

如果客户端请求包含了sessionID，认为客户端正在进行会话重连，服务端只需要重新打开该会话。否则会进入下一步，为客户端创建会话。

### 会话创建

1. 为客户端生成全局唯一sessionID

2. 注册会话

向sessionTracker维护的数据结构sessionsWithTimeout和sessionsById中插入sessionID。

3. 激活会话

在ZooKeeper会话管理的桶(分桶策略)中为会话安排一个区块。

4. 生成会话密码

服务端在创建客户端会话时，会同时为客户端生成一个会话密码，连同sessionID一起发送给客户端。

会话密码是会话在集群中不同机器间转移的凭证。

### 预处理

请求交给PrepRequestProcessor进行处理。

对于事务请求，创建事务头和事务体。

### 事务处理

请求交给ProposalRequestProcessor，请求的处理将会进入三个子处理流程：
- Sync流程
- Proposal流程
- Commit流程

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_leader_responsibility_pattern.png)

**Sync流程、Proposal流程和Commit流程是同时发生的。**

#### Sync流程

ProposalRequestProcessor处理器，针对事务请求，使用SyncRequestProcessor处理器记录事务日志。

Leader服务器和Follower服务器都有该处理器。

完成事务日志记录后，Follower服务器会向Leader服务器发送ACK消息，表明自身完成了事务日志的记录，以便Leader服务器统计每个事务请求的投票情况。

#### Proposal流程

每一个事务请求都需要集群中过半机器投票认可才能被真正应用到ZooKeeper的内存数据库中。Proposal流程负责该投票与统计过程。

1. 发起投票

如果当前请求是事务请求，Leader服务器将发起一轮事务投票。

2. 生成提议Proposal

将PrepRequestProcessor创建的事务头、事务体及Leader的ZXID序列化到Proposal对象中。

3. 广播提议

Leader服务器以ZXID作为标识，将该提议放入**投票箱outstandingProposals**中，同事将该提议广播给所有Follower服务器。

4. 收集投票

Follower在接收到Leader发来的提议后，**进入Sync流程记录事务日志**。

一旦日志记录完成后，向Leader服务器发送ACK消息。

Leader根据ACK消息统计每个提议的投票情况，**当一个提议获得了集群中过半机器的投票，就认为提议通过，进入Commit阶段**。

5. 将请求放入toBeApplied队列

在进入Commit阶段前，ZooKeeper会将请求放入toBeApplied队列中。

6. 广播Commit消息

向Follower发送COMMIT消息，向Observer发送INFORM消息。

#### Commit流程

1. 请求交付给CommitProcessor处理器

CommitProcessor处理器将请求放入**queuedRequests队列**中。

2. 处理queuedRequests队列请求

CommitProcessor有**一个单独的线程**逐个处理queuedRequests队列中的请求。

3. 标记nextPending

如果queuedRequests队列中正在处理的是一个事务请求，即需要等待Proposal投票结果(此时正在进行Proposal流程投票)，需要将nextPending标记为当前请求，一方面确保事务请求的顺序性，另一方面便于检测当前是否正在进行事务请求投票。

4. 等待Proposal投票

Commit流程中的请求将在queuedRequests处理中等待Proposal流程完成投票。

当投票通过后(接收到commit消息)，请求将被放入committedRequests队列中，继续Commit流程。

5. 提交请求

将请求放入toProcess队列，应用事务。

### 事务应用

FinalRequestProcessor处理器将检查请求的有效性并**完成事务在内存数据库中的应用**。

### 会话响应

计算请求在服务端处理花费时间、统计ZXID、lastOp、lastLatency等。

创建connectResponse响应并发送。

### 事务请求转发

所有事务请求必须由Leader服务器来处理，但是并不是所有客户端都和Leader服务器保持连接，因此ZooKeeper实现了事务请求转发机制。

在Follower和Observer中，第一个请求处理器FollowerRequestProcessor和ObserverRequestProcessor，都会检查当前请求是否是事务请求。

如果是事务请求，**以REQUEST消息形式转发给Leader服务器**。Leader服务器接受到消息后，解析出客户端的原始请求，提交到自己的请求处理链中进行事务请求处理。
 
```
本文地址：https://cheng-dp.github.io/2019/04/12/zookeeper-server-role-and-communication/
```
 
