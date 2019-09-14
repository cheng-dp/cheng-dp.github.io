---
layout: post
title: Redis中键值对的存储结构与Key寻址
categories: [Redis]
description: Redis中键值对的存储结构与Key寻址
keywords: Redis
---

## 单机存储结构

1. redisServer

Redis服务器的所有数据库保存在redis.h/redisServer结构的db数组中：
```C
struct redisServer {
    //...
    redisDb *db; // 所有数据库的数组。
    int dbnum; // 数组大小，服务器的数据库数量。
    //...
};
```
![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_db.png)

dbnum默认值为16，即Redis服务器默认创建16个数据库。

2. redisDb

每个数据库由一个redis.h/redisDb结构表示:
```C
typedef struct redisDb {
    //...
    dict *dict; // 键空间
    dict *expires; // 过期字典
    //...
} redisDb;
```

redisDb存储了键空间即expires过期字典，通过dict键空间寻找键值对，通过比较当前时间和expires中记录的时间，确定键是否过期。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_db_with_expires.png)

```
expires和dict中指向的实际是同一个key和value，没有拷贝，上图中仅为了描述结构。
```

3. 存储键值对的dict字典

```C
typedef struct dict {
    dictType *type;
    void *privdata;
    dictht ht[2];
    int trehashidx;
} dict;

// ht属性是一个包含两个项的数组，数组中每个项都是一个dictht哈希表，一般情况下，字典只使用ht[0]，ht[1]只会在对ht[0]进行rehash时使用。
```
- 字典中带有两个哈希表，一个平时使用，另一个仅在rehash时使用。
- 哈希表使用链地址法解决冲突，并使用MurmurHash2算法计算哈希值。
- 在对哈希表进行扩展或收缩时，Redis需要执行rehash操作，将现有哈希表的所有键值对rehash到新哈希表中，并且rehash是渐进式完成的，不是一次完成的。

## 集群存储结构

1.  clusterNode

clusterNode是节点的基础结构，保存节点当前状态。

```C
struct clusterNode {
    //...
    //...
    // 二进制位数组，记录该节点指派了哪些槽
    unsigned char slots[16384/8];
    // 被指派槽总数
    int numslots;
}
```

其中二进制位数组记录了当前节点指派了哪些槽。

2. clusterState

clusterState记录了当前节点视角下的集群状态。

```C
typedef struct clusterState {

    //...
    //...

    // 集群中所有槽的指派信息
    clusterNode *slots[16384];
    
    // 保存槽和键关系的跳跃表
    zskiplist *slots_to_keys;
    
    // 槽迁移
    clusterNode *importing_slots_from[16384];
    clusterNode *migarting_slots_to[16384];
}
```

`clusterNode`数组记录了所有槽的指派信息。`importing_slots_from`和`importing_slots_to`记录了槽迁移信息。

3. clusterLink

clusterLink保存所有和其他节点的连接。

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

## 单机Key寻址

1. 根据客户select命令确定数据库。
2. 在数据库的dict中查找key，首先在ht[0]中查找，如果ht[0]没找到，则在ht[1]中查找。
3. 在ht中取出链表，遍历链表查找。

## 集群key寻址

1. 计算key对应的槽值

```python
def slot_number(key):
    return CRC16(key) & 16363
```

2. 查找clusterState.slots[i]，如果等于clusterState.myself，则执行命令。如果不等，则通过指向的clusterNode得到节点IP和端口，向客户端返回MOVED错误。

3. 槽所在的目标节点在数据库中查找key，如果没找到，可能正在执行槽迁移。

4. 查找clusterState.migrating_slots_to[i]，如果正在槽迁移，得到目标节点的ip和port，返回ASK错误。

