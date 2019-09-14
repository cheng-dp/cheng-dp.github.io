---
layout: post
title: 管道(pipeline)、事务(transaction)和Lua脚本
categories: [Redis]
description: 管道(pipeline)、事务(transaction)和Lua脚本
keywords: Redis
---

## 管道 pipeline

- Redis普通命令遵从客户端-服务器端模型，一个命令需要一个RTT(Round Trp Time, 往返时间)。
- 在服务器端对socket进行读写需要切换用户态和内核态，当命令数量较多时，将造成很多不必要的开销。

Redis提供了批量操作命令(mget、mset等)有效节约了RTT，但是大部分命令是不支持批量操作的，因此Redis提供了Pipeline机制。

Pipeline机制将一组Redis命令进行组装，通过一次RTT传输给Redis，再将执行结果按顺序返回给客户端。

原生批量命令和Pipeline的区别：
- 原生批量命令是原子的，**Pipeline是非原子**的。
- 原生批量命令一个命令对应多个key，pipeline支持多个命令。
- 原生批量命令是Redis服务端支持实现的，而Pipeline需要服务端和客户端共同实现。

## 事务 transaction

Redis支持简单的事务功能，在`multi`和`exec`之间的命令将被统一提交并**原子地**按顺序执行。

- multi : 开始事务
- exec : 提交并执行
- discard : 丢弃事务
- watch : 在事务执行前保证key不会被其他客户端修改

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_tx_code_1.png)
![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_tx_code_2.png)

### 事务中命令出错

1. 语法错误

语法错误的事务将无法提交。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_tx_error_code_1.png)

2. 运行时错误

对运行时错误的命令会返回错误，但是不会影响事务中其他命令的执行，也不支持回滚。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_tx_error_code_2.png)

```
为什么不支持回滚？
对于语法错误，事务将不会被提交。
对于运行时错误，只有对某个键执行不符合其类型的命令时才会发生，也就是程序代码错误，这种错误只有在开发阶段才会发生，很少在生环境中发生。
因此，为了保持Redis的简单性，不提供回滚功能。
```

### watch命令

有些应用场景需要在事务执行前，确保事务中的key没有被其他客户端修改过才执行，否则不执行(乐观锁)。

Redis提供了watch命令解决这个问题。在multi之前watch的key，如果被其他客户端修改过，exec命令将返回nil，表示命令没有被执行。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_tx_watch_code.png)

## Lua脚本

Redis支持**原子地**利用Lua脚本操作键值对。

1. eval

```
eval 脚本内容 key个数 key列表 参数列表
```
将脚本内容及key、参数原子地提交至Redis服务器并执行。

2. script load

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_lua_script_load_code.png)

将脚本内容加载存储到Redis内存，该命令将返回脚本内容的SHA1校验和。

3. evalsha

```
evalsha 脚本SHA1值 key个数 key列表 参数列表
```
通过SHA1校验和值，调用script load加载的脚本并原子地执行。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_lua_evalsha_code.png)