---
layout: post
title: 详解MySQL中的数据类型
categories: [MySQL]
description: 详解MySQL中的数据类型
keywords: MySQL
---

## 整型

- TINYINT
- SMALLINT
- MEDIUMINT
- INT
- BIGINT

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_int_types.png)

- MySQL可以为整型指定宽度，`int(5) zerofill`表示当数值宽度小于5位时在前面用0填满宽度，此命令对存储层无影响，只是影响客户端的显示方式。
- UNSIGNED 指定为无符号数，只针对整型。

## 浮点型

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_float_double_types.png)

- FLOAT和DOUBLE都是非精确类型，无法保证运算正确性。
- FLOAT(M,D)和DOUBLE(M,D)，M：总位数，`1 <= M <= 255`。D：小数点后位数，`0 <= D <= 30`。如设置(M,D)后插入数据超过限制将报错。
- FLOAT和DOUBLE不指定精度时，默认按照实际精度显示。

## 定点型

类型 | 字节 | 范围
-- | -- | --
DECIMAL(M,D) | 如果M > D，为M + 2<\b> 如果M <= D，为D + 2 |  依赖于M和D的值

- DECIMAL(M,D)为高精度数据类型，是精确类型，在MySQL内部以字符串形式存放。
- 最大取值范围与DOUBLE相同，给定DECIMAL的有效取值范围由M和D决定。1 < M < 254，0 < D < 60。
- DECIMAL不指定时，默认M = 10, D = 0。

## 日期时间类型

- DATE
- TIME
- YEAR
- DATETIME
- TIMESTAMP

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_datetime_type.png)

### TIMESTAMP

- TIMESTAMP和DATETIME显示的结果相同，只是TIMESTAMP保存的是时间戳，为`1970-01-01 00:00:00`到当前时间的毫秒数。
- TIMESTAMP存储范[`1970-01-01 00:00:01`,`2038-01-19 03:14:07`]，DATETIME存储范围[`1000-01-01 00:00:00`,`9999-12-31 23:59:59`]。
- TIMSTAMP显示时会考虑时区。

在MySQL中，由于TIMESTAMP经常用于记录操作时间，因此做了一些特殊处理：
1. 没有显示设置为NULL的TIMESTAMP将被加上NOT NULL属性。(其他类型没有显示设为NULL默认是NULL)。
2. table中的第一个TIMESTAMP列，如果没有显示设置为NULL且没有DEFAULT和ON UPDATE语句，将被自动添加：DEFAULT CURRENT\_TIMESTAMP和ON UPDATE CURRENT\_TIMESTAMP。
3. table中非第一个TIMESTAMP列，如果没有显示设置为NULl且没有DEFAULT子句，将自动添加：DEFAULT '0000-00-00 00:00:00'

设置ON UPDATE CURRENT_TIMESTAMP的TIMESTAMP:
1. 必须同时设置DEFAULT。
2. 当更新操作更新了该行数据，自动更新该TIMESTAMP的值。

上述特殊处理由`explicit_defaults_for_timestamp`参数配置，当`explicit_defaults_for_timestamp=off`时遵循上述配置，当该值为`on`时，timestamp和其他类型一样配置。默认值为`on`，即与其他类型一样配置。

### 获取当前时间

- CURRENT_TIMESTAMP
- CURRENT_TIMESTAMP()
- NOW()
- LOCALTIME
- LOCALTIME()
- LOCALTIMESTAMP
- LOCALTIMESTAMP()

### 帮助函数
- FROM_UNIXTIME() ： 把UNIX时间戳转换为日期。
- UNIX_TIMESTAMP()：把日期转换为UNIX时间戳。

## 字符串类型

- CHAR
- VARCHAR
- BIT
- BINARY
- VARBINARY
- BLOB
- TEXT
- ENUM
- SET

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/mysql_string_type.png)

```
2*24 = 16 777 216 (占3字节)
2*32 = 4 294 967 296 (占4字节)
```

### CHAR 和 VARCHAR

- CHAR类型使用固定长度空间进行存储，范围0-255个字符。
```
字符长度不是字节长度(字节长度由`字符长度 * 编码字节数`可得)，例如CHAR(30)能放30个字符，存放`abcd`时，在uft-8编码下，实际占用30 * 3 bytes，==尾部会以空格补齐==，但检索时尾部空格会被去除。
```
- VARCHAR类型保存可变长字符串，长度范围0-65535个字符(受到单行最大64kb的限制)。
```
VARCHAR(30)存放`abcd`，实际使用4 + 1 = 5个字节，额外的1个字节用来表示字符串长度(0-255使用1个字节，超过255使用2个字节)。
```

#### CHAR 和 VARCHAR 使用情况

1. 根据字符长度判断

对于短字符长度的字段，CHAR类型不会浪费太多空间，且VARCHAR类型在修改时需要重新分配空间、并且还需要字节维护字节长度，因此，建议直接使用CHAR类型。

2. 考虑长度是否相近

如果字段的长度总是相同或相近的，则考虑使用CHAR类型。

3. 从碎片角度考虑

CHAR类型存储空间是一次性分配的，字段内容存储在一起，因此不会出现空间碎片。而VARCHAR类型当修改前后数据长度不一致时，由于新的空间分配，会出现碎片问题。

4. VARCHAR字符设定不能太慷慨

VARCHAR类型虽然在硬盘上的存储空间时根据实际字符长度分配的，但是在内存中依然时按照字符类型定义的长度分配。

#### char_length()和length()

char_length('')计算字符串字符数。

```
select char_length('abcd中文中文');

8
```

length('')计算字符串的字节数，和使用的编码有关。

```
select length('abcd中文中文');

16
```
### BINARY 和 VARBINARY

**BINARY**和CHAR类型类似，只是存储的是二进制数据，二进制长度为0-255字节，且不足最大长度的，将在右边填充'0x00'补齐。SQL操作时基于二进制数值进行比较和排序。

**VARBINARY**和VARCHAR类似，只是存储的是二进制数据，二进制长度为0-65535字节，存储的是可变长度数据，不足最大长度不会填充。

**注意**，BINARY的值在查询和取出时，不会删除填充的'0x00'，所有字节在比较时都有意义，因此在使用BINARY存储二进制数据时，要注意填充和删除的特性。
```
mysql> CREATE TABLE t (c BINARY(3));
Query OK, 0 rows affected (0.01 sec)

mysql> INSERT INTO t SET c = 'a';
Query OK, 1 row affected (0.01 sec)

mysql> SELECT HEX(c), c = 'a', c = 'a\0\0' from t;
+--------+---------+-------------+
| HEX(c) | c = 'a' | c = 'a\0\0' |
+--------+---------+-------------+
| 610000 |       0 |           1 |
+--------+---------+-------------+
1 row in set (0.09 sec)
```
如果检索的值必须和没有填充存储的值一样，那么可能用varbinary或者blob数据类型的一种比较合适。

### BIT

位字段类型，BIT(M)中表示二进制位数。范围为1 <= M <= 64，默认值为1。如果值的长度小于M位，在值的左边用0填充。


### BLOB 和 TEXT

**BLOB(Binary Large Object)**，二进制大对象，是一个可以存储二进制文件的容器。典型的BLOB是一张图片或多媒体文件。在SQL处理时，BLOB数据被视作二进制字符串进行比较和排序。

类型 | 大小(字节)
-- | --
TINYBLOB | 最大255B 2*8
BLOB | 最大64KB 2*16
MEDIUMBLOB | 最大16MB 2*24
LONGBLOB | 最大4GB 2*32

当插入的数据超过BLOB的限制大小时，多出的二进制字符会被截断，并返回WARNNING。

**TEXT**保存大文本数据，存储的是字符。

类型 | 大小(字符)
-- | --
TINYTEXT | 最大255 2*8
TEXT | 最大64KB 2*16
MEDIUMTEXT | 最大16MB 2*24
LONGTEXT | 最大4GB 2*32

在SQL处理时，TEXT中的字符数据不区分大小写。


在MySQL中，BLOB/TEXT都不直接存储在数据页中，而是在数据页中存储一个指向BLOB/TEXT数据位置的指针，因此==BLOB/TEXT无法直接成为PRIMARY KEY==。并且==如果要在BLOB/TEXT列上加上索引KEY，需要指明建立索引的前缀数。==

```sql
mysql> create table test (doc text not null, primary key (doc))engine=InnoDB;
ERROR 1170 (42000): BLOB/TEXT column 'doc' used in key specification without a key length
```
```sql
mysql> create table test (doc text not null, primary key (doc(10)))engine=InnoDB;
Query OK, 0 rows affected (0.01 sec)
```

### SET和ENUM

由于MySQL不支持传统的CHECK约束，因此通过ENUM和SET类型可以对插入数据进行简单约束。

#### SET

**SET**是一个字符串对象，一个可以有0个或多个值。其值必须来自于列创建时定义的允许范围。
```
mysql> create table test (name set('jack','green','james','tim'));
Query OK, 0 rows affected (0.02 sec)
```
```
mysql> insert into test (name) values ('jack,green,tim');
Query OK, 1 row affected (0.00 sec)
```
==SET插入数据时，是以一个字符串的格式同时插入，数据之间以逗号隔开，所以SET定义的数据本身不能含有逗号。==

**SET最多只能存储64个元素**，且存储方式为：
```
1～8成员的集合，占1个字节。
9～16成员的集合，占2个字节。
17～24成员的集合，占3个字节。
25～32成员的集合，占4个字节。
33～64成员的集合，占8个字节。
```
==SET在数据库中存储的并不是元素本身，而是元素序号==，且MySQL在存储时会按照定义的顺序存储元素。

使用`find_in_set()`方法或LIKE修饰符查找SET。
```
mysql> select * from test where find_in_set('jack',name);
+----------------+
| name           |
+----------------+
| jack,green,tim |
+----------------+
1 row in set (0.00 sec)

mysql> select * from test where name like '%ja%gr%';
+----------------+
| name           |
+----------------+
| jack,green,tim |
+----------------+
1 row in set (0.00 sec)
```
#### ENUM

ENUM和SET一样也是一个字符串对象，并且在列定义时给出所有允许值列表。

**ENUM允许同时定义最多65535个允许值。**

MySQL对ENUM的存储同样是存储元素编号。除了插入数据时，除了插入预定义字符串，也可以直接用定义时的枚举顺序。

```
mysql> create table test (name enum('jack','green','james','tim'));
Query OK, 0 rows affected (0.01 sec)

mysql> insert into test (name) values ('jack');
Query OK, 1 row affected (0.00 sec)

mysql> insert into test (name) values (2);
Query OK, 1 row affected (0.00 sec)

mysql> select * from test;
+-------+
| name  |
+-------+
| jack  |
| green |
+-------+
2 rows in set (0.00 sec)
```

由于枚举成员在MySQL存储中映射到枚举顺序，因此可以使用运算符来进行查询：
```
mysql> select * from test where name > 1;
+-------+
| name  |
+-------+
| green |
+-------+
1 row in set (0.00 sec)
```


## REFS

- http://seanlook.com/2016/04/28/mysql-char-varchar-set/