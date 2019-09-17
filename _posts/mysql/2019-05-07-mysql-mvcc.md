---
layout: post
title: 详解MVCC
categories: [MySQL]
description: 详解MVCC
keywords: MySQL
---


## MVCC概念介绍

`MVCC(Multi-version Concurrent Control)`：多版本并发控制。基于保存多个数据版本实现的并发控制，当需要更新数据时，实现了MVCC的系统不会立即用新数据覆盖原始数据，而是创建该条记录的一个新版本。

最早的数据库系统，只有读-读之间可以并发，引入多版本控制之后，读-读、读-写、写-读都可以并行，即**读无需加锁、读写不冲突(InnoDB中RR隔离级别下，普通SELECT不加共享锁)**，极大增加了系统的并发性。

在InnoDB中，MVCC只在：
- READ COMMITTED
- REPEATABLE READ
两个隔离级别下工作，因为READ UNCOMMITTED总是读取最新数据行，而SERIALIZABLE会对所有读取的行都加锁。

## MVCC实现原理

### 行记录存储格式

InnoDB行记录为了支持MVCC，除了基本的数据信息，还有三个额外字段：
- `DB_ROW_ID`：InnoDB自动生成的自增**主键id**。当用户没有显示指定主键、且无非null唯一索引时，InnoDB的聚簇索引会使用`DB_ROW_ID`作为主键。
- `DB_TRX_ID`：最近更新此行记录的**事务id**，数据库每开启一个新事务，事务ID自动加一。
- `DATA_ROLL_PTR`：指向Undo Log中当前行旧版数据的指针。支持事务回滚。刚Insert的记录没有旧版本，该值为NULL。

### Undo Log

Undo Log用来实现事务回滚和MVCC，原理很简单，进行数据修改之前，首先将当前数据保存到Undo Log中。

Undo Log是逻辑日志，当执行DELETE操作时，Undo Log中记录一条对应的INSERT。当执行UPDATE操作时，Undo Log记录一条相反的UPDATE。

当执行RollBack时，或MVCC需要读取旧版本数据时，就可以从Undo Log中的逻辑记录进行数据恢复。

多个Undo Log数据之间通过链表的方式关联，每个Log中存储上一个版本Log的地址。

### 行更新过程举例

1. 初始数据行

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_mvcc_update_row_ex_1.jpeg)

2. 事务Transaction1更新数据

此时Undo Log记录旧版本的数据值，且由于是第一个版本，`DB_TRX_ID`和`DB_ROLL_PT`为NULL。

```
用排他锁锁定该行。
记录redo log。
把该行修改前的值Copy到undo log。
修改当前行的值，填写事务编号，使回滚指针指向undo log中的修改前的行。
```

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_mvcc_update_row_ex_2.jpeg)

3. 事务Transaction2更新数据

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_mvcc_update_row_ex_3.jpeg)

### 事务链表

事务在开始到提交的过程中，会被保存到`trx_sys->trx_list`事务链表，事务一旦被提交，将从事务链表中移除。

### Read View

Read View可以认为是一个当前活跃事务的快照，在当前事务**SQL开始**时，会创建一个Read View，用来判定当前SQL执行时，所有活跃事务哪些改变对当前事务可见、哪些改变对当前事务不可见。

### 版本可见性算法

基于行记录、Read View，在SQL开始时能够得到所有活跃事务对当前SQL的可见性。

记录对当前SQL的可见性算法：
```
假设当前行的事务id为 trx_id_current。

假设Read View中最早的事务id为 trx_id_early，Read View中最新的事务id为trx_id_late。
即当前事务中当前SQL开始时，活跃的事务id介于trx_id_early和trx_id_late之间。Read View中不包括当前事务。

1. 如果 trx_id_current < trx_id_early，即当前行的事务已经结束并提交，该行最新记录对当前SQL可见。跳转步骤5。

2. 如果 trx_id_current > trx_id_late，即该行记录最新的更新是在当前事务之后开启的，该行最新记录对当前SQL不可见。跳转步骤4。

3. 如果 trx_id_early < trx_id_current < trx_id_late，即该行记录更新事务在当前SQL执行时处于活跃状态，未提交，该行最新记录对当前SQL不可见。跳转步骤4。

4. 如果不可见，从该行记录的DB_ROLL_PTR指针指向的Undo Log中取出旧数据和旧trx_id，重新进行算法比较，跳转步骤1。

5. 如果可见，则将该值返回。

```

### 不同隔离级别的区别

1. READ UNCOMMITTED

    该级别下永远读取最新行，无需MVCC。

2. READ COMMITTED
    
    该级别下，每次执行SQL，需要能够读取其他事务COMMIT后的最新值。

    因此，**每个SQL语句执行时都会创建一个新的READ VIEW**。

3. REPEATABLE READ

    该级别下，事务未提交时只能读取到旧值。
    
    因此，**只在第一个SQL执行时创建READ VIEW，此后不再更新**。

4. SERIALIZABLE

    每次只能有一个事务正在运行，无需MVCC。

## REFS
- https://segmentfault.com/a/1190000012650596
- https://sadwxqezc.github.io/HuangHuanBlog/mysql/2018/05/01/MVCC.html
- http://mysql.taobao.org/monthly/2018/11/04/
- https://www.imooc.com/article/17290