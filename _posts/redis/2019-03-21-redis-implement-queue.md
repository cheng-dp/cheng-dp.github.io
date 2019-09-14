---
layout: post
title: Redis实现异步队列、延时队列
categories: [Redis]
description: Redis实现异步队列、延时队列
keywords: Redis
---

### 如何使用Redis做异步队列、延时队列？

1. 一般使用list结构作为队列，rpush生产消息，lpop消费消息。当lpop没有消息的时候，要适当sleep一会再重试。

2. list还有个指令叫blpop，在没有消息的时候，它会阻塞住直到消息到来，这样不需要sleep。

3. 使用pub/sub主题订阅者模式，可以实现1:N的消息队列。缺点是在消费者下线的情况下，生产的消息会丢失。

4. 实现延时队列：

SortedSet的value存储任务描述、score存储时间戳。

利用SortedSet天然的排序特性，执行时刻最早的任务排在最前。

只需开一个或多个线程，每隔一段时间轮询检查SortedSet中score小于或等于当前时间戳的元素即可。

如果是多个线程去轮询这个Sorted Set，必须保证只有一个线程能执行这个任务，通过zrem命令来实现，==只有删除成功了，才能执行任务==，这样就能保证任务不被多个任务重复执行了。
