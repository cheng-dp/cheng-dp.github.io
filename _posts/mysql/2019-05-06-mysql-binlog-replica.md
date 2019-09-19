---
layout: post
title: MySQL中binlog详解及复制机制
categories: [MySQL]
description: MySQL中binlog详解及复制机制
keywords: MySQL
---

## binlog

### binlog概述

binlog是MySQL Server层维护的**二进制日志**。binlog记录所有的DDL和DML语句(除了数据查询语句SELECT、SHOW等)，以Event的形式记录，同时记录语句执行时间。

binlog的作用有：
- 复制：Master和Slave之间的主从复制。
- 数据增量备份和恢复：MySQL提供mysqlbinlog工具从binlog中恢复数据。

binlog包括两类文件：
- 二进制日志索引文件(.index)：记录所有的二进制文件。
- 二进制日志文件(.00000*)：记录所有DDL和DML语句事件。

### binlog格式

binlog有三种格式：
- STATEMENT：基于SQL语句记录
- ROW：基于行的记录
- MIXED：混合模式(ROW + STATEMENT)
可以通过`my.cnf`配置`binlog-format`修改。

1. STATEMENT

直接记录造成数据更改的SQL语句。

优点：

实现简单，日志紧凑，节省带宽。只需要记录在 master 上所执行的语句的细节，以及执行语句时候的上下文的信息。

缺点：

一些SQL语句和当前环境密切相关，无法被正确复制。如CURRENT_USER()、NOW()、UUID()函数等。

更新必须是串行的，需要更多的锁。

2. ROW

MySQL 5.1开始支持基于行的复制，将**实际更新的行数据**直接记录在二进制日志中。

优点：

能够精确且正确的复制行数据，从库可以直接应用更新数据。

缺点：

大数据量更新(如全表更新)大大增加二进制日志大小，无法判断执行了哪些SQL，占用大量带宽。

3. MIXED

一般的语句修改使用STATEMENT格式保存binlog，对于STATEMENT无法精确记录的如一些函数，则采用ROW格式。

### binlog和redo log/undo log区别

1. 层次不同

redo log/undo log属于innoDB存储引擎，而binlog属于mySQL Server层，和引擎无关。

2. 记录内容不同

redo log/undo log记录的都是页的修改，redo log属于物理日志， undo log属于逻辑日志。

binlog记录的是事务操作的内容，是二进制日志。

3. 记录时机不同

redo log/undo log在事务执行中随着SQL的执行不断写入，且在事务COMMIT前同步到磁盘文件。

binlog只在事务COMMIT前写入binlog文件。且根据`sync_binlog`参数配置决定刷新到磁盘时间。

### binlog参数

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_binlog_variables.png)

1. `log_bin`

`log_bin [=file_name]`如果不为OFF则开启binlog功能，可以设置binlog存放路径。

要开启binlog，必须设置`service-id`。

2. `binlog_format`

binlog记录格式，ROW/STATEMENT/MIXED。

3. `binlog_cache_size`

控制binlog cache大小。

未提交的binlog记录会首先记录在binlog cache中，待事务COMMIT前一次性写入binlog文件。

4. `sync_binlog`

设置binlog fsync刷入文件系统的同步方式。

    - 0：默认值，只写入操作系统缓存，不调用fsync，由操作系统决定什么时候同步磁盘文件。
    - 1：每次写binlog都调用fsync同步磁盘。
    - >1：`sync_binlog=N`，每写N次调用一次fsync。

5. `max_binlog_size`

如果超过了该值，就会产生新的日志文件，后缀名+1，并且记录到.index文件里面。

### binlog控制

1. 查看所有binlog日志

```
mysql> show master logs;
+------------------+-----------+
| Log_name         | File_size |
+------------------+-----------+
| mysql-bin.000001 |       970 |
+------------------+-----------+
1 row in set (0.00 sec)
```

2. 查看binlog最新状态(最后一个binlog编号)

```
mysql> show master status;
+------------------+----------+--------------+------------------+-------------------+
| File             | Position | Binlog_Do_DB | Binlog_Ignore_DB | Executed_Gtid_Set |
+------------------+----------+--------------+------------------+-------------------+
| mysql-bin.000001 |      970 |              |                  |                   |
+------------------+----------+--------------+------------------+-------------------+
1 row in set (0.00 sec)
```

3. 刷新binlog日志，产生一个新的binlog file

```
mysql> flush logs;
Query OK, 0 rows affected (0.01 sec)

mysql> show master logs;
+------------------+-----------+
| Log_name         | File_size |
+------------------+-----------+
| mysql-bin.000001 |      1017 |
| mysql-bin.000002 |       154 |
+------------------+-----------+
2 rows in set (0.00 sec)
```

4. 重置所有binlog日志

```
mysql> reset master;
Query OK, 0 rows affected (0.02 sec)

mysql> show master logs;
+------------------+-----------+
| Log_name         | File_size |
+------------------+-----------+
| mysql-bin.000001 |       154 |
+------------------+-----------+
1 row in set (0.00 sec)
```

5. 查看binlog内容

通过mysqlbinlog工具：
```
shell> mysqlbinlog -vv mysql-bin.000001
```
通过mysql数据库读取：
```
mysql> show binlog events [IN 'log_name'] [FROM pos] [LIMIT [offset,] row_count];
```

6. 从binlog中恢复数据

```
shell> mysqlbinlog [选项] mysql-bin.0000xx | mysql -u用户名 -p密码 数据库名
```

# 复制

MySQL复制指从服务器(Slave)从主服务器(Master)中获取并同步数据。向Master插入数据后，Slave会自动从Master把修改的数据同步过来，保证数据一致性。

基于复制，MySQL能够实现：
- 高可用、故障切换
- 读写分离、负载均衡
- 数据备份
- 业务模块化

## 复制工作原理

MySQL复制有两种工作模式：
- 基于语句的复制
- 基于行的复制
- 混合类型的复制

对应二进制日志(binlog)也有三种格式：STATEMENT，ROW，MIXED。

### 基于语句的复制

主库直接记录造成数据更改的SQL语句，当从库读取并重放操作时，只需重新执行该SQL语句。

优点：

实现简单，日志紧凑，节省带宽。

缺点：

一些SQL语句和当前环境密切相关，无法被正确复制。如CURRENT_USER()函数、NOW()等。

更新必须是串行的，需要更多的锁。

### 基于行的复制

MySQL 5.1开始支持基于行的复制，将实际更新数据直接记录在二进制日志中。

优点：

正确复制行数据，从库可以直接应用更新数据，无需重放SQL语句。

缺点：

大数据量更新(如全表更新)大大增加二进制日志大小，无法判断执行了哪些SQL，占用大量带宽。

## 复制过程

1. 主服务器将数据更改记录到二进制日志(binlog)中。

    每个更新数据的事务完成前，主服务器会将数据更改记录到二进制日志(binlog)中，即使事务执行时交错的，也会串行地写入二进制日志(binlog)中。
    
    在写入二进制日志(binlog)后，存储引擎才能提交事务。

2. 从服务器拷贝主服务器二进制日志(binlog)到自己的中继日志(relay log)。

    从服务器中专门的IO线程与主服务器连接，主服务器二进制日志(binlog)中读取数据并转储至本地中继日志(relay log)中。

3. 从服务器重放中继日志(relay log)事件，逐条在本地执行，应用更改。

    从服务器中专门的SQL线程读取中级日志(relay log)，并将其中事件重放至本地数据。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_copy_process.png)

## 半同步复制

在异步复制的情况下，从库(Slave)是落后于主库(Master)的，无法保证主从的一致性。因此，在主库(Master)与从库(Slave)之间需要建立同步确认以保证一定的一致性。

- **半同步复制**是相对于**同步复制**而言的。
- 同步复制在每次用户操作时，必须要保证Master和Slave都执行成功才返回给用户。
- 而**半同步复制**不要求Slave执行成功，而是成功接收Master日志就可以通知Master返回。

半同步日志有两种实现方式`AFTER_COMMIT`和`AFTER_SYNC`两种。

### AFTER_COMMIT

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_copy_sync_after_commit.png)

- Master将事务的redo log刷入磁盘。
- Master将事务的binlog刷入磁盘。
- commit，释放锁，标记事务提交。
- 等待Slave发送的日志同步ACK消息，等到Slave响应后，才返回给用户。

1. Master在commit前崩溃，Slave未同步

binlog未传递给Slave，Slave比Master少一个事务，但是不影响，因为用户接收到异常，该事务将重试并回滚。

2. Master在commit后崩溃，Slave未同步

binlog未传递给Slave，Slave比Master少一个事务，但是Master commit成功，造成主库和备库不一致。

### AFTER_SYNC

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_copy_sync_after_sync.png)

`AFTER_SYNC`能够解决`AFTER_COMMIT`的问题，即等到slave同步后Master再进行commit操作。
 
```
本文地址：https://cheng-dp.github.io/2019/05/06/mysql-binlog-replica/
```
 
