---
layout: post
title: Redis实现分布式锁
categories: [Redis]
description: Redis实现分布式锁
keywords: Redis
---

## 单节点实现分布式锁

为了确保分布式锁可用，单节点分布式锁实现应同时满足以下四个条件：

1. 互斥性。在任意时刻，只能有一个客户端能持有锁。

2. 不会死锁。即使客户端在持有锁时崩溃，没有主动解锁，也能保证后续其他客户端能加锁。

3. 加锁和解锁必须是同一个客户端。

### Redisson实现单节点分布式锁

#### 加锁

```lua
# lua脚本
if(redis.call('exists', KEYS[1]) == 0) then
    redis.call('hset', KEYS[1], ARGV[2], 1);
    redis.call('expire', KEYS[1], ARGV[1]);
    return nil;
end;

if(redis.call('hexists', KEYS[1], ARGV[2]) == 1) then
    redis.call('hincrby', KEYS[1], ARGV[2], 1);
    redis.call('expire', KEYS[1], ARGV[1]);
    return nil;
end;
```
- KEYS[1] 为加锁的Key，就是锁的ID。
- ARGV[1] 为锁的生存时间，默认为30秒。
- ARGV[2] 为客户端的ID，例如：8743c9c0-0795-4907-87fd-6c719a6b4586

##### 第一个if语句

当key不存在时，利用hset加锁，key为客户端ID，value设置为1，并设置过期时间。

```
// KEYS[1] = "myLock"
// ARGV[1] = "743c9c0-0795-4907-87fd-6c719a6b4586"
myLock:
{
    "8743c9c0-0795-4907-87fd-6c719a6b4586": 1
}
```

第一个if语句实现了**锁互斥**及**防止锁死锁**。

##### 第二个if语句

key已存在时，如果value值为本客户端ID，则`hincrby`为value值加一，并重设过期时间。
```
myLock:
{
    "8743c9c0-0795-4907-87fd-6c719a6b4586": 2
}
```
`hincrby`后，value值变为2，表示锁重入。

第二个if语句实现了**可重入锁**。

#### 解锁

1. 同样利用lua脚本保证原子性。
2. 数据中客户端ID要和解锁客户端一致。
2. 每次对value值减一。
3. 当value值减为0时，从redis中删除这个key。

#### watch dog自动延期机制

如果客户端加锁的时间超过expire为锁设定的生存时间，怎么办？

只要客户端加锁成功，会启动一个watch dog看门狗，每隔10秒检查客户端是否还持有锁，并不断延长锁key的生存时间。

#### 单节点Redis分布式锁的问题

当在某个master节点上加锁，还未来得及复制给slave时，master宕机、主备切换。

此时，新客户端在新的master上判断没加锁、并完成加锁操作，而老客户端还未释放锁。

即：在redis master宕机时，可能导致多个客户端同时完成加锁。


## Redis多节点实现分布式锁

基于单节点实现的分布式锁，当节点宕机时，锁服务就不可用，且主从切换可能导致锁安全性丧失。

针对单节点的问题，Redis的作者antirez提出了**RedLock算法**，基于多节点实现分布式锁。

### RedLock算法

RedLock(Redis Distribution Lock)算法基于多个(通常设置为5)完全独立的Redis节点实现分布式锁。

#### 获取锁：

1. 获取当前时间。
2. 依序向每个Redis节点执行获取锁的操作。和单节点时相同，设置锁结构包含**客户端ID**、设置**锁过期时间**。
3. 当某个Redis节点不可用或者获取锁超时，立即尝试下一个Redis节点。
4. 如果从大多数Redis节点(>=N/2+1)成功获取锁，且总耗时(最终时间减-开始时间)没超过锁有效时间，则获取分布式锁成功，否则算失败。
5. 如果获取成功，重新计算锁有效时间 = 锁有效时间 - 总耗时
6. 如果获取失败，向所有Redis节点发起释放锁操作。

#### 释放锁：

向所有Redis节点发起释放锁操作 (和单节点相同)。

```
为什么要向所有锁发起释放操作 ?

网络不稳定导致客户端对服务器通信正常、服务器对客户端却通信不正常，导致明明已加锁，客户端却认为没加锁。
```

#### 延迟重启：

```
假设有5个节点：A, B, C, D, E，如果客户端1锁住了A, B, C, 此时节点C崩溃，且未来得及持久化锁命令，C重启后客户端2锁住了C, D, E，此时客户端1和客户端2都持有锁。
```

为了防止节点崩溃造成上面的锁失效情况，antirez提出了延迟重启(delayed restarts)概念：

**节点崩溃后，应等待大于锁有效时间后，才能重启。**

这样重启前参与的锁都已过期，不会对现有锁造成影响。



### RedLock算法的问题

1. 没有像Redission一样的watch dog机制，无法保证客户端操作一直持有锁。

如果客户端长期阻塞直至锁过期，则接下来访问共享资源就没有锁保护。以及，获取锁的过程消耗了较长时间，重新计算出来的剩余锁有效时间很短、以至于客户端无法完成共享资源的访问，此时无法进行下一步抉择，可能需要直接释放锁。

2. 成功获取锁后，客户端无法感知是否依然持有锁。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_redlock_issue.png)

3. 系统依赖于计时假设(timing assumption)。

好的分布式算法应该基于异步模型(asynchronous model), 算法的安全性不应该依赖于任何计时假设(timing assumption)。

```
在异步模型中：进程可能pause任意长的时间，消息可能在网络中延迟任意长的时间，甚至丢失，系统时钟也可能以任意方式出错。一个好的分布式算法，这些因素不应该影响它的安全性(safety property)，只可能影响到它的活性(liveness property)，也就是说，即使在非常极端的情况下（比如系统时钟严重错误），算法顶多是不能在有限的时间内给出结果而已，而不应该给出错误的结果。这样的算法在现实中是存在的，像比较著名的Paxos，或Raft。但显然按这个标准的话，Redlock的安全性级别是达不到的。
```

```

在Martin的这篇文章中，还有一个很有见地的观点，就是对锁的用途的区分。他把锁的用途分为两种：

为了效率(efficiency)，协调各个客户端避免做重复的工作。即使锁偶尔失效了，只是可能把某些操作多做一遍而已，不会产生其它的不良后果。比如重复发送了一封同样的email。
为了正确性(correctness)。在任何情况下都不允许锁失效的情况发生，因为一旦发生，就可能意味着数据不一致(inconsistency)，数据丢失，文件损坏，或者其它严重的问题。


最后，Martin得出了如下的结论：

如果是为了效率(efficiency)而使用分布式锁，允许锁的偶尔失效，那么使用单Redis节点的锁方案就足够了，简单而且效率高。Redlock则是个过重的实现(heavyweight)。
如果是为了正确性(correctness)在很严肃的场合使用分布式锁，那么不要使用Redlock。它不是建立在异步模型上的一个足够强的算法，它对于系统模型的假设中包含很多危险的成分(对于timing)。而且，它没有一个机制能够提供fencing token。那应该使用什么技术呢？Martin认为，应该考虑类似Zookeeper的方案，或者支持事务的数据库。

```



## REFS

- https://juejin.im/post/5bf3f15851882526a643e207
- http://zhangtielei.com/posts/blog-redlock-reasoning.html
- http://zhangtielei.com/posts/blog-redlock-reasoning-part2.html
 
```
本文地址：https://cheng-dp.github.io/2019/03/13/redis-implement-distri-lock/
```
 
