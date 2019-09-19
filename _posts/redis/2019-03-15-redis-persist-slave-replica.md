---
layout: post
title: Redis持久化及主从复制
categories: [Redis]
description: Redis持久化及主从复制
keywords: Redis
---

## Redis持久化

### RDB(Redis DataBase)持久化

1. RDB机制将当前内存中的数据集写入磁盘。恢复时将RDB文件直接读取到内存。

2. RDB主要设置**周期性**的触发备份，适用于灾难恢复。

3. RDB文件是一个经过压缩的二进制文件。

#### RDB创建和载入

SAVE：

1. 阻塞Redis服务器进程，直到RDB文件创建完成，无法处理任何其他请求。
2. 拒绝所有客户端发送的命令。

BGSAVE:

1. 派生(fork)出子**进程**创建RDB文件，父进程继续处理命令请求。
2. 期间拒绝客户端发送的SAVE/BGSAVE命令。

RDB载入:

1. 服务启动时自动发现和识别载入RDB文件，不提供载入命令。
2. 载入过程中阻塞其他命令。
3. 如果有AOF文件且未关闭AOF功能，优先使用AOF。

#### 自动持久化配置

自动持久化在redis.conf文件中配置，格式为`save m n`：

```
save 900 1
save 300 10
save 60 10000
```

1. m秒内数据集存在大于等于n次修改时，自动触发BGSAVE。

2. 可同时配置多个条件，满足其一即可。

```C
// 保存条件
for saveparam : saveparams {
    if server.dirty >= saveparam.changes & save_interval > saveparam.seconds {
        BGSAVE();   
    }   
}
```

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_bgsave_conditions.png)

#### RDB文件结构

1. RDB结构

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_rdb_structure.png)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_rdb_two_databases.png)

- REDIS: 常量
- db_version: 版本号
- databases：包含所有数据库数据
- EOF：常量，数据库数据结束标志
- check_sum：校验和

2. databases

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_rdb_databases.png)

- SELECTDB：常量，表示一个database开始
- db_number：该数据库在redis中的编号
- key_value_pairs: 键值对数据


#### RDB 优势和劣势

##### 优势

1. RDB文件是一个经过压缩的非常紧凑的二进制文件，保存了Redis在某个时间点上的数据集，适合进行冷备份和灾难恢复。
2. Redis在恢复大数据集时比AOF快。
3. 在fork出子进程后，主进程不需要进行任何磁盘操作。

##### 劣势

1. RDB不是实时备份，无法实时持久化/秒级持久化。
2. BGSAVE操作每次运行都要fork子进程，执行成本高。
3. Redis演进过程中多个RDB文件版本不兼容。

### AOF持久化

AOF持久化通过保存Redis服务器执行的写命令来记录数据库状态。

被写入AOF文件的所有命令以Redis命令请求协议格式保存为纯文本。

AOF持久化分为以下三步：
1. 命令追加
2. 文件写入及同步
3. AOF重写

#### 命令追加

服务器在执行完一个写命令后，被执行的命令不是直接写入AOF文件(原因:Redis为单线程，直接写入文件会造成服务性能受磁盘性能限制)，而是**追加到aof_buf缓冲区**的末尾：

```C
struct redisServer {
    //...
    sds aof_buf; // AOF缓冲区
}
```

#### 文件写入及同步

写入：执行`write`系统命令, 将aof_buf缓冲区中的数据写入AOF文件。

同步：执行`fsync`系统命令，将AOF文件和磁盘同步。(系统的**文件写入缓冲区**写入磁盘)。

```
write会触发操作系统的写延迟，数据将被写入操作系统内存缓冲区中，由操作系统决定何时真正写入磁盘。

fsync命令强制让操作系统立即将缓冲区中得数据写入到磁盘中。

因此AOF文件写入分为写入和同步两步。
```

每个事件循环中都会执行write，而fsync由`appendfsync`选项配置决定。

```
写入和同步都在**事件循环**中发生，事件循环包括**文件事件**(接受执行客户端命令、发送命令回复)和**时间事件**(执行定时任务，如serverCron)。

def eventLoop():
    while True:
        processFileEvents();
        processTimeEvents();
        flushAppendOnlyFile();

文件事件中会有命令被追加到aof_buf中，因此在一个事件循环结束前，Redis会调用`flushAppendOnlyFile()`函数，将aof_buf缓冲区中的内容写入AOF文件。
```

##### appendfsync选项

如果每次写入都同步磁盘，Redis服务性能将受到磁盘性能的影响。因此，Redis提供了appendfsync选项。

`appendfsync`选项配置是否执行`fsync`同步。

appendfsync选项值 | 行为 | 效果
--- | --- | ---
always | 将aof_buf缓冲区的所有内容写入AOF文件，且同步磁盘。 | 最安全、效率最低
everysec | 将aof_buf缓冲区的所有内容写入AOF文件，如果距离上次同步的时间超过一秒，再次对AOF文件进行同步，并且该同步由一个线程专门负责。 | 如果故障停机，丢失一秒的写数据，是Redis默认配置。
no | 将aof_buf缓冲区中得所有内容写入AOF文件，但是不执行同步，由操作系统决定。 | 如果故障停机，丢失上次同步以来所有写数据。最不安全、效率最高


#### AOF重写

为了解决AOF文件体积膨胀的问题，Redis提供了AOF文件重写(rewrite)功能。

AOF重写不需要对现有的AOF文件进行任何读取、分析或者写入操作，而是直接读取服务器当前数据库，用最少命令直接记录当前值。

##### 重写触发

1. 手动执行`BGREWRITEAOF`.
2. 配置`auto-aof-rewrite-min-size`和`auto-aof-rewrite-percentage`参数

    - auto-aof-rewrite-min-size：执行AOF重写时，文件的最小体积，默认值为64MB。 
    - auto-aof-rewrite-percentage：执行AOF重写时，当前AOF大小(即aof_current_size)和上一次重写时AOF大小(aof_base_size)的比值。
    
    只有当`auto-aof-rewrite-min-size`和`auto-aof-rewrite-percentage`都满足时，才会触发重写。

##### 重写步骤

1. 父进程fork子进程进行重写，fork期间父进程阻塞。
2. 重写期间Redis执行的写命令，需要追加到新的AOF文件中，为此Redis引入了`aof_rewrite_buf`缓存。
3. 子进程执行重写写入新的AOF文件，父进程继续执行命令，并将写命令同时追加到`aof_buf`和`aof_rewrite_buf`中。
4. 子进程完成AOF重写，向父进程发送信号。
5. 父进程接收子进程信号，阻塞地将`aof_rewrite_buf`中的内容写入新的AOF文件。
6. 父进程将新的AOF文件替换旧的AOF文件。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_aof_rewrite_buf.png)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_aof_rewrite_process.png)

## 主从复制

用户可以通过SLAVEOF命令或者设置slaveof选项，让一个服务器复制(replicate)另一个服务器，被复制的服务器称为主服务器(master)，对主服务器复制的服务器被称为从服务器(slave)。

主从复制包括：
1. 同步
2. 命令传播
3. 心跳检测

### 同步

用户发送SLAVEOF命令后，从服务器会向主服务器发送SYNC或者PSYNC命令，开启同步。

由于SYNC只能执行完整同步，在Redis 2.8之后由PSYNC代替。

#### SYNC

1. 从服务器向主服务器发送SYNC命令。
2. 主服务器执行BGSAVE命令，后台生成RDB文件，并使用一个缓冲区记录从现在开始执行的所有写命令。
3. 主服务器发送生成的RDB文件，从服务器接收并载入RDB文件。
4. 主服务器发送所有记录在缓冲区的命令，从服务器接受并执行。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_sync_old.png)

**缺陷**：一旦断线，重连后需要重新生成和加载整个数据库数据。

#### PSYNC

为了解决SYNC的缺陷，新版本的Redis提供了PSYNC命令代替SYNC。

PSYNC具有**完整同步**和**部分同步**两种模式

1. 完整同步

用于处理初次复制情况，和SYNC基本一样。

2. 部分同步

从服务器断线后重新连接主服务器时，主服务器能将连接断开期间执行的写命令发送给从服务器。从服务器只接受并执行断开期间写命令就能恢复至与主服务器一致。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_psync.png)

##### PSYNC部分重同步的实现

部分重同步功能由三个部分实现：

1. 主服务器和从服务器的复制偏移量(replication offset)。
2. 主服务器的复制积压缓冲区(replication backlog)。
3. 服务器的运行ID(run ID)。

##### 复制偏移量(replication offset)

1. 主服务器每发送N个字节，自身复制偏移量加N。
2. 从服务器每收到N个字节，自身复制偏移量加N。
3. 如果主从服务器偏移量相同，那么处于一致状态。
4. 如果主从服务器偏移量不同，那么未处于一致状态。

##### 复制积压缓冲区(replication backlog)

复制积压缓冲区是由主服务器维护的**固定长度先进先出**队列。

```
固定长度先进先出队列：
当入队元素数量超出队列长度，最先入队的元素会被弹出，而新元素会被放入队列。
```

主服务器进行命令传播时，不仅会将命令发送给所有从服务器，还会将写命令入队到复制积压缓冲区里面。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_replication_backlog.png)

从服务器断线重连时，通过PSYNC命令发送当前复制偏移量offset：
- 如果offset之后的数据还在复制积压缓冲区中，则执行部分重同步。
- 如果offset之后的数据不在复制积压缓冲区中，则执行完整重同步。

##### 服务器运行ID


每个Redis服务器都有自己的运行ID，在启动时生成，由40个随机的十六进制字符组成。

1. 从服务器对主服务器初次复制时，保存主服务器的运行ID。
2. 从服务器断线后重连时，从服务器向主服务器发送之间保存的主服务器运行ID：
    - 如果ID和当前主服务器相同，尝试部分重同步。
    - 如果ID和当前主服务器不同，执行完整重同步。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_PSYNC_process.png)

### 命令传播

在同步之后，主服务器将成为从服务器的客户端，将每次执行的写命令都发送给从服务器。

### 心跳检测

在命令传播阶段，从服务器默认每隔一秒，向主服务器发送`REPLCONF ACK`命令：
```
REPLCONF ACK <replication_offset>
```

心跳检测的作用：
1. 检测主从服务器网络状态

`INFO replication`命令列出的信息中包括最后一次接受到`REPLCONF ACK`命令距离现在的时间。可以判断主从间网络是否出现了问题。

2. 检测命令丢失

`REPLCONF ACK`的参数是从服务器当前的复制偏移量。

当主服务器发现接收到的复制偏移量和自身的复制偏移量不响等时，证明之前发送的写命令丢失，会从积压缓冲区中再次发送丢失的写命令。

### 主从复制的完整流程

1. 设置主服务器的地址和端口

当客户端向从服务器发送`SLAVEOF host port`是，从服务器将主服务器的IP和地址保存在redisServer数据结构中：
```C
struct redisServer {
    char *masterhost;
    int masterport;
}
```

2. 建立连接套接字

从服务器根据IP和端口自连接主服务器，成为主服务器的客户端。

3. 发送PING命令

从服务器向主服务器发送PING命令，确定主服务器是否正常工作。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_replication_ping.png)

4. 身份验证

如果设置了密码，则进行身份验证。

5. 发送端口信息

从服务器执行`REPLCONF listening-port <port-number>`向主服务器发送从服务器监听的端口号。

主服务器也需要成为从服务器的客户端，向从服务器发送以下数据：
- 完整重同步的缓冲区。
- 部分重同步的复制积压缓冲区。
- 命令传播的写命令。

6. 同步

从服务器向主服务器发送PSYNC，执行同步操作。

7. 命令传播和心跳检测
 
```
本文地址：https://cheng-dp.github.io/2019/03/15/redis-persist-slave-replica/
```
 
