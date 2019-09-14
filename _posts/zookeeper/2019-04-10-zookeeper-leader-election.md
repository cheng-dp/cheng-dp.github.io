---
layout: post
title: ZooKeeper的Leader选举机制
categories: [ZooKeeper]
description: ZooKeeper的Leader选举机制
keywords: ZooKeeper
---

Leader选举是ZooKeeper中最重要的技术之一，也是保证分布式数据一致性的关键所在。

## FastLeaderElection选举算法


### Vote 投票

SID：服务器全局唯一ID。

ZXID：事务ID，唯一表示一次服务器状态的变更。

一个投票由SID和ZXID组成：(SID, ZXID)。

### 开始投票

通常有两种情况导致集群中不存在Leader：
- 整个服务器刚刚初始化启动，尚未产生Leader服务器。
- 运行期间当前Leader所在服务器宕机。

此时，集群中所有服务器都处于**LOOKING**状态，试图选举出Leader。向集群中其他所有机器发出投票(SID, ZXID)。

第一次投票时，每台自己都投自己。

### 变更投票

对接收到的每一个来自其他服务器的投票(vote\_sid, vote_zxid)，处理规则如下：

```
先比较zxid，再比较sid。
```

1. 如果 vote\_zxid > self_zxid, 认可收到的投票，将收到的投票**再次投出**。
2. 如果 vote\_zxid < self_zxid, 坚持自己的投票，不做任何改变，不再发出投票。
3. 如果 vote\_zxid == self_zxid 且 vote\_sid > self_sid，认可当前收到的投票，将收到的投票**再次投出**。
4. 如果 vote\_zxid == self_zxid 且 vote\_sid < self_sid, 坚持自己的投票，不做改变。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_fastLeaderElection_example.png)

### 确定Leader

每台机器收到其他机器投票并处理后，都会统计投票状态。

如果有一台机器收到了超过半数的相同的投票，该投票对应的SID机器即为Leader。

## Leader选举的实现

### 投票数据结构

```
Vote
- id: long // 被推举的Leader的SID值。
- zxid: long // 被推举的Leader的事务ID。
- electionEpoch: long // 当前服务器的选举纪元，每次进入新一轮的投票，该值加一。
- peerEpoch: long // 被推举的Leader的选举纪元。
- state: ServerState // 当前服务器的状态 // LOOKING, FOLLOWING, LEADING, OBSERVING
```

### QuorumCnxManager

QuorumCnxManager负责各台服务器之间的底层Leader选举过程中的网络通信。每台服务器启动时，都会启动一个QuorumCnxManager。

QuorumCnxManager内部维护一系列的队列，保存接受到的、待发送的消息，以及消息发送器：

1. recvQueue

消息接收队列，存放从其他服务器接收到的消息。

2. queueSendMap

消息发送队列，保存待发送的消息。`queueSendMap`是一个Map，按照SID进行分组，为每个参与选举的其他服务器单独分配一个队列。

3. senderWorkerMap

发送器集合，每个SenderWorker对应一台参与选举的其他服务器，负责消息的发送。

4. lastMassageSent

为每个SID保留最近发送过的一个消息。

QuorumCnxManager在启动时，会创建ServerSocket监听Leader选举的通信端口(默认: 3888)，并向所有集群中的服务器中**比自己SID小的**(防止重复连接)发起TCP连接。

### FastLeaderElection算法实现

#### 选票管理

1. sendqueue

选票发送队列

2. recvqueue

选票接收队列

3. WorkerReceiver

选票接收器，接收器不断从QuorunCnxManager中获取选举消息，并转化成Vote选票结构，加入recvqueue。

4. WorkerSender

选票发送器，不断从sendqueue中获取待发送的选票。并传递至底层QuorumCnxManager。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_fastLeaderElection_data_flow.png)

#### 选举步骤

1. 自增选举轮次(ElectionEpoch)

ZooKeeper规定所有有效的投票必须在同一轮次。

2. 初始化选票

在初始化阶段，每台服务器都推举自己为Leader。

3. 发送初始化选票

将刚刚初始化好的选票放入sendqueue队列，由发送器WorkerSender负责发送给所有其他服务器。

4. 接收外部投票

不断地从recvqueue队列中获取外部投票。

5. [处理外部投票]判断选举轮次

- 外部投票选举轮次大于内部投票

**更新本机选举轮次至外部投票轮次，清空recvset中所有已经收到的选票。**

- 外部投票选举轮次小于内部投票

忽略该外部投票。
    
6. [处理外部投票]选票PK

按照ZXID、SID的规则进行PK。如果外部投票获胜，则覆盖内部投票。

==**并再次将变更后的内部投票发送出去。**==

7. 选票归档

每次接受到外部投票都会放入recvset中。

recvset记录当前服务器在本轮次的Leader选举收到的所有外部投票。一台服务器最多只会存入一张选票，recvset 是一个 HashMap，以外部服务器的 sid 作为 key，它们的选票 Vote 作为 value。

```java
recvset.put(n.sid, new Vote(n.leader, n.zxid, n.electionEpoch, n.peerEpoch));
```

8. 统计投票

每次将外部投票放入recvset中时，都会统计集群中是否已经有过半的服务器认可了当前的内部投票。

如果已经有过半服务器认可当前的内部投票，则终止投票，否则继续接收，返回步骤4。

9. 更新服务器状态

如统计投票后终止投票，如果当前被认可的服务器是自己，则更新服务器状态为LEADING。 否则根据具体情况更新为FOLLOWING或OBSERVING。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_fastLeaderElection_process.png)


## REFS

- https://juejin.im/post/5cd06b7c51882544da500e36
- http://www.chilangedu.com/blog/1000001325937566.html
- https://www.jianshu.com/p/763a5ae127a7