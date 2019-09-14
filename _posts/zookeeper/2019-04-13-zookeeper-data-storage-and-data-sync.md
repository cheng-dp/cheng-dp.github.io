---
layout: post
title: ZooKeeper数据存储与数据同步机制
categories: [ZooKeeper]
description: ZooKeeper数据存储与数据同步机制
keywords: ZooKeeper
---

ZooKeeper中，数据存储分为两部分，内存数据(ZKDatabase)与磁盘数据(事务日志 + 事务快照)。
 
## ZKDatabase
 
ZooKeeper的数据模型是一棵树。
 
而从使用角度看，ZooKeeper就像一个内存数据库一样，在内存数据库中，存储了整棵树的内容，包括所有的节点路径、节点数据以及ACL信息等。
 
1. ZKDatabase

ZKDatabase是ZooKeeper的内存数据库，负责管理ZooKeeper的所有会话、DataTree存储和事务日志。

==ZKDatabase会定时向磁盘dump快照数据，同时在ZooKeeper服务器启动的时候，会通过磁盘上的事务日志和快照数据文件恢复成一个完整的内存数据库。==
 
2. DateTree
 
DateTree是ZooKeeper内存数据存储的核心。
 
```
DataTree:
- nodes: ConcurrentHashMap<String, DataNode>
- ephemerals: ConcurrentHashMap<Long, HashSet<String>>
- dataWatches: WatchManager
- childWatches: WatchManager
-----------------------------------------------------
+ convertAcls(List<ACL>): Long
+ convertLong(Long): List<ACL>
+ addDataNode(String, DataNode): void
+ createNode(String, byte, List<ACL>, long, int, long, long): String
+ deleteNode(String, long)
+ setData(String, byte, int, long, long)
+ getData(String, Stat, Watcher)
+ ......
```
 
`ConcurrentHashMap<String, DataNode> nodes`存储所有ZooKeeper节点信息，Key为节点路径，Value为DataNode。
 
`ConcurrentHashMap<Long, HashSet<String>> ephemerals`存储所有临时节点的信息，便于实时访问和及时清理。Key为客户端SessionID，Value为该客户端创建的所有临时节点路径集合。
 
3. DataNode
 
DataNode 是数据存储的最小单元，内部保存节点的数据内容(data[])、ACL列表(acl)和节点状态(stat)，同时记录父节点(parent)的引用和子节点列表(children)。

```
DataTree:
- parent: DataNode
- data: byte[]
- acl: Long
- stat: StatPersisted
- children: Set<String>
-----------------------
+ addChild(): boolean
+ removeChild(): boolean
+ setChildren(): void
+ getChildren(): Set<String>
+ copyStat(Stat): void
+ deserialize(InputArchive, String)
+ Serialize(OutputArchive, String)
+ ......
```

## 事务日志

### 文件存储

1. 配置目录

事务日志文件默认存储于`dataDir`。

也可以为事务日志单独配置文件存储目录`dataLogDir`。

2. 存储文件

ZooKeeper运行一段时间后，在配置的目录中将创建子目录version-2：
```
{dataLogDir配置目录}/version-2
```
version-2是当前ZooKeeper使用的事务日志格式版本号。

version-2中生成日志文件如下图：

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_tx_file_format.png)

3. 文件名

==事务日志文件的文件名是一个十六进制数字，高32位为Leader选举周期(epoch)，低32为是事务ZXID。==

4. 日志格式

日志文件是二进制格式存储，ZooKeeper提供了解码工具：

```
Java LogFormatter 日志文件
```

第一行：
```
ZooKeeper Transactional Log File with dbid 0 txnlog format version 2
```
事务日志文件头信息。

第二行：
```
..11:07:41 session 0x144699552020000 cxid 0x0 zxid 0x300000002 createSession 3000
```
一次客户端会话创建的事务操作日志。  
事务操作时间 + 客户端会话ID + CXID + ZXID + 操作类型 + 会话超时时间

第三行：
```
..11:08:40 session 0x144699552020000 cxid 0x2 zxid 0x300000003 create `/test_log,#7631,v{s{31,s{'world',anyone}}},F,2
```
节点创建操作的事务操作日志。  
事务操作时间 + 客户端会话ID + CXID + ZXID + 操作类型 + 节点路径 + 节点数据内容

以后几行都类似。

### 日志写入

事务写入事务日志的操作由`FileTxnLog`的`append`方法完成：
```
public synchronized boolean append(TxnHeader hdr, Record txn)
```
1. 确定是否有事务日志可写

ZooKeeper第一次写入事务日志，或者上一个事务日志写满时，服务器没有和任何日志文件关联，
此时需要使用**当前待写入事务的ZXID作为后缀创建新的事务日志文件**，并写入。

2. 确定事务日志文件是否需要扩容

为了避免开辟新磁盘块的开销，==ZooKeeper使用**事务文件预分配**的方式。==

文件初创建时，会预分配64MB磁盘块，并且当检测到当前事务文件剩余空间不足4KB时，文件大小将被增加64MB，并使用0填充被扩容的文件空间。

`zookeeper.preAllocSize`设置预分配大小。

3. 写入文件

事务序列化、计算Checksum后，事务头、事务体和Checksum值将被写入文件流，放入streamsToFlush中。

`zookeeper.forceSync`设置是否强制将streamsToFlush中的字节流马上写入磁盘。

### 日志截断

在ZooKeeper中，Leader服务器上的事务ID(Zxid)必须大于或等于非Leader服务器上的事务ID(peerLastZxid)。

当发现非Leader服务器上的Zxid比Leader服务器上的Zxid大时，Leader会发送TRUNC命令给该机器，进行日志截断，删除所有包含或大于peerLastZxid的事务日志文件，并重新与Leader进行同步。

## snapshot数据快照

数据快照用来记录ZooKeeper服务器上某一时刻的全量内存数据内容，并将其写入到指定的磁盘文件中。

### 文件存储

快照数据的存储和事务日志文件类似。

1. 通过`dataDir`属性配置文件存储位置

2. 建立版本目录

3. 文件名高32位为Leader选举纪元(epoch)，低32位为快照开始时最新ZXID。

3. 二进制存储，提供`SnapshotFormatter`解码工具

==snapshot数据快照因为是一次全量写入，因此不需要预分配机制。==

### 快照过程

FileSnap负责维护快照数据的接口，包括快照数据写入和读取。

1. 确定是否需要进行数据快照

==ZooKeeper每隔若干次事务日志记录后，进行一次数据快照。通过`snapCount`参数进行配置。==

如果当前已经记录的事务日志数量logCount满足以下“过半随机”条件时，进行一次快照：
```
randRoll = random(1, snapCount / 2);
logCount > (snapCount / 2 + randRoll);
```
`snapCount`默认为100000，那么ZooKeeper会在50000到100000次事务日志记录后进行一次快照。

2. ==切换事务日志文件==

==重新创建一个新的**事务日志**==。

==事务文件不能无限制增加(按64M增量)，当事务执行数目满足`snapCount过半随机`时，会切换新的事务文件。==

==因此快照和事务文件其实是相互影响的一体的，并不是独立的。==

3. 创建数据快照异步线程

4. 生成快照数据文件名

ZooKeeper根据当前Leader纪元(epoch)及当前ZXID生成快照数据文件名。

5. 序列化ZKDatabase中DataTree及会话信息，生成Checksum，写入快照文件。

## 内存数据初始化

ZooKeeper服务器启动时，会进行数据初始化工作，将磁盘上的数据文件加载到ZooKeeper服务器内存中。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_init_load_data.png)

1. 初始化FileTxnSnapLog

FileTxnSnapLog是ZooKeeper事务日志和快照数据访问层。包括FileTxnLog和FileSnap分别为事务日志管理器和快照数据管理器。

2. 初始化ZKDatabase

初始化DataTree，创建默认节点`/`, `/zookeeper`和`zookeeper/quota`。

初始化sessionsWithTimeouts会话超时时间记录器。

3. 创建PlayBackListener监听器

在ZooKeeper数据恢复后期，会有一个**事务订正**的过程，在这个过程中，会回调PlayBackListener监听器进行对应的数据订正。

4. 获取并解析快照文件

从所有的快照文件中，按时间逆序对快照文件进行反序列化，生成DataTree对象和sessionsWithTimeouts集合，并且进行checkSum校验。

只有当最新的文件不可用时，才会解析下一个，直到有一个文件通过校验，恢复完成。

如果读取至第100个快照文件仍然不可用，则认为无法从磁盘中加载数据，服务启动失败。

5. 生成快照最新的ZXID：zxid\_for_snap

根据4中的快照文件名低32位得到快照文件恢复数据对应的最新的ZXID: zxid\_for_snap。

6. 解析事务日志

由于快照文件是依据每隔一段时间才生成，包含的数据只是近似全量数据，剩余的增量数据需要从事务日志中获

7. 事务应用

从事务日志中获取所有ZXID大于zxid\_for_snap的事务，并逐个应用到DataTree和sessionsWithTimeouts中。

对每个应用的事务回调PlayBackListener监听器，将事务转换成Proposal保存至提议缓存队列ZKDatabase.committedLog中，以便Follower进行快速同步。

8. 获取最新ZXID

所有待提交事务被完整应用后，获取此时最大ZXID。

9. 校验epoch

从最新ZXID中解析出事务处理的Leader周期epochOfZxid，同时从磁盘的currentEpoch和acceptedEpoch文件中读取上次记录的最新epoch值，进行校验。

## 数据同步

集群完成Leader选举后，Learner会向Leader服务器进行注册，当Learner服务器向Leader完成注册后，就进入数据同步环节。

数据同步过程就是Leader服务器将那些没有在Learner服务器上提交过的事务请求同步给Learner服务器。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_data_sync.png)

### 数据同步初始化

Learner向Leader注册的最后阶段，Learner向Leader发送ACKEPOCH，包含Learner的currentEpoch和lastZxid。

Leader服务器从ZooKeeper内存中提取出**提议缓存队列(committedLog)**，同时初始化三个ZXID值：
```
committedLog: ZooKeeper会保存最近一段时间内执行的事务请求议案，个数限制默认为500个议案。
```
- peerLastZxid：Learner服务器的lastZxid。
- minCommittedLog：Leader服务器提议缓存队列committedLog中的最小ZXID。
- maxCommittedLog：Leader服务器提议缓存队列committedLog中的最大ZXID。

Leader服务器根据peerLastZxid、minCommittedLog、maxCommittedLog的值决定数据同步类型：
- 差异化同步(DIFF同步)
- 回滚同步(TRUNC同步)
- 先回滚再差异化同步(TRUNC + DIFF同步)
- 全量同步(SNAP同步)

### 差异化同步(DIFF同步)

当 `minCommittedLog` <= `peerListZxid` <= `maxCommittedLog`时，进行差异化同步。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_sync_diff.png)

1. Leader向Learner发送DIFF指令。

通知Learner进入差异化数据同步阶段，Leader即将把Proposal同步给自己。

2. Leader针对每个Proposal，先后发送PROPOSAL内容数据包和COMMIT指令数据包

Learner依次Proposal应用到内存数据库中。

3. Leader发送完差异事务数据后，立即向Learner发送NEWLEADER指令

NEWLEADER指令通知Learner，已经将committedLog中的Proposal都同步给Learner。

4. Learner向Leader反馈ACK消息

Learner向Leader反馈完成了对committedLog中Proposal的同步。

5. Leader进入“过半策略”等待阶段

Leader会和其他所有Learner服务器进行同样的数据同步流程，直到集群中由过半的Learner响应并反馈ACK消息。

6. 向所有已经完成数据同步的Learner发送UPTODATE指令

当收到过半Learner的ACK消息后，通知Learner集群中已经有过半机器完成了数据同步，已经具备对外服务的能力。

7. Learner再次向Leader反馈ACK。

### 先回滚再差异化同步(TRUNC + DIFF同步)

当Leader服务器发现某个Learner包含一条自己没有的事务记录，就需要让该Learner进行事务回滚--回滚到Leader服务器上存在的，最接近peerLastZxid的ZXID。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/zookeeper_trunc_diff_exampe.png)

```
在minCommittedLog <= peerLastZxid <= maxCommittedLog时，有一种特殊的情况：

1. 假设有A、B、C三台机器，此时B是Leader服务器，Leader_Epoch为5，当前已经被集群中绝大部分机器都提交的ZXID为:0x500000001和0x500000002。
2. 此时Leader正要处理ZXID: 0x500000003并且已经写入Leader本地事务日志，但是在要将该Proposal发送给其他Follower投票时Leader服务器宕机，Proposal没有被同步出去。
3. 此时ZooKeeper集群进行新一轮选举，产生的新的Leader是A，同时Leader_Epoch变更为6。
4. A和C继续提供服务，并提交了0x600000001和0x600000002两个事务。
5. 此时，服务器B再次启动，作为Follower连接至新的LeaderA，并开始同步数据。

此时，数据同步各值为：
- minCommittedLog: 0x500000001
- maxCommittedLog: 0x600000002
- peerLastZxid: 0x500000003
这种情况就需要进行TRUNC + DIFF同步，让Learner先TRUNC回滚到0x50000002，在DIFF同步至0x50000003。
```

### 仅回滚同步(TRUNC同步)

当peerLastZxid比Leader中maxCommittedLog大时，Leader会要求Learner回滚到ZXID值为maxCommittedLog对应的事务操作。

### 全量同步(SNAP同步)

当peerLastZxid小于minCommittedLog时，或者Leader服务器上没有提议缓存队列时，无法直接使用提议缓存队列和Learner进行数据同步。

只能进行全量同步(SNAP同步)，将本机上的全量内存数据都发送给Learner。

1. Leader服务器向Learner发送SNAP指令。

通知Learner即将进行全量数据同步。

2. ==Leader从内存数据库中**获取到全量数据节点和会话超时时间记录器，序列化后传输给Learner**。==

3. Learner接收到全量数据后，反序列化并载入。


