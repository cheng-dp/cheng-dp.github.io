---
layout: post
title: 过期数据清理及数据淘汰策略
categories: [Redis]
description: 过期数据清理及数据淘汰策略
keywords: Redis
---

## 过期数据清理

### 过期时间设置

Redis有四个命令设置键的生存时间：

命令 | 解释
---|---
EXPIRE <key> <ttl> | 将键key的生存时间设置为ttl秒
PEXPIRE <key> <ttl> | 将键key的生存时间设置为ttl毫秒
EXPIREAT <key> <timestamp> | 将键key的过期时间设置为timestamp秒数时间戳
PEXPIREAT <key> <timestamp> | 将键key的过期时间设置为timestamp毫秒数时间戳

移除过期时间：

命令 | 解释
---|---
PERSIST <key> | 移除键key的过期时间

### 底层实现

redisDb结构中的expires字典保存了数据库中所有键的过期时间，称作过期字典。
```C
typedef struct redisDb {
    //...
    dict *dict; // 键空间
    dict *expires; // 过期字典
} redisDb;
```
![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_db_with_expires.png)

Redis就是通过将当前时间和expires中记录的时间对比，确定键是否过期。


### 过期键的删除策略

过期键的删除策略可以有：

1. 定时删除

在设置键过期的同时，创建一个定时器(timer)，定时器在键过期时间来临时，删除键。

优点：内存最友好。  
缺点：创建大量定时器，大量占用CPU时间，对数据库不现实。

2. 惰性删除

每次从键空间获取键时，才检查键是否过期。

优点：CPU时间最友好。  
缺点：内存最不友好。

3. 定期删除

每隔一段时间，检查一次数据库，删除过期键。

优点： 是前两种的折中，减少对CPU时间影响，减少内存浪费。
缺点：难以确定删除操作执行时长和频率。

### Redis中的删除策略

Redis实际使用的是：  
**惰性删除 + 定期删除**

#### 惰性删除

1. `db.c/expireIfNeeded`函数检查输入键是否过期并删除过期键。
2. 所有读写数据库的Redis命令执行前都会调用`expireIfNeeded`。

#### 定期删除

`redis.c/activeExpireCycle`函数实现定期删除。Redis服务器周期性操作`redis.c/serverCron`函数执行时会调用`activeExpireCycle`函数。

`activeExpireCycle`函数在规定时间内，*分多次*遍历服务器中的各个数据库，从数据库的expires字典中*随机检查*一部分键的过期时间并删除过期键。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_expires_activeExpireCycle.png)

1. 每次运行，从**一定数量的数据**库中**随机选择键**检查并删除过期键。
2. current_db记录当前检查的数据库编号，并在下一次调用时，接着上一次的进度进行处理。
3. 服务器中所有数据库检查一遍后，current_db重置为0，开始新一轮检查。


## 数据淘汰策略

```
maxmemory <bytes>
maxmemory-policy <policy>
```
Redis可以通过`maxmemory <bytes>`配置允许用户使用的最大内存大小。当内存数据集大小达到最大内存大小时，Redis会根据`maxmemory-policy <policy>`配置的策略进行数据淘汰，直到内存大小小于最大内存大小。

Redis在==每次命令执行前==，调用`freeMemoryIfNeeded`函数，判断是否需要释放内存并执行释放操作。

### 淘汰策略

##### volatile-lru

从已设置过期时间的数据集(server.db[i].expires)中**随机挑选**最近最少使用的数据淘汰。
```
每一个redis对象结构redisObject中都记录了lru(最近访问时间)。
```

##### volatile-ttl

从已设置过期时间的数据集(server.db[i].expires)中**随机挑选**将要过期的数据淘汰。

##### volatile-random

从已设置过期时间的数据集(server.db[i].expires)随机选择数据表淘汰。

##### allkeys-lru

从所有数据(server.db[i].dict)中挑选最近最少使用的数据淘汰。

##### allkeys-random

从所有数据(server.db[i].dict)中任意选择数据淘汰。

##### no-eviction

禁止淘汰数据

### 淘汰代码

1. 对每一个db都会运行一次淘汰策略。
2. `lru`在数据集中随机挑选几个(`maxmemory_samples`)键值对，取出其==lru最大的键值对==进行淘汰。
3. `ttl`在数据集中随机挑选几个(`maxmemory_samples`)键值对，取出其中==ttl最大的键值对==淘汰。
3. `volatile`对应`server.db[i].expires`，`allkeys`对应`server.db[i].dict`。


```C
int freeMemoryIfNeeded() {
    ...
    // 计算mem_used
    mem_used = zmalloc_used_memory();
    ...

    /* Check if we are over the memory limit. */
    if (mem_used <= server.maxmemory) return REDIS_OK;

    // 如果禁止逐出，返回错误
    if (server.maxmemory_policy == REDIS_MAXMEMORY_NO_EVICTION)
        return REDIS_ERR; /* We need to free memory, but policy forbids. */

    mem_freed = 0;
    mem_tofree = mem_used - server.maxmemory;
    long long start = ustime();
    latencyStartMonitor(latency);
    while (mem_freed < mem_tofree) {
        int j, k, keys_freed = 0;

        for (j = 0; j < server.dbnum; j++) {
            // 根据逐出策略的不同，选出待逐出的数据
            long bestval = 0; /* just to prevent warning */
            sds bestkey = NULL;
            struct dictEntry *de;
            redisDb *db = server.db+j;
            dict *dict;

            if (server.maxmemory_policy == REDIS_MAXMEMORY_ALLKEYS_LRU ||
                server.maxmemory_policy == REDIS_MAXMEMORY_ALLKEYS_RANDOM)
            {
                dict = server.db[j].dict;
            } else {
                dict = server.db[j].expires;
            }
            if (dictSize(dict) == 0) continue;

            /* volatile-random and allkeys-random policy */
            if (server.maxmemory_policy == REDIS_MAXMEMORY_ALLKEYS_RANDOM ||
                server.maxmemory_policy == REDIS_MAXMEMORY_VOLATILE_RANDOM)
            {
                de = dictGetRandomKey(dict);
                bestkey = dictGetKey(de);
            }

            /* volatile-lru and allkeys-lru policy */
            else if (server.maxmemory_policy == REDIS_MAXMEMORY_ALLKEYS_LRU ||
                server.maxmemory_policy == REDIS_MAXMEMORY_VOLATILE_LRU)
            {
                for (k = 0; k < server.maxmemory_samples; k++) {
                    sds thiskey;
                    long thisval;
                    robj *o;

                    de = dictGetRandomKey(dict);
                    thiskey = dictGetKey(de);
                    /* When policy is volatile-lru we need an additional lookup
                     * to locate the real key, as dict is set to db->expires.  **/
                    if (server.maxmemory_policy == REDIS_MAXMEMORY_VOLATILE_LRU)
                        de = dictFind(db->dict, thiskey);
                    o = dictGetVal(de);
                    thisval = estimateObjectIdleTime(o);

                    /* Higher idle time is better candidate for deletion */
                    if (bestkey == NULL || thisval > bestval) {
                        bestkey = thiskey;
                        bestval = thisval;
                    }
                }
            }

            /* volatile-ttl */
            else if (server.maxmemory_policy == REDIS_MAXMEMORY_VOLATILE_TTL) {
                for (k = 0; k < server.maxmemory_samples; k++) {
                    sds thiskey;
                    long thisval;

                    de = dictGetRandomKey(dict);
                    thiskey = dictGetKey(de);
                    thisval = (long) dictGetVal(de);

                    /* Expire sooner (minor expire unix timestamp) is better
                     * candidate for deletion **/
                    if (bestkey == NULL || thisval < bestval) {
                        bestkey = thiskey;
                        bestval = thisval;
                    }
                }
            }

            /* Finally remove the selected key. **/
            // 逐出挑选出的数据
            if (bestkey ) {
                ...
                delta = (long long) zmalloc_used_memory();
                dbDelete(db,keyobj);
                delta -= (long long) zmalloc_used_memory();
                mem_freed += delta;
                ...
            }
        }
        ...
    }
    ...
    return REDIS_OK;
}
```
## Java实现LRU算法

维护一个链表，当数据每一次查询就将数据放到链表的head，当有新数据添加时也放到head上。这样链表的tail就是最久没用使用的缓存数据，每次容量不足的时候就可以删除tail，并将前一个元素设置为tail。

```java
class LRUNode { 
    String key;
    Object value;
    LRUNode prev;
    LRUNode next;
    public LRUNode(String key, Object value) {
        this.key = key;
        this.value = value;
    }
}

public class LRUCache {
    private HashMap<String, LRUNode> map;
    private int capacity;
    private LRUNode head;
    private LRUNode tail;
    public void set(String key, Object value) {
        LRUNode node = map.get(key);
        if (node != null) {
            node = map.get(key);
            node.value = value;
            remove(node, false);
        } else {
            node = new LRUNode(key, value);
            if (map.size() >= capacity) {
                // 每次容量不足时先删除最久未使用的元素
                remove(tail, true);
            }
            map.put(key, node);
        }
        // 将刚添加的元素设置为head
        setHead(node);
    }
    public Object get(String key) {
        LRUNode node = map.get(key);
        if (node != null) {
            // 将刚操作的元素放到head
            remove(node, false);
            setHead(node);
            return node.value;
        }
        return null;
    }
    private void setHead(LRUNode node) {
        // 先从链表中删除该元素
        if (head != null) {
            node.next = head;
            head.prev = node;
        }
        head = node;
        if (tail == null) {
            tail = node;
        }
    }
    // 从链表中删除此Node，此时要注意该Node是head或者是tail的情形
    private void remove(LRUNode node, boolean flag) {
        if (node.prev != null) {
            node.prev.next = node.next;
        } else {
            head = node.next;
        }
        if (node.next != null) {
            node.next.prev = node.prev;
        } else {
            tail = node.prev;
        }
        node.next = null;
        node.prev = null;
        if (flag) {
            map.remove(node.key);
        }
    }
    public LRUCache(int capacity) {
        this.capacity = capacity;
        this.map = new HashMap<String, LRUNode>();
    }
}
```

https://yq.aliyun.com/articles/257459

https://wiki.jikexueyuan.com/project/redis/data-elimination-mechanism.html

https://github.com/bingbo/blog/wiki/Redis%E6%95%B0%E6%8D%AE%E6%B7%98%E6%B1%B0%E6%9C%BA%E5%88%B6
 
```
本文地址：https://cheng-dp.github.io/2019/03/23/redis-data-expire-clean/
```
 
