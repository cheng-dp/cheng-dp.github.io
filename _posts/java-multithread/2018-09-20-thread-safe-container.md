---
layout: post
title: Java线程安全的容器(同步容器类+并发容器类)
categories: [Java, Java多线程]
description: Java线程安全的容器(同步容器类+并发容器类)
keywords: Java, Java多线程
---

### 同步容器类

1. Vector
2. Stack
3. HashTable
4. Collections中的静态工厂方法创建的类：
- synchronizedCollection
- synchronizedList
- SynchronizedMap
- synchronizedSet
- synchronizedSortedMap
- synchronizedSortedSet

同步容器类全部在java.util包中，不属于JUC包。

缺点：

1. 同步容器中的方法都是用synchronized将访问操作串行化，导致并发环境下效率低下。
2. 同步容器在多线程环境下的复合操作，是非线程安全的，仍然需要客户端代码加锁。
```java
public static Object getLast(Vector list) {
int lastIndex = list.size() - 1;
return list.get(lastIndex);
}

public static void deleteLast(Vector list) {
int lastIndex = list.size() - 1;
list.remove(lastIndex);
}
```
两个线程同时调用getLast和deleteLast，getLast的get操作可能会数组越界。

3. 多线程迭代修改容器会抛出ConcurrentModificationException。同样toString/hashCode/equals/containsAll/retainAll等隐式迭代的情况，也可能抛出ConcurrentModificationException。要避免ConcurrentModificationException，必须在迭代过程中持有容器的锁。


### 并发容器

Java 1.5引入了JUC包，其中提供了并发容器。

##### 概览

**Map**:

- ConcurrentHashMap (代替LinkedHashMap)
基于分段锁实现的线程安全的Map。
- ==ConcurrentSkipListMap (代替TreeMap)==
基于跳表(SkipList)实现的**key有序**的线程安全Map。

**List/Set**:

- CopyOnWriteArrayList (代替ArrayList)

对可变数组增加写时复制语义实现的线程安全ArrayList，读操作不加锁，写操作加锁，创建低层数据的新副本并在副本上操作，结束后再跟新底层数据引用。

- CopyOnWriteArraySet (代替ArraySet)

基于CopyOnWriteArrayList实现的Set。

- ConcurrentSkipListSet (代替TreeSet)

基于ConcurrentSkipListMap实现的Set，**元素有序**。

**Queue**:
- ConcurrentLinkedQueue

线程安全的无界队列。底层采用单链表。支持FIFO。

- LinkedBlockingQueue

链表实现的阻塞队列。

- ArrayBlockingQueue

数组实现的阻塞队列。
- ==SynchronousQueue==
没有容量的阻塞队列，用于ThreadPoolExecutor#newCachedThreadPool。见《SynchronousQueue实现》.

**Deque**:
- ConcurrentLinkedDeque

线程安全的无界双端队列。底层采用双向链表。支持FIFO和FILO。

- LinkedBlockingDeque

双向链表实现的双端阻塞队列。


##### CopyOnWrite写时复制实现


**CopyOnWriteArrayList**

CopyOnWriteArrayList容器允许并发读，读操作是无锁的。写操作，则首先将当前容器复制一份，然后在新副本上执行写操作，结束之后再将原容器的引用指向新容器。

```java
//写操作加锁，新建副本并在副本上操作，再跟新原容器引用。
//remove操作类似
public boolean add(E e) {
//ReentrantLock加锁，保证线程安全
final ReentrantLock lock = this.lock;
lock.lock();
try {
Object[] elements = getArray();
int len = elements.length;
//拷贝原容器，长度为原容器长度加一
Object[] newElements = Arrays.copyOf(elements, len + 1);
//在新副本上执行添加操作
newElements[len] = e;
//将原容器引用指向新副本
setArray(newElements);
return true;
} finally {
//解锁
lock.unlock();
}
}
//读操作直接返回
public E get(int index) {
return get(getArray(), index);
}
```

**CopyOnWriteArraySet**

CopyOnWriteArraySet直接基于CopyOnWriteArrayList实现，写操作加入CopyOnWriteArrayList时判断是否已经有该元素，没有则加入。

```java
public class CopyOnWriteArraySet<E> extends AbstractSet<E>
implements java.io.Serializable {
private static final long serialVersionUID = 5457747651344034263L;

private final CopyOnWriteArrayList<E> al; //声明al

/**
* Creates an empty set.
*/
public CopyOnWriteArraySet() {
al = new CopyOnWriteArrayList<E>(); //初始化al
}

//...
//...

//直接调用CopyOnWriteArrayList#addIfAbsent。
public boolean add(E e) {
return al.addIfAbsent(e);
}
}
```

**写时复制的缺点**
1. 内存占用

每次写操作都要拷贝一份原容器所有数据，对内存压力大，数据量大时可能造成频繁GC。

2. 无法保证读写实时性

Vector对于读写操作均加锁同步，可以保证读和写的强一致性。而CopyOnWriteArrayList由于其实现策略的原因，写和读分别作用在新老不同容器上，在写操作执行过程中，读不会阻塞但读取到的却是老容器的数据。


##### ConcurrentSkipListMap/ConcurrentSkipListSet实现

ConcurrentSkipListMap底层利用了“跳表”，请参考《跳表(SkipList)的实现分析》。

ConcurrentSkipListMap对跳表的修改都是基于CAS操作，实现了Lock-Free的非阻塞互斥。因为底层基于跳表实现，因此ConcurrentSkipListMap/ConcurrentSkipListSet的查找/插入/删除操作的平均时间复杂度为O(logn)，空间复杂度为O(n)。

##### ConcurrentLinkedQueue/ConcurrentLinkedDeque实现

ConcurrentLinkedQueue利用循环+CAS操作更新节点，实现添加/删除操作。

##### ArrayBlockingQueue/LinkedBlockingQueue/LinkedBlockingDeque

ArrayBlockingQueue中有一个ReentrantLock和一个Condition，对Queue添加和删除操作都需要获取这个ReentrantLock，需要阻塞则加入Condition队列。

LinkedBlockingQueue/LinkedBlockingDeque中添加(放入)和删除(拿出)分别对应一个锁(putLock和takeLock)，并且有两个条件队列notEmpty队列和notFull队列。

### REFS

概览  
- https://blog.csdn.net/u010425776/article/details/54890215

写时复制  
- https://www.cnblogs.com/chengxiao/p/6881974.html
- https://blog.csdn.net/Dax1n/article/details/69950901

ConcurrentLinkedQueue  
- http://www.infoq.com/cn/articles/ConcurrentLinkedQueue

ArrayBlockingQueue/LinkedBlockingQueue  
- https://fangjian0423.github.io/2016/05/10/java-arrayblockingqueue-linkedblockingqueue-analysis/
 
```
本文地址：https://cheng-dp.github.io/2018/09/20/thread-safe-container/
```
 
