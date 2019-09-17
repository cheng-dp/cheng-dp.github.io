---
layout: post
title: 详解MySQL中得锁机制及实现
categories: [MySQL]
description: 详解MySQL中得锁机制及实现
keywords: MySQL
---

## MySQL锁分类

MySQL的锁实现在存储引擎层，服务器层完全不了解存储引擎中的锁实现。

1. 行锁 (row-level lock)

加在数据行(row)上的锁，行级锁是粒度最低的锁，发生锁冲突的概率也最低、并发度最高。但是加锁慢、开销大，容易发生死锁现象。

**InnoDB支持行锁。**

2. 表锁 (table-level lock) 

加在表(table)上的锁，粒度最高，发生锁冲突的概率大，并发度较低。一次将整个表锁定，加锁块、开销小。

**InnoDB和MyISAM支持表锁。**

3. 页锁 (page-level lock)

页级锁是MySQL中锁定粒度介于行级锁和表级锁中间的一种锁。表级锁速度快，但冲突多，行级冲突少，但速度慢。所以取了折衷的页级，一次锁定相邻的一组记录。**只有BDB引擎支持页级锁**。


**InnoDB**支持表锁和行锁。

**MyISAM**仅支持表锁。

## InnoDB锁实现

1. InnoDB的行锁(row-level lock)是通过**在索引项上加锁实现的**，不是在记录上加锁。       

    不论是使用主键索引(primary key)、唯一索引(key)或普通索引(index)，InnoDB都使用行锁。

    即使不同session事务访问不同行的数据，如果这些数据使用了相同的索引键，依旧会出现冲突。

2. 只有引擎最终**通过索引**检索数据，InnoDB才会使用行锁(row-level lock)，否则都使用表锁(table-level lock)。

    只有MySQL执行时真正使用了索引，才会使用行锁。即使在条件中使用了索引字段，但如果MySQL判断执行时没有使用该索引(如，当MySQL认为全表扫描效率更高时)，使用的依然是表锁。

### InnoDB锁模式

表锁和行锁都有的：
- 共享锁(S)：允许一个事务读数据，阻止其他事务获得相同数据行的排他锁。
- 排他锁(X)：允许一个事务更新数据，阻止其他事务取得相同数据集的共享锁和排他锁。
为了允许行锁和表锁共存，实现多粒度锁机制，InnoDB还使用意向锁(Intention Locks)，意向锁为表锁：
- 意向共享锁(IS)：事务打算给数据行加共享锁(S)，此前必须先取得该表的意向共享锁(IS)。
- 意向排他锁(IX)：事务打算给数据行加排他锁(X)，此前必须先取得该表的意向排他锁(IX)。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_innodb_lock_compatibility.jpg)

### InnoDB锁算法

- 意向锁是InnoDB自动加的，不需用户干预。
- 对于UPDATE、DELETE和INSERT语句，InnoDB会自动加排他锁(X)。
- 对于普通SELECT语句，InnoDB不会加任何锁。(事务中SELECT不会主动加读锁)
- 事务可以通过以下语句显示给记录集加共享锁(S)或排他锁(X)。
```
共享锁（Ｓ）：SELECT * FROM table_name WHERE ... LOCK IN SHARE MODE
排他锁（X）：SELECT * FROM table_name WHERE ... FOR UPDATE
```

### InnoDB加锁方式

加锁方式 | 锁定内容
-- | --
Record Lock | 记录锁，锁定一个行记录。
Gap Lock | 间隙锁，锁定一个区间。
Next Lock | 记录锁+间隙锁，锁定行记录+区间。

**记录锁和间隙锁都是在索引项上加锁。**

1. 记录锁

记录锁都是基于索引的，只有当MySQL选择使用索引查询时，才会加记录锁，否则加表锁。

当基于辅助索引查询时，由于InnoDB聚簇索引的特性，也会对主键索引加锁，因此不同事务中对同一行数据不同索引查询依然会互斥。

2. 间隙锁

当我们用范围条件而不是相等条件检索数据，并请求共享或排他锁时，InnoDB会给符合条件的已有数据记录的所有索引项加锁。

对于键值在条件范围内但并不存在的记录，叫做“间隙（GAP)”，InnoDB也会对这个“间隙”加锁，这种锁机制就是所谓的间隙锁（Gap-Key锁）。

```
InnoDB使用间隙锁的目的：

1. 防止幻读，以满足相关隔离级别的要求。
2. 满足恢复和复制的需要。

MySQL 通过 BINLOG 录入执行成功的 INSERT、UPDATE、DELETE 等更新数据的 SQL 语句，并由此实现 MySQL 数据库的恢复和主从复制。MySQL 的恢复机制（复制其实就是在 Slave Mysql 不断做基于 BINLOG 的恢复）有以下特点：

    - MySQL 的恢复是 SQL 语句级的，也就是重新执行 BINLOG 中的 SQL 语句。
    - MySQL 的 Binlog 是按照事务提交的先后顺序记录的， 恢复也是按这个顺序进行的。

由此可见，MySQL的恢复机制要求在一个事务未提交前，其他并发事务不能插入满足其锁定条件的任何记录，也就是不允许出现幻读。
```


#### 加锁方式举例

不同的事务隔离级别、不同的索引类型、是否为等值查询，使用的加锁方式不同。

当使用InnoDB默认的**Repeatable Read**隔离级别进行等值查询时：

等值查询使用的索引类型 | 锁定内容
-- | --
主键(聚簇索引) | 对聚簇索引加Record Lock
唯一索引 | 对辅助索引加Record Lock</br>对聚簇索引加Record Lock
普通索引 | 对辅助索引加Next-key Lock</br>对聚簇索引加Record Lock
不适用索引 | 对聚簇索引全表加Next-key Lock

1. 主键等值查询使用**聚簇索引**

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_innodb_lock_primary_key.png)

2. 非主键等值查询使用**辅助唯一索引**

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_innodb_lock_secondary_only_key.png)

3. 非主键等值查询使用**辅助索引**

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_innodb_lock_secondary_key.png)

### 表锁

当InnoDB不使用索引时，将会自动加表锁。

#### LOCK TABLES

MySQL也支持显示加表锁：
```
SET AUTOCOMMIT=0; 
LOCK TABLES t1 WRITE, t2 READ, ...; 
[do something with tables t1 and t2 here]; 
COMMIT; 
UNLOCK TABLES;
```

显示加表锁`LOCK TABLES`是在MySQL Server层完成的，仅当`autocommit=0`、`innodb_table_lock=1`(默认设置)时，InnoDB层才能知道MySQL加的表锁，ＭySQL Server才能感知InnoDB加的行锁。

- 使用`LOCK TABLES`前必须设置参数`autocommit=0`, `innodb_table_lock=1`。
- 事务结束前，不要用 UNLOCK TABLES 释放表锁，因为 UNLOCK TABLES会隐含地提交事务。
- COMMIT或ROLLBACK并不能释放用LOCK TABLES加的表级锁，必须用UNLOCK TABLES显示释放表锁。

表锁使用举例：
```
// 读取两个表的数据并比较数据是否相等。
Lock tables orders read local, order_detail read local; 
Select sum(total) from orders; 
Select sum(subtotal) from order_detail; 
Unlock tables;
```

## 锁分析和优化

### 行锁状态

查看`Innodb_row_lock_%`状态变量：
```
mysql> show status like 'innodb_row_lock%';
+-------------------------------+-------+
| Variable_name                 | Value |
+-------------------------------+-------+
| Innodb_row_lock_current_waits | 0     |
| Innodb_row_lock_time          | 0     |
| Innodb_row_lock_time_avg      | 0     |
| Innodb_row_lock_time_max      | 0     |
| Innodb_row_lock_waits         | 0     |
+-------------------------------+-------+
```

- `innodb_row_lock_current_waits`: 当前正在等待锁定的数量
- `innodb_row_lock_time`: 从系统启动到现在锁定总时间长度；非常重要的参数，
- `innodb_row_lock_time_avg`: 每次等待所花平均时间；非常重要的参数，
- `innodb_row_lock_time_max`: 从系统启动到现在等待最常的一次所花的时间；
- `innodb_row_lock_waits`: 系统启动后到现在总共等待的次数；非常重要的参数。直接决定优化的方向和策略。

### 行锁优化

- 尽可能让所有数据检索都通过索引来完成，避免无索引行或索引失效导致行锁升级为表锁。
- 尽可能避免间隙锁带来的性能下降，减少或使用合理的检索范围。
- 尽可能减少事务的粒度，比如控制事务大小，而从减少锁定资源量和时间长度，从而减少锁的竞争等，提供性能。
- 尽可能低级别事务隔离，隔离级别越高，并发的处理能力越低。

### 表锁状态

查看加锁表`show open tables where in_use > 0`（1表示加锁，0表示未加锁)
```
mysql> show open tables where in_use > 0;
+----------+-------------+--------+-------------+
| Database | Table       | In_use | Name_locked |
+----------+-------------+--------+-------------+
| lock     | myisam_lock |      1 |           0 |
+----------+-------------+--------+-------------+
```

查看加锁状态`show status like 'table_locks%'`

```
mysql> show status like 'table_locks%';
+----------------------------+-------+
| Variable_name              | Value |
+----------------------------+-------+
| Table_locks_immediate      | 104   |
| Table_locks_waited         | 0     |
+----------------------------+-------+
```
- `table_locks_immediate`: 表示立即释放表锁数。
- `table_locks_waited`: 表示需要等待的表锁数。此值越高则说明存在着越严重的表级锁争用情况。

## REFS

- https://zhuanlan.zhihu.com/p/29150809
- https://segmentfault.com/a/1190000014133576#articleHeader4
- https://juejin.im/post/5b82e0196fb9a019f47d1823#heading-20