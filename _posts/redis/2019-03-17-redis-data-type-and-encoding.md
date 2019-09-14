---
layout: post
title: Redis中的数据类型及数据结构
categories: [Redis]
description: Redis中的数据类型及数据结构
keywords: Redis
---


# 底层数据结构

- sds 简单动态字符串
- list 链表
- dict 字典
- skiplist 跳跃表
- intset 整数集合
- ziplist 压缩列表
- quicklist 快速列表


## 简单动态字符串 sds (REDIS_EOCNDING_EMBSTR/REDIS_ENCODING_RAW)

```C
// simple dynamic string header
struct sdshdr {
    int len;
    int free;
    char buf[];//字节数组
}
```

SDS相比于C字符串有如下优点：

1. 常数复杂度获取字符串长度。
2. 杜绝缓冲区溢出。
3. 减少修改字符串时内存重分配次数。
4. 由于没有对字节数组做任何定义限制(如C中字符串以/0结尾)，SDS结构能安全的保存任意格式的二进制数据。
5. 兼容C字符串。

```
一个字符串最大大小是多少？

sdshdr结构中用int值记录字符串的长度和空闲长度，int值的最大值为2^32次方，也就是最多记录2^32次方个char字符，那么最大的大小为4GB.
但是，Redis人为设置了String最大为512MB。
```

```
sds如何扩容：

若新增长度大于free，新增后总长度 len + addlen 小于 1 MB的，按新长度的 2 倍扩容；新增后总长度 len + addlen 大于 1 MB的，按新长度加上 1 MB扩容。
```

## 链表 list (REDIS_ENCODING_LINKEDLIST)
```C
typedef struct listNode {
    struct listNode* prev;
    struct listNode* next;
    void *value;
}

typedef struct list {
    listNode* head;
    listNode *tail;
    unsigned long len;
    void*(*dup)(void *ptr);
    void (*free)(void *ptr);
    int (*match)(void *ptr, void *key);
} list;
```

1. 双端、无环、带表头表尾指针、带长度计数。
2. 多态，可以用于保存各种不同类型的值。

## 字典 dict (REDIS_ENCODING_HT)
```C
typedef struct dict {
    dictType * type;
    void *privdata;
    dictht ht[2];
    int trehashidx;
} dict;
//ht属性是一个包含两个项的数组，数组中的每个项都是一个dictht哈希表，一般情况下，字典只使用ht[0]哈希表，ht[1]哈希表只会在对bt[0]哈希表进行rehash时使用。
```
1. Redis中的字典使用哈希表作为底层实现，每个字典带有两个哈希表，一个平时使用，另一个仅在进行rehash时使用。
2. 当字典被用作数据库的底层实现，或者哈希键的底层实现时，Redis使用MurmurHash2算法来计算键的哈希值。
3. 哈希表使用链地址法解决冲突。
4. 在对哈希表进行扩展或者收缩操作时，程序需要将现有的哈希表包含的所有键值对rehash到新哈希表里。并且这个rehash过程并不是一次性完成的，而是渐进式完成。

## 跳跃表 skiplist (REDIS_ENCODING_SKIPLIST)

1. Redis使用跳跃表作为有序集合键的底层实现之一，当有序集合包含的元素数量较多、或者有序集合中元素的成员是比较长的字符串时，Redis会使用跳跃表来作为有序集合键的底层实现。
2. Redis跳跃表由zskiplist和zskiplistNode两个结构组成，其中zskiplist用于保存跳跃表信息(表头、表尾、长度)，而zskiplistNode则用于表示跳跃表节点。
3. 每个跳跃表节点层高是1至32之间的随机数。
4. 跳跃表中的节点按照分值大小进行排序，当分值相同时，节点按照成员对象的大小进行排序。

## 整数集合 intset (REDIS_INCODING_INTSET)

整数集合(intset)是集合键的底层实现之一，当一个集合：
1. 只包含整数值元素。
2. 并且这个集合的元素数量不多。
Redis就会使用整数集合作为集合键的底层实现。
```java
typedef struct intset{
    unit32_t encoding; // contents中数据编码方式。
    uint32_t length; // contents中元素的实际数量。
    int8_t contents[]; // 每个集合值按从小到大排列。
} intset;
```
虽然intset结构将contents属性申明为int8\_t类型的数组，但实际上contents数组并不保存任何int8_t类型的值，真正类型取决于encoding属性的值。

encoding | 类型 | 字节
---|---|---
INTSET_ENC_INT16 | int16_t | 2
INTSET_ENC_INT32 | int32_t | 4
INTSET_ENC_INT64 | int64_t | 8

### 升级

每当要添加新元素时，如果新元素比整数集合现有的所有元素长(如对int16_t的整数集合添加65535)，则要先对整数集合进行升级：

1. 根据新元素类型，扩展底层数据空间。
2. 保持已存在元素的顺序，转换为新类型，并放置到正确位置上。
3. 添加新元素。

**整数集合不支持降级。**

## 压缩列表 ziplist (REDIS_ENCODING_ZIPLIST)

压缩列表(ziplist)是列表键和哈希键的底层实现之一。当：

1. 一个列表键只包含少量列表项。
2. 每个列表项要么是小整数值，要么是短字符串。

时，Redis就会使用压缩列表来做列表键的底层实现。  
或者：

1. 一个哈希键只包含少量键值对。
2. 每个键值对的键和值要么是小整数值，要么是长度比较多的字符串。

时，Redis就会使用压缩列表作为哈希键的底层实现。

### 压缩列表实现

压缩列表是Redis为了节约内存开发的，是有一系列特殊编码的**连续内存**组成的顺序性数据结构。一个压缩列表包含任意多个节点(entry)，每个节点保存一个字节数组或者一个整数值。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_ziplist.png)


#### 压缩链表节点Entry

每个压缩列表节点(entry)都由previous_entry_length, encoding, content三个部分组成：

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_ziplist_entry.png)

1. previous_entry_length

previous_entry_length的长度可以是1字节或者5字节。

如果前一节点的长度小于254字节，那么previous_entry_length属性的长度为1字节，否则为5字节。

可以通过当前节点的地址和previous_entry_length前一节点地址，因此能方便的对ziplist进行反向遍历。

2. encoding

encoding记录了节点content属性的数据类型及长度，分别为1字节、2字节和5字节。

3. content

保存节点值，可以是一个字节数组或者整数，类型和长度由encoding属性决定。

#### 连锁更新问题

当ziplist中，多个连续的节点长度都为253字节到250字节之间时，此时向其中插入一个长度大于等于254字节的新节点，下一个节点的previous\_entry_length长度由1字节扩展为5字节，并传导至再下一个字节，引发连锁更新。

连锁更新在最坏情况下需要对ziplist执行N次空间重分配，每次重分配最坏时间复杂度为O(N)，因此连锁更新的最坏复杂度为O(N^2)。

由于实际中恰好有连续多个、长度介于250到253字节的节点的情况不多见，因此，仍然认为ziplistPush等命令的平均复杂度仍为O(N)。


## 快速链表 quicklist 

### 结构

==在Redis 3.2前==，列表是基于ziplist和linkedlist实现的，当数据量少、元素长度小的时候使用ziplist，数据量多、元素长度大时转换为linkedlist。

Redis 3.2后，列表的底层实现统一改为quicklist，quicklist是一种结合了linkedlist和ziplist的数据结构，双向链表的每一个节点都是ziplist。

quicklist:
```
typedef struct quicklist {
    quicklistNode *head; // 指向quicklist头节点
    quicklistNode *tail; // 指向quicklist尾节点
    unsigned long count; // 列表中所有数据项的个数
    unsigned int len; // quicklist节点个数，即ziplist的个数
    int fill : 16; // ziplist大小限定，由 list-max-ziplist-size 给定
    unsigned int compress : 16; // 节点压缩深度，由 list-compress-depth 给定
}
```

quicklistNode:
```
typedef struct quicklistNode {
    struct quicklistNode *prev; // 指向上一个ziplist节点
    struct quicklistNode *next; // 指向下一个ziplist节点
    unsigned char *zl; // 数据指针，如果没有被压缩就指向ziplist结构，反之指向quicklistLZF结构
    unsigned int sz; // ziplist结构的内存占用长度
    unsigned int count : 16; // ziplist中的数据项个数
    unsigned int encoding : 2; // 编码方式 1-ziplist, 2-quicklistLZF
    unsigned int container : 2; // 预留字段，数据存放方式，1-NONE, 2-ziplist
    unsigned int recompress : 1; // 解压标记，当查看一个被亚索的数据时，需要暂时解压，标记此参数为1，之后再重新进行亚索
    unsigned int attempted_comporess : 1; // 测试相关
    unsigned int extra : 10; // 扩展字段，暂时没用
} quicklistNode;
```
quicklistLZF:
```
// 使用LZF算法对中间的ziplist节点进行压缩，结果存放在quicklistLZF中
typedef struct quicklistLZF {
    unsigned int sz; /// 压缩后的ziplist大小
    char compressed[]; // 柔性数组，存放压缩后的ziplist字节数组
} quicklistLZF;
```

quicklist结构：

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_quicklist.png)

### 配置

#### list-max-ziplist-size

配置一个quicklist节点上的ziplist的长度。

```
每个节点的ziplist长度越短，则内存碎片越多，产生无法利用的小碎片，降低存储效率。极端情况每个节点的ziplist只包含一个数据项，退化为双向链表。

每个节点的ziplist的长度越长，则每次增减元素都需重新分配大块连续内存空间，降低存储效率，极端情况整个quicklist只有一个节点，退化为一个ziplist。
```

**参数取值：**

当取正值的时候，表示按照数据项个数来限定每个quicklist节点上的ziplist长度。比如，当这个参数配置成5的时候，表示每个quicklist节点的ziplist最多包含5个数据项。

当取负值的时候，表示按照占用字节数来限定每个quicklist节点上的ziplist长度。这时，它只能取-1到-5这五个值，每个值含义如下：

- -5: 每个quicklist节点上的ziplist大小不能超过64 Kb。（注：1kb => 1024 bytes）
- -4: 每个quicklist节点上的ziplist大小不能超过32 Kb。
- -3: 每个quicklist节点上的ziplist大小不能超过16 Kb。
- -2: 每个quicklist节点上的ziplist大小不能超过8 Kb。（-2是Redis给出的默认值）
- -1: 每个quicklist节点上的ziplist大小不能超过4 Kb。


#### list-compress-depth

当列表很长时，最容易访问的是两端的数据，中间的数据被访问的频率低、性能也低(O(n))，quicklist提供了`list-comporess-depth`选项对中间的数据进行压缩，设置quicklist两端不被压缩的节点个数。

- 0: 是个特殊值，表示都不压缩。（默认值）
- 1: 表示quicklist两端各有1个节点不压缩，中间的节点压缩。
- 2: 表示quicklist两端各有2个节点不压缩，中间的节点压缩。
- 3: 表示quicklist两端各有3个节点不压缩，中间的节点压缩。
- 依此类推…




# Redis对象

Redis并没有直接使用主要数据结构实现键值对数据库，而是基于这些数据结构创建对象系统。包括五种数据类型。

每当我们在Redis中创建键值对时，至少会创建两个对象，一个是键、一个是值。

- String 字符串
- hash 哈希
- set 集合
- zset 有序集合
- list 列表
- bitmap 位图
- hyperloglog
- GEO 地理位置


## 对象的类型与编码

```C
typedef struct redisObject {
    unsigned type:4; // 类型
    unsigned encoding:4; // 编码
    int refcount; //引用计数
    unsigned lru:22; //空转时长
    void *ptr; // 指向底层数据结构的指针
    ...//不完全
    
}
```

Redis的键总是一个字符串对象，而值可以是五种类型的任意一种。

编码记录了对象使用的底层数据结构。

```
TYPE 命令查看值的类型
OBJECT ENCODING 命令查看值的编码
```

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_object_encoding.png)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_type_encoding.png)
==Redis 3.2 及以后 REDIS_ENCODING_LINKEDLIST中改为只使用QUICKLIST==

## 字符串对象

字符串对象的编码可以是:
编码 | 条件
---|---
int | 可用long类型保存的整数
embstr | 字符串值且长度<=32，可以用long double类型保存的浮点数
raw | 长字符串或浮点数。

```
浮点数也作为字符串保存。
```

1. int -> raw, 当执行命令后，对象不再是整数时，会被转为raw。
2. embstr -> raw, embstr是只读的，当执行修改命令时，会被转为raw。

### embstr

embstr是专门用于保存短字符串的优化编码方式，和raw唯一的不同处是：

```
embstr仅调用一次内存分配函数，redisObject和sdshdr两个结构依次排列，
而raw需要分配两次内存分别创建redisObject和sdshdr结构。
```

## 列表对象

列表对象可以是：
1. ziplist
2. linkedlist

==Redis 3.2及以后列表对象改为只使用quicklist.==

```
linkedlist使用双端队列作为底层实现，每个节点保存一个字符串对象，在该字符串对象中保存列表元素。

字符串对象是Redis中唯一一种会被其他四种类型对象嵌套的对象。
```

当满足以下条件时，使用ziplist:

1. 列表对象保存的所有字符串元素的长度都小于64字节。
2. 列表保存的元素数量小于512个。

否则使用linkedlist。  
当ziplist修改后不满足上述条件时，会被转换为linkedlist。

## 哈希对象

哈希对象的编码可以是：
1. ziplist
2. hashtable

### ziplist实现hash对象

向ziplist插入hash对象键值对，先将键插入到压缩列表表尾，再将值插入到压缩链表表尾。键值紧挨，键在前值在后。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_hash_ziplist.png)

当满足以下条件时，哈希对象使用ziplist编码：
1. 所有键值对的键和值的字符串长度小于64字节。
2. 键值对数量小于512个。

否则使用hashtable。

## 集合对象

集合对象可以是：
1. intset
2. hashtable

使用hashtable编码时，用键保存集合对象的元素，而值全部设为null。

当满足以下条件时，使用intset编码：
1. 所有元素是整数值。
2. 元素数量不超过512个。

## 有序集合

有序集合的编码可以是：
1. ziplist
2. skiplist

### 使用ziplist编码 

每个集合元素用两个紧挨的节点保存，第一个节点保存元素成员(member)，第二个节点保存元素分值(score)，并按分值从小到大排序。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/redis_sorted_list_ziplist.png)

### 使用skiplist编码

底层结构zset包含跳跃表zsl和字典dict。
```C
typedef struct zset {
    zskiplist *zsl;
    dict *dict;
} zset;
```
增加字典是维护从成员到分值的映射，使得查找给定成员分值的复杂度为O(1)。

当有序集合对象同时满足以下两个条件，使用ziplist：
1. 保存的元素数量小于128个。
2. 所有元素长度小于64字节。


## 位图 bitmap

bitmap是基于String实现的，因为String是二进制兼容的，所以，bitmap只是对String存储的值提供了一系列二进制操作命令。

```
setbit key offset value
getbit key offset
bitcount start end
//...
```

## HyperLogLog

HyperLogLog是一种计算元素集中基数**个数**的算法。(基数指的是元素集中的不重复元素)。

HyperLogLog的优点是，在输入元素数量或者体积非常大时，计算基数所需的空间总是固定的、并且是很小的。在Redis中，每个HyperLogLog键只需要花费12KB内存，就可以计算接近2^64个不同元素的基数。

由于HyperLogLog基于概率算法，因此HyperLogLog的计算结果是一个带有0.81%标准误差的近似值。

HyperLogLog**只记录基数个数**，不保存元素，无法得到元素值。

HyperLogLog的低层也是基于String存储数据。

### HyperLogLog命令

HyperLogLog的命令由pf开头，是为了纪念HyperLogLog算法的发明人 `Flajolet Philippe`。

1. pfadd 添加

添加后若键的基数估值改变则返回1，否则返回0. 时间复杂度O(1)

```
127.0.0.1:6379> pfadd m1 1 2 3 4 1 2 3 2 2 2 2
(integer) 1
```

2. pfcount 获得基数值

HyperLogLog只能得到基数个数，无法得到元素值。时间复杂度O(N)，N为key的个数

```
127.0.0.1:6379> pfadd m1 1 2 3 4 1 2 3 2 2 2 2
(integer) 1
127.0.0.1:6379> pfcount m1
(integer) 4
```

3. pfmerge 合并多个key

```
127.0.0.1:6379> pfadd m1 1 2 3 4 1 2 3 2 2 2 2
(integer) 1
127.0.0.1:6379> pfcount m1
(integer) 4
127.0.0.1:6379> pfadd m2 3 3 3 4 4 4 5 5 5 6 6 6 1
(integer) 1
127.0.0.1:6379> pfcount m2
(integer) 5
127.0.0.1:6379> pfmerge mergeDes m1 m2
OK
127.0.0.1:6379> pfcount mergeDes
(integer) 6
```

### HyperLogLog的应用

```
统计注册 IP 数
统计每日访问 IP 数
统计页面实时 UV 数
统计在线用户数
统计用户每天搜索不同词条的个数
```

- 当数据量不大时，可以使用set、bitmap、hash等。
- 数据量大时，普通数据结构没法存储(特别是Redis在内存中)，如果能接受一定误差，考虑使用HyperLogLog。


# 对象维护

1. 内存回收

Redis对对象系统使用引用计数方式实现了内存回收。

```C
typedef struct redisObject {
    //...
    int refcount;
    //...
} robj;
```

2. 对象共享

对象的引用计数属性还带有对象共享的作用。

例如：
键A和键B都指向整数值100的字符串对象，则A和B会被指向同一个现有值，对应值100的引用计数+1。

Redis会在初始化时，创建一万革包含从0到9999所有整数值的字符串对象用于共享。

```
OBJECT REFCOUNT 打印键对应值的引用计数。
```

3. 对象空转时长

redisObject结构包含一个属性lru，记录了对象最后一次呗程序访问的时间。

```C
typedef struct redisObect {
    //...
    unsigned lru:22;
    //...
}
```
空转时长就是通过当前时间减去*键的值对象*的lru时间计算得到。`OBJECT IDLETIME`命令打印出空转时长。

空转时长被用于实现内存回收。