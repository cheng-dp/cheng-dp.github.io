---
layout: post
title: Redis Cluster
categories: [Redis]
description: Redis Cluster
keywords: Redis
---

Redis在启动时根据`cluster-enabled`配置决定是否开启服务器集群配置。

一个Redis集群由多个节点(node)组成，一个节点就是一个运行在集群模式下的Redis服务器。

## 集群数据结构

#### clusterNode和clusterLink

clusterNode是节点的基础结构，保存节点当前状态。

```C
struct clusterNode {
    // 节点创建的时间
    mstime_t ctime;
    // 节点名称
    char name[REDIS_CLUSTER_NAMELEN];
    // 节点标识
    // 不同标识值记录的节点角色(主节点/从节点)及节点状态(在线/下线)
    int flags;
    // 当前配置纪元
    uint_64 configEpoch;
    
    // 节点IP地址
    char ip[REDIS_IP_STR_LEN];
    // 节点端口号
    int port;
    
    // 保存连接节点所需的有关信息
    clusterLink *link;
    
    // 二进制位数组，记录该节点指派了哪些槽
    unsigned char slots[16384/8];
    // 被指派槽总数
    int numslots;
}
```

二进制位数组`slots`记录该节点指派了哪些槽。

clusterLink保存所有与其他节点的连接信息。

```C
typedef struct clusterLink {
    // 连接创建时间
    mstime_t ctime;
    // TCP套接字描述符
    int fd;
    // 输出缓冲区
    sds sndbuf;
    // 输入缓冲区
    sds rcvbuf;
    // 与该连接相关联的节点
    struct clusterNode *node;
}
```

#### clusterState

每个节点保存一个clusterState结构，记录当前节点视角下的集群状态：

```C
typedef struct clusterState {

    // 指向当前节点的指针
    clusterNode *myself;
    
    // 集群当前的配置纪元
    uint64_t currentEpoch;
    // 集群当前状态(在线/下线)
    
    int state;
    // 集群中至少已分配一个槽的节点的数量
    int size;
    
    //集群节点列表，包括myself
    dict *nodes;
    
    // 集群中所有槽的指派信息
    clusterNode *slots[16384];
    
    // 保存槽和键关系的跳跃表
    zskiplist *slots_to_keys;
    
    // 槽重新分配节点信息
    clusterNode *importing_slots_from[16384];
    clusterNode *migarting_slots_to[16384];
}
```

- `clusterNode *slots[16384]`记录每个槽的分配信息。
- `importing_slots_from`和`migrating_slots_to`记录槽重新分片信息。
- `zskiplist *slots_to_keys`保存槽到键的关系，能够快速得到槽的所有键。


## 集群创建及重新分片(槽迁移)

### 集群创建

1. 客户端向节点A发送 `CLUSTER MEET <ip> <port>`。
2. 节点A与ip:port上的节点B建立连接，进行三次握手，将节点B加入集群。
3. 客户端通过`CLUSTER ADDSLOTS <slot> [slot ...]`命令分配槽。
4. 当完成所有16384个槽的分配后，集群创建完毕，处于上线状态。
5. 执行集群命令。

#### CLUSTER MEET和三次握手

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_meet_shakehand.png)

三次握手中分别发送MEET、PONG、PING消息。

#### CLUSTER ADDSLOTS 槽分配

CLUSTER ADDSLOTS命令将一个或多个槽指派给节点。
```
CLUSTER ADDSLOTS <slot> [slot ...]
// 127.0.0.1:7000> CLUSTER ADDSLOTS 0 1 2 3 4 ... 5000 //将1到5000槽指派给127.0.0.1:7000.
```

节点被指派槽后，更新本地clusterNode和clusterState中的槽信息，并向其他节点发送自己负责的槽信息。

```
struct clusterNode {
    // ...
    unsigned char slots[16384/8];
    int numslots;
    // ...
}
```

```
typedef struct clusterState {
    // ...
    clusterNode *slots[16384];
    // ...
}
```
#### 执行集群命令

1. 计算键所在的槽

```python
def slot_number(key):
    return CRC16(key) & 16363
```
计算键的CRC-16校验和，并得到一个0到16383之间的整数及槽号。

2. 得到槽所在的节点

查找`clusterState.slots[i]`，如果等于clusterState.myself，则执行命令。

如果不等，向客户端返回MOVED错误。

3. MOVED错误

```
MOVED <slot_num> <ip>:<port>
```
客户端根据返回的MOVED中ip和port重新连接槽所在的正确节点。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_command_process.png)

### 重新分片(槽迁移)

重新分片由Redis集群管理软件redis-trib执行。重新分片可以在线执行，集群无需下线。

1. 让目标节点准备好导入新槽的键值对。

```
CLUSTER SETSLOT <slot> IMPORTING <source_id>
```

2. 让源节点准备好迁移键值对。

```
CLUSTER SETSLOT <slot> MIGRATING <target_id>
```

3. 获取源节点迁移槽的键值对

```
CLUSTER GETKEYSINSLOT <slot> <count>
```

4. 对每个key，向源节点发送迁移命令

```
MIGRATE <target_id> <target_port> <key_name> 0 <timeout>
```

5. 完整所有键值对迁移后，向集群中任意节点发送新的槽指派信息，最终所有节点都会更新本地分片信息。

```
CLUSTER SETSLOT <slot> NODE <target_id>
```

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_migrate_slot_keys.png)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_migrate_slot.png)

#### ASK错误

当客户端命令要处理的键正好属于正在迁移的槽时：

- 数据库中能找到key，直接执行并返回结果。
- 数据库中没找到key，查找`clusterNode* migrating_slots_to[i]`。
- `migrating_slots_to`中有值，键已被迁移，向客户端返回ASK错误，指向迁移目标节点。
- `migrating_slot_to`中没有值，则键不存在。

```
ASK <slot> <ip>:<port>
```

#### ASKING命令

客户端接收到ASK错误后，转向连接新节点，并先向新节点发送ASKING命令。

ASKING命令是一次性命令，仅对下一个命令有效，表明下一个命令查询的键是正在执行槽迁移的槽中的键。

如果不发送ASKING命令，由于此时槽迁移未完成，槽没有重新指派，新的目标节点计算槽号后，将返回MOVED错误。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_ask_asking.png)


## 复制、故障检测及故障转移

### 复制

```
//复制命令
CLUSTER REPLICATE <node_id> // 设置本节点为目标节点的从节点。
```

```C
struct clusterNode {
    // 如果节点是从节点，指向主节点
    struct clusterNode *slaveof;
    
    // 如果是主节点
    //正在复制该主节点的从节点数量
    int numslaves;
    // 正在复制该主节点的从节点clusterNode数组
    struct clusterNode **slaves;
}
```

### 故障检测

1. 每个节点定期(默认一秒)向其他节点发送**PING消息**。

2. 规定时间没有收到**PONG回复**，则标记为**疑似下线(probable fail, PFAIL)**。

3. 集群中通过**GOSSIP消息**(PING、PONG、MEET)交换节点状态信息，每个节点记录其他节点的**下线报告**。

4. 当接收到报告目标节点下线的主节点数目大于总数目一半时，标记目标节点为**已下线(FAIL)**。

5. ==向集群广播**FAIL消息**。==

### 故障转移

当一个从节点发现其复制的主节点已下线时，从节点开始对主节点执行故障转移操作。

#### 选举

```
Redis集群中选举新的主节点方法和选举领头Sentinel的方法相似，都是基于RAFT算法的领头选举(leader election)。
```

```
1.slave发现自己的master变为FAIL
2.将自己记录的集群currentEpoch加1，并广播FAILOVER_AUTH_REQUEST信息
3.其他节点收到该信息，只有master响应，判断请求者的合法性，并发送FAILOVER_AUTH_ACK，对每一个epoch只发送一次ack
4.尝试failover的slave收集FAILOVER_AUTH_ACK
5.超过半数后变成新Master
6.广播PONG通知其他集群节点。
```

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_election_new_master.png)

选举新的主节点和选举领头Sentinel的区别：

1. 发起选举的是标记主节点下线的从节点。(Sentinel: 发起选举的是标记主节点客观下线的Sentinel节点)。
2. 投票的是其他主节点。(投票的是其他Sentinel)。
3. 选举出的从节点主动替换下线主节点，并向其他从节点发送命令。(投票出的Sentinel筛选从节点，选出替换节点并向其他节点发送命令)。

#### 转移

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_down_move.png)

## 集群的消息机制

- MEET
- PING
- PONG
- FAIL
- PUBLISH

### 消息种类

1. MEET消息
    
发送者接收到客户端发送的CLUSTER MEET命令时，会向接受者发送MEET消息，请求接受者加入到发送者所处的集群。

2. PING消息

==集群中每个节点默认每隔一秒从已知节点列表中**随机选出五个节点**，对这五个节点中**最长时间没有发送过PING消息**的节点发送PING消息。==检测被选中的节点是否在线。

此外，如果距离收到某个目标节点发送的PONG消息时间超过设置的`cluster-node-timeout`的一半，节点也会向目标节点发送PING消息。

3. PONG消息

当接收到MEET消息或PING消息时，节点回复PONG消息。

节点也可以向集群广播PONG消息来让集群中的其他节点刷新关于发送者节点的认识，例如当完成一次故障转移之后，新的主节点向集群广播PONG消息让其他节点知道该节点已经变成主节点。

4. FAIL消息

==当一个主节点判断另一个节点已经进入FAIL状态，会向集群广播FAIL消息，所有收到这条消息的节点都会立即将对应节点标记为已下线。==

5. PUBLISH消息

当节点收到一个PUBLISH命令时，会执行这个命令(向命令指定的channel发布指定的message)、并向集群广播该PUBLISH消息。

所有接受到这条PUBLISH消息的节点都会执行相同的PUBLISH命令。

```
Redis集群基于Gossip协议交换节点状态信息，MEET、PING、PONG三种消息实现了Gossip协议，MEET、PING、PONG消息中包含源节点已知节点的状态信息。
```

### 消息格式

#### 消息头

```C
typedef struct {
    // 消息长度
    uint32_t totlen;
    // 消息类型
    uint16_t type;
    
    // 消息正文包含的节点信息数量
    // 只在发送Gossip协议消息(MEET、PING、PONG)时使用
    uint16_t count;
    
    // 发送者所处的配置纪元
    uint64_t currentEpoch;
    // 发送者的配置纪元或发送者的主节点的配置纪元
    uint64_t configEpoch;
    
    // 发送者的ID
    char sender[REDIS_CLUSTER_NAMELEN];

    // 发送者的槽指派信息
    unsigned char myslots[REDIS_CLUSTER_SLOTS/8];
    
    // 如果是从节点，其主节点的ID
    char slaveof[REDIS_CLUSTER_NAMELEN];
    
    // 发送者的端口号
    uint16_t port;
    
    // 发送者的标识值
    uint16_t flags;
    
    // 发送者的集群状态
    unsigned char state;
    
    // 消息的正文
    union clusterMsgData data; // 是一个union
}
```

#### 消息正文

clusterMsg.data指向的联合`cluster.h/clusterMsgData`就是消息正文。

```C
union clusterMsgData {

    // MEET、PING、PONG消息的正文
    struct {
        clusterMsgDataGossip gossip[1];
    } ping;
    
    //FAIL消息的正文
    struct {
        clusterMsgDataFail about;
    } fail;
    
    // PUBLISH消息的正文
    struct {
        clusterMsgDataPublish msg;
    } publish;
    
    // 其他消息正文
}
```

#### MEET、PING、PONG消息的实现

MEET、PING、PONG消息的正文都由`clusterMsgDataGossip`组成，消息的具体类型由消息头中得type属性区分。
```C
// MEET、PING、PONG消息的正文
struct {
    clusterMsgDataGossip gossip[1];
} ping;
```

==之所以说MEET、PING、PONG消息实现了Gossip协议，是因为每次发送MEET、PING、PONG消息时，都会**同时发送已知节点的状态信息**。==

发送者会从自己的已知节点列表中随机选出两个节点，构造clusterMsgDataGossip结构并保存到消息正文的gossip数组中。

```C
typedef struct {
    // 节点的名字
    char nodename[REDIS_CLUSTER_NAMELEN];
    
    // 最后一次向该节点发送PING消息的时间戳
    uint32_t ping_sent;
    // 最后一次从该节点接收到PONG消息的时间戳
    uint32_t pong_received;
    
    // 节点的IP地址和端口号
    char ip[16];
    uint16_t port;
    
    // 节点的标识值
    uint16_t flags;
} clusterMsgDataGossip;
```

接受者会访问消息中的该数组，并进行操作：
- 如果消息正文的节点不在接受者已知节点列表中，接受者将与对应节点进行握手。
- 如果消息正文的节点在已知列表中，接受者将更新对应的clusterNode结构。


例子：

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_cluster_gossip_example.png)

#### FAIL消息的实现

FAIL消息只包含下线节点的名字。

```C
typedef struct {
    char nodename[REDFIS_CLUSTER_NAMELEN];
} clusterMsgDataFail;
```

==由于Gossip协议需要一定时间才能传播至整个集群，而FAIL消息需要立即让所有节点知道下线信息，因此FAIL消息直接由源节点对集群广播。==

#### PUBLISH消息实现

当客户端向集群中的某个节点发送：
```
PUBLISH <channel> <message> //向channel频道发送消息message
```
目标节点会执行该命令，同时会向集群广播该PUBLISH消息，所有接受到这条PUBLISH消息的节点也会执行该命令。

PUBLISH消息只包含channel和message信息：
```C
typedef struct {
    uint32_t channel_len;
    uint32_t message_len;
    usigned char bulk_data[8];//实际长度由保存内容决定。
}
```
 
```
本文地址：https://cheng-dp.github.io/2019/03/25/redis-cluster/
```
 
