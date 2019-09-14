---
layout: post
title: Redis性能问题分析及优化
categories: [Redis]
description: Redis性能问题分析及优化
keywords: Redis
---

## 内存优化

```
$ info memory

# Memory
used_memory:8589645288
used_memory_human:8.00G
used_memory_rss:9439997952
used_memory_peak:9082282776
used_memory_peak_human:8.46G
used_memory_lua:35840
mem_fragmentation_ratio:1.10
mem_allocator:jemalloc-3.6.0
```


info | 解释
---|---
used_memory | Redis使用的内存总量，实际缓存占用的内存 + Redis自身运行占用的内存(元数据, lua 等)。
used\_memory\_rss | Redis占用的物理总内存，和top命令显示的进程占用一致。
mem\_fragmentation\_ratio | 内存碎片率 = used\_memory\_rss / used_memory。
used\_memory\_lua | Lua脚本引擎使用的内存大小。
mem_allocator | 编译时指定的Redis使用的内存分配器。

### 内存参数优化

1. maxmemory

默认值为0，即尽可能使用物理内存，并利用系统SWAP虚拟内存，性能将急剧下降。

设置maxmemory的值，通常为物理内存的70%。

2. maxmemory-policy

配合maxmemory，根据业务需求设置maxmemory-policy的值进行淘汰。

    - volatile-lru
    - volatile-ttl
    - volatile-random
    - allkeys-lru
    - allkeys-random
    - no-eviction  // 如非必要不要设置no-eviction

3. maxmemory-samples

Redis定时淘汰策略中，每次从db中随机抽取比较的元素数量，默认为5。


### 内存使用优化

1. 设置Key过期时间

2. 回收key(maxmemory-policy)

3. Key保持简短

4. 尽量使用紧凑的Hash结构

    如，保存用户数据时，使用一个用户ID作为key，所有用户的信息保存在一个hash中。而不是为用户的每个信息单独保存一个key-value。

5. 插入数据时考虑底层数据结构
    
    尽量使得ziplist不退化。

## 命令处理

```
$ info stats

# Stats
total_connections_received:843708918
total_commands_processed:3947987793
instantaneous_ops_per_sec:1360
total_net_input_bytes:5061895225788
total_net_output_bytes:13791028024582
instantaneous_input_kbps:1247.52
instantaneous_output_kbps:2756.92
rejected_connections:0
sync_full:2
sync_partial_ok:1
sync_partial_err:0
expired_keys:231544806
evicted_keys:0
keyspace_hits:613324172
keyspace_misses:252815503
pubsub_channels:0
pubsub_patterns:0
latest_fork_usec:60179
```

info stats命令可以查看目前Redis Server的命令处理情况和网络时延情况。

### 命令处理优化

1. 使用多参数命令
    
    - set -> mset
    - get -> mget
    - lset -> lpush, rpush
    - lindex -> lrange
    - hset -> hmset
    - hget -> hmget

2. 使用pipeline管道

3. 使用lua脚本

4. 优化命令使用

    - ==不要把list当做列表使用，仅当做队列使用==
    - 将排序、并集、交集等操作放在客户端执行
    - 禁止使用操作大量key的长耗时命令，如keys
    - 使用SCAN类的迭代命令遍历所有元素。(SSCAN / HSCAN / ZSCAN)

5. 配置慢查询 (Slog Log)

    - slowlog-log-slower-than xxxms // 执行时间慢于xxx毫秒的命令计入Slog Log
    - slowlog-max-len xxx # Slog Log最大记录命令数目


## 连接优化

1. 限制单个Server客户端连接数，监控客户端连接

2. 增加Slave从节点，分担数据读取。

3. 使用Redis Cluster对连接分片。

https://www.cnblogs.com/chenpingzhao/p/6859041.html