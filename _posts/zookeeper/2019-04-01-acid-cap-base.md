---
layout: post
title: ACID、CAP和BASE理论
categories: [ZooKeeper]
description: ACID、CAP和BASE理论
keywords: ZooKeeper
---


## 事务

### 丢失更新问题

#### 第一类丢失更新(回滚丢失, Lost Update)

A事物撤销时，覆盖了已经提交的B事物的更新数据。

#### 第二类丢失更新(覆盖丢失，Second Lost Update)

A事物提交时，覆盖了B事物的提交。

### 事务隔离性问题

#### 脏读(Dirty Read)

一个事务对数据进行了更新，==但未提交==。另一个事务看到并使用了该更新数据。如果第一个事务回滚，第二个事务使用的就是脏数据。

#### 不可重复读(Non-Repeatable Read)

同一个事务在整个事务过程中对同一笔数据进行读取，读取结果都不同。

#### 幻读(Phantom Read)

同样一个查询在整个事务过程中多次执行后，查询所得的**结果集**不同。(结果集不同的原因是同时有另一个事务插入、删除数据)。

## ACID (事物的限定属性)

### 原子性(Atomicity)

事物的全部操作是一个不可分割的整体，操作要么全部成功，要么全部失败。

### 一致性(Consistency)

事物所包含的操作不能违反数据资源的一致性检查，数据资源在事物执行前处于某个数据一致性状态，事物执行之后也依然需要保持数据的一致性状态。

###  隔离性(Isolation)

规定了各个事物之间相互影响的程度。主要面向对数据资源的并发访问(Concurrency), 及事务的并发执行。

1. 读未提交(Read Uncommitted)

隔离级别最低，事物A能够读到事物B未提交的修改。

2. 读提交(Read Committed)

一个事务的更新操作结果只有在该事务提交之后，另一个事务才可能读取到同一笔数据更新后的结果。是大多数数据库的默认隔离级别。

3. 重复读(Repeatable Read)

在整个事务的过程中，对同一笔数据的读取结果是相同的，不管其他事务是否同时在对同一笔数据进行更新，也不管其他事务对同一笔数据的更新提交与否。

4. 串行化(Serializable)

所有的事务操作都必须依次顺序执行。最安全但性能最差。


隔离级别 | 脏读 | 不可重复读 | 幻读
---|---|---|---
Read Uncommitted | Y | Y | Y
Read Committed | N | Y | Y
Repeatable Read | N | N | Y
Serializable | N | N | N


#### 持久性(Durability)
    
一旦整个事物提交成功，对数据所做的变更将被记载并且不可逆转。==即使发生系统崩溃或其他事故，也能将其恢复到事务成功结束时的状态。 ==

数据库应该通过冗余存储等方式保证事物的持久性。

## CAP定理

ACID是单机事务处理需要遵循的模型，而CAP是针对分布式场景提出的事务定理。

```
一个分布式系统不可能同时满足一致性(C: Consisitency)、可用性(A: Availability)和分区容错性(P: Partition tolerance)，最多只能同时满足其中两项。
```

### 一致性(Consistency)

数据在多个副本之间保持一致的特性。对某个节点成功进行更新操作后，对所有节点都应能读取到最新数据。

### 可用性(Availability)

系统提供的服务必须一直处于可用状态，对于用户的每一个操作请求总是能够在有限的时间内返回结果。

### 分区容错性(Partition Tolerance)

**分区**指及分布式系统由于网路故障，被分割成了不同的无法互通的区。**容错**指允许分区发生的可能性，此时各个分区独立的提供服务。

```
we can interpret partition tolerance as meaning “a network partition is among the faults that are assumed to be possible in the system.” It is misleading to say that an algorithm “provides partition tolerance,” and it is better to say that an algorithm “assumes that partitions may occur.”
```

注意分区不是指节点挂了，而是节点被分区且分区不能互通。

### CAP定理理解

放弃分区容错性：

放弃分区容错性就是不允许系统分区的发生，例如系统只有一个节点，当然能提供一致性和可用性。

放弃一致性：

当分区发生时，要保证可用性，就要允许分区之间数据不一致。

放弃可用性：

当分区发生时，服务下线阻塞直至分区恢复联系。

## BASE理论

BASE = Basically Available(基本可用) + Soft state(弱状态) + Eventually consistent(最终一致性)。

在大型分布式系统中，CAP肯定满足分区一致性，BASE理论就是大型分布式系统对于一致性和可用性的权衡。核心思想是无法做到强一致性，但每个应用都可以根据自身的特点，采用适当方式达到最终一致性。

### Basically Available 基本可用

分布式系统在出现不可预知故障时，允许损失部分可用性：

- 响应时间损失。 如搜索引擎故障后查询时间增加，但是不能返回错误的查询结果。
- 功能损失。如电商网站暂时关闭秒杀功能。

### Soft State 弱状态

允许系统中的数据存在不一致的中间状态，且不会影响系统整体的可用性。即允许系统在不同节点间由于同步延迟出现数据不一致的状态。

### Eventual Consistency 最终一致性

系统保证经过一段时间的同步后，能够达到数据一致的状态。

最终一致性分类：
1. 因果一致性 (Causal consistency)

如果节点A在更新完某个数据后通知了节点B，那么节点B之后对该数据的访问和修改都是基于A更新后的值。于此同时，和节点A无因果关系的节点C的数据访问则没有这样的限制。

2. 读己之所写 (Read your writes)

节点A更新一个数据后，它自身总是能访问到自身更新过的最新值，而不会看到旧值。其实也算一种因果一致性。

3. 会话一致性 (Session Consistency)

系统能保证在同一个有效的会话中实现 “读己之所写”的一致性，也就是说，执行更新操作之后，客户端能够在同一个会话中始终读取到该数据项的最新值。

4. 单调读一致性 (Monotonic read consistency)

如果一个节点从系统中读取出一个数据项的某个值后，那么系统对于该节点后续的任何数据访问都不应该返回更旧的值。

5. 单调写一致性 (Monotonic write consistency)

一个系统要能够保证来自同一个节点的写操作被顺序的执行。


BASE理论适用于大型高可用可扩展的分布式系统，完全不同于传统事务的ACID强一致性模型，而是提出通过牺牲强一致性来获得可用性，并允许数据在一段时间内不一致，但最终达到一致状态。是对大型高可用可扩展分布式系统基于CAP定理的权衡。
 
```
本文地址：https://cheng-dp.github.io/2019/04/01/acid-cap-base/
```
 
