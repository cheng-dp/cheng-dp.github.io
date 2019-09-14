---
layout: post
title: ZooKeeper基本概念
categories: [ZooKeeper]
description: ZooKeeper基本概念
keywords: ZooKeeper
---

## ZooKeeper 介绍

ZooKeeper起源于雅虎研究院，由Apache Hadoop的子项目发展而来，是Google Chubby的开源实现。

ZooKeeper是一个典型的分布式数据一致性解决方案。能够实现诸如：
- 数据发布/订阅
- 负载均衡
- 命名服务
- 分布式协调/通知
- 集群管理
- Master选举
- 分布式锁
- 分布式队列
等功能。

ZooKeeper能保证如下**分布式一致性特性**：
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

### ZooKeeper的设计目标

ZooKeeper致力于提供一个高性能、高可用，且具有严格的**顺序访问控制能力**的分布式协调服务。

1. 简单的数据模型

提供一个共享的、树型结构的名字空间来进行协调服务。

2. 可以构建集群

组成ZooKeeper集群的每台机器都会在内存中维护当前的服务器状态，并且每台机器之间都互相保持通信。

只要集群中存在超过一半的机器能够正常工作，整个集群就能够正常对外服务。

ZooKeeper客户端会选择和集群中任意一台机器共同来创建一个TCP连接，而一旦客户端和某台ZooKeeper服务器之间的连接断开，客户端会自动连接到集群中的其他机器。

3. 顺序访问

对于来自客户端的每个更新请求，ZooKeeper都会分配一个全局唯一的递增编号，反映了所有事务操作的先后顺序。

4. 高性能

ZooKeeper全量数据都存储于内存中，并直接服务于客户端的所有非事务请求，因此尤其适用于读操作为主的应用场景。

## ZooKeeper的基本概念

1. 集群角色

Leader服务器提供读和写服务，Follower和Observer提供读服务。

Observer不参与Leader选举，也不参与事务的过半写成功策略。Observer可以在不影响写性能的情况下提升集群读性能。

2. 会话(Session)

Session指客户端会话。

客户端启动时，==会与服务器建立一个TCP长连接==，从第一次连接建立开始，客户端会话的生命周期也就开始了。

通过建立的TCP长连接，客户端能够通过心跳检测与服务器保持有效的会话，也能够向ZooKeeper服务器发送请求并接受响应，同事还能够接受来自服务器的Watch事件通知。

当由于网络故障或客户端主动断开连接时，只要**在sessionTimeout规定的时间内重新连接**上集群中的任意一台服务器，那么之前创建的会话仍然有效。

3. 数据节点(Znode)

ZooKeeper数据模型是一颗树(ZNode Tree)，由斜杠分割的路径，就是一个Znode，如/foo/path1。每个ZNode会保存自己的数据内容及属性信息(如版本)。

ZNode分为持久节点和临时节点，临时节点的声明周期和客户端会话绑定，会话失效则临时节点被移除。

ZooKeeper还允许**用户为每个节点添加SEQUENTIAL属性**，被标记的节点创建时，ZooKeeper会自动在其节点名后追加一个整型数字，该数字是一个由**父节点维护**的自增数字。

4. 版本

ZooKeeper会为每个ZNode维护version(当前ZNode的版本)、cversion(当前ZNode子节点的版本)和aversion(当前ZNode的ACL版本)。

5. Watcher

ZooKeeper允许用户在指定节点上注册Watcher，并且在一些特定事件触发时，向客户端发送Watcher通知。

6. ACL(Access Control Lists)

ZooKeeper采用ACL策略进行权限控制。

