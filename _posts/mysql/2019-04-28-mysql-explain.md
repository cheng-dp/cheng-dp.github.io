---
layout: post
title: MySQL EXPLAIN命令详解
categories: [MySQL]
description: MySQL EXPLAIN命令详解
keywords: MySQL
---


EXPLAIN是MySQL提供的一个命令，可以对SELECT语句进行分析，并输出SELECT执行的详细信息，供开发人员优化。使用方法非常简单，直接在SELECT语句前加上Explain。

## EXPLAIN输出格式

```
mysql> explain select * from user_info where id = 2\G
*************************** 1. row ***************************
           id: 1
  select_type: SIMPLE
        table: user_info
   partitions: NULL
         type: const
possible_keys: PRIMARY
          key: PRIMARY
      key_len: 8
          ref: const
         rows: 1
     filtered: 100.00
        Extra: NULL
1 row in set, 1 warning (0.00 sec)
```

### id

id为SELECT查询标识符，每个SELECT都会自动分配一个唯一的标识符。

### select_type

`select_type`表示查询类型。

1. SIMPLE：查询不包含UNION查询或子查询。
2. PRIMARY：查询是最外层的查询。
3. UNION：查询是UNION的第二或随后的查询。
4. DEPENDENT UNION：UNION中的第二个或后面的查询语句，取决于外面的查询。
5. UNION RESULT：UNION的结果。
6. SUBQUERY：子查询中的第一个select。
7. DEPENDENT SUBQUERY：子查询中得第一个select，取决于外面的查询，即子查询依赖于外层查询的结果。

### table

表示查询设计的表或衍生表

### type

查询的类型。

1. system：表中只有一条数据，这个类型时特殊的const类型。
2. const：针对主键或唯一索引的等值查询扫描，最多只返回一行数据。
```
explain select * from user_id where id=2;
```
3. eq_ref：通常出现在多表join查询，表示对于前表的每一个结果，都只匹配后表的一行结果，查询比较操作通常是'='，效率很高。
```
explain select * from user_info, order_info where user_info.id = order_info.user_id;
```
4. ref：通常出现在夺标join查询，对于非唯一或非主键索引，或者使用了最左前缀规则索引的查询。
```
explain select * from user_info, order_info where user_info.id = order_info.user_id and order_info.user_id = 5;
```
5. range：表示使用索引的范围查询，如比较大小、IS NULL, BETWEEN, IN 操作。

6. index：全索引扫描(full index scan)，直接在索引树中扫描查询全部数据。
```
explain select name from user_info;
```

7. ALL：全表扫描(full table scan)，不使用索引。

**type类型性能比较**：
```
ALL < index < range ~ index_merge < ref < eq_ref < const < system
```

### possible_keys

`possible_keys`表示在查询时，能够使用到的全部索引。然而，即使有些索引在`possible_keys`中出现，但是并不表示此索引会真正被MySQL用到，具体使用了的索引记录在key字段中。

### key

MySQL在当前查询时真正使用到的索引。

### key_len

表示查询优化器使用了索引的字节数，根据最左前缀原则，这个字段可以评估组合索引是否完全被使用，或只有最左部分字段被使用到。

`key_len`的计算规则如下：
![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/mysql_explain_key_len.png)

### rows

MySQL查询优化器根据统计信息，估算SQL要查找到结果集需要扫描读取的数据行数。

`rows`值非常直观的显示了SQL的效率好坏，原则上`rows`越少越好。

### extra

extra显示一些额外的信息。

1. Using filesort

表示NySQL需要额外的排序操作，不能通过索引顺序达到排序效果，通常建议去掉。

2. Using index

覆盖索引扫描，表示查询在索引树中就可查找所需数据，不需要扫描表数据文件。

3. Using temporary

查询有使用临时表，一般出现于排序、分组和多表join的情况，查询效率不高，建议优化。


## REFS

- https://segmentfault.com/a/1190000008131735
 
```
本文地址：https://cheng-dp.github.io/2019/04/28/mysql-explain/
```
 
