---
layout: post
title: ThreadLocal实现原理及weakReference内存泄漏问题
categories: [Java, Java多线程]
description: ThreadLocal实现原理及weakReference内存泄漏问题
keywords: Java, Java多线程
---

### ThreadLocal应用

ThreadLocal类用来提供线程内部的局部变量。这些变量在多线程环境下访问(通过get或set方法访问)时能保证各个线程里的变量相对独立于其他线程内的变量，但是又能被线程内部的不同部分访问。类似只在线程内部共享的“全局”变量。

```java
private void testThreadLocal() {
Thread t = new Thread() {
ThreadLocal<String> mStringThreadLocal = new ThreadLocal<>();

@Override
public void run() {
super.run();
mStringThreadLocal.set("local variable in thread");
mStringThreadLocal.get();//
}
};
t.start();
}
```

### ThreadLocal实现原理

##### set方法
```java
public void set(T value) {
Thread t = Thread.currentThread();
ThreadLocalMap map = getMap(t);
if (map != null)
map.set(this, value);
else
createMap(t, value);
}

ThreadLocalMap getMap(Thread t) {
return t.threadLocals;
}

void createMap(Thread t, T firstValue) {
t.threadLocals = new ThreadLocalMap(this, firstValue);
}
```
每一个Thread对象都含有一个ThreadLocal.ThreadLocalMap域，即threadLocals。
1. 判断Thread中的ThreadLocalMap有没有初始化。
2. 已经初始化，则把该ThreadLocal对象作为key，要存储的对象作为value，加到Thead的ThreadLocalMap中。
3. 没有初始化则先初始化，再加入。

##### get方法
```java
public T get() {
Thread t = Thread.currentThread();
ThreadLocalMap map = getMap(t);
if (map != null) {
ThreadLocalMap.Entry e = map.getEntry(this);
if (e != null) {
@SuppressWarnings("unchecked")
T result = (T)e.value;
return result;
}
}
return setInitialValue();
}
```
get方法同样是直接得到thread中的ThreadLocalMap，并以当前ThreadLocal作为key，得到value返回。

##### remove方法
```java
public void remove() {
ThreadLocalMap m = getMap(Thread.currentThread());
if (m != null)
m.remove(this);
}
```
remove方法从thread中的ThreadLocalMap中删除当前ThreadLocal为key的entry。

##### ThreadLocalMap类

ThreadLocalMap是ThreadLocal的一个内部静态类，在Thread类中有一个ThreadLocalMap的域，也就是每个线程thread都有一个ThreadLocalMap域。
```java
class Thread implements Runnable {
//...
ThreadLocal.ThreadLocalMap threadLocals = null;
//...
}
```

ThreadLocalMap的实现如下，其中包含一个由Entry数组实现的Map，Entry中记录了传入的ThreadLocal和存储的value值，通过ThreadLocal作为key计算数组下标。
```java
public class ThreadLocal<T> {
void createMap(Thread t, T firstValue) {
t.threadLocals = new ThreadLocalMap(this, firstValue);
}

//ThreadLocalMap是ThreadLocal的一个静态内部类
static class ThreadLocalMap {
// 自定义Entry类用于存储<ThreadLocal, Value>键值对.
static class Entry extends WeakReference<ThreadLocal> {
Object value;

Entry(ThreadLocal k, Object v) {
super(k);
value = v;
}
}

private Entry[] table;
private static final int INITIAL_CAPACITY = 16;
private int threshold;

ThreadLocalMap(ThreadLocal firstKey, Object firstValue) {
// 使用数组来模拟实现Map.
table = new Entry[INITIAL_CAPACITY];
// 使用ThreadLocal的HashCode来生成下标，尽量减少哈希碰撞
int i = firstKey.threadLocalHashCode & (INITIAL_CAPACITY - 1);
table[i] = new Entry(firstKey, firstValue);
size = 1;
setThreshold(INITIAL_CAPACITY);
}

// 设置扩容resize时的阈值
private void setThreshold(int len) {
threshold = len * 2 / 3;
}
}
}
```

##### 实现总结

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/ThreadLocalMemoryStatus)

1. ThreadLocal通过将数据存储在Thread对象的内部域ThreadLocalMap中来实现对线程的隔离。
2. 通过ThreadLocal对象存储数据都是将ThreadLocal对象作为key在线程的ThreadLocalMap中查找value。
3. 如上图所示，**数据依然是存储在堆中**。



### ThreadLocal的WeakReference内存泄漏问题

##### WeakReference

通过ThreadLocalMap的实现可知，Entry中作为key的是ThreadLocal的一个WeakReference。
```java
static class ThreadLocalMap {
// 自定义Entry类用于存储<ThreadLocal, Value>键值对。
static class Entry extends WeakReference<ThreadLocal> {
Object value;

Entry(ThreadLocal k, Object v) {
super(k);//Entry中的ThreadLocal是一个WeakReference。
value = v;
}
}

private Entry[] table;
//...
}
```
##### 为什么使用弱引用？

官方的说法是：
```
To help deal with very large and long-lived usages, the hash table entries use WeakReferences for keys.
为了应对非常大和长时间的用途，哈希表使用弱引用的 key。
```
1. ThreadLocalMap在Thread内部，生存期和线程一样长。
2. ==如果使用强引用，ThreadLocal在用户程序不再被引用，但是只要线程不结束，在ThreadLocalMap中就还存在引用，无法被GC，导致内存泄漏。==


##### WeakReference内存泄漏的原因

==使用弱引用依然无法避免内存泄漏==，原因如下：

```
如果一个ThreadLocal没有外部强引用引用他，那么系统gc的时候，这个ThreadLocal会被回收。
ThreadLocalMap中就会出现key为null的Entry，就没有办法访问这些key为null的Entry的value。
如果当前线程不结束，这些key为null的Entry的value就会一直存在一条强引用链： 
Thread Ref -> Thread -> ThreaLocalMap -> Entry -> value 
永远无法回收，造成内存泄露。
```
这就是可能造成内存泄漏的原因。

##### 解决办法

ThreadLocal.ThreadLocalMap的实现中已经考虑了这种情况，为了防止出现key为null的Entry，在调用ThreadLocalMap的set、get、remove方法时，都会主动寻找并删除key为null的Entry。

但是，如果key为null后没有调用set、get或remove，key为null的Entry不会被删除，因此，对于ThreadLocal的最佳实践是：

==每次使用完ThreadLocal，都调用它的remove()方法，清除数据。==

### REFS
- https://blog.csdn.net/wzy_1988/article/details/72625482
- https://blog.csdn.net/levena/article/details/78027136
- http://blog.xiaohansong.com/2016/08/06/ThreadLocal-memory-leak/
 
```
本文地址：https://cheng-dp.github.io/2018/10/02/threadlocal/
```
 
