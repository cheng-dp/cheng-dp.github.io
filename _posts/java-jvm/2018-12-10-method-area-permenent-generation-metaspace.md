---
layout: post
title: 方法区和永久代和元空间
categories: [Java, JVM]
description: 方法区和永久代和元空间
keywords: Java, JVM
---


### 方法区(Method Area)

只是JVM规范中定义的一个概念，用于存储类信息、常量池、静态变量(static)、JIT编译后的代码等数据。但是规范并没有规定如何实现、具体放在哪里。

### 永久代(Permanent Generation)

是Hotspot虚拟机对方法区的一种实现，只有Hotspot虚拟机有，逻辑上属于Java堆。永久代有一个别名"Non-Heap"（非堆）用以区分。

永久代逻辑上属于Java堆，和新生代、老年代在物理上是连续的空间。永久代没有自身的垃圾回收算法，和老年代的FullGC一起回收，但是永久代的回收条件比价苛刻：

1. 类的实例都被回收。
2. 加载该类的ClassLoader已被回收。
3. 类信息不能通过反射访问到其方法。

限制永久代大小：`-XX:MaxPermSize`

#### 永久代变迁

Java 6中，类元信息、符号引用、全局字符串常量池、运行时常量池、静态变量、JIT编译后的代码，都在永久代中。

Java 7中，类元信息、运行时常量池、JIT编译后的代码依然在永久代中。静态变量移动到Class对象的末尾，即Java堆中，全局字符串常量池也被移至Java堆，符号引用被移至直接内存中。

Java 8中，永久代被废弃，类元信息、运行时常量池、JIT编译后的代码移至直接内存的元空间(Metaspace)中。‑XX:MaxPermSize 参数失去了意义，取而代之的是-XX:MaxMetaspaceSize。

### 元空间(MetaSpace)

HotSpot中，永久代的回收依赖于老年代的FullGC，给垃圾回收带来不必要的复杂度，并且条件比较苛刻，回收效率偏低。

随着Java的发展，动态生成类信息变得越来越频繁，永久代内存溢出的可能性提高，需要对方法区提供更好的管理，因此在Java 8中移除了永久代，而改用元空间(MetaSpace)管理方法区(类元信息、运行时常量池、JIT编译后的代码)。

1. 在本地内存中请求空间并分块。

2. 一个块绑定一个类加载器，类加载器从属于它的块中分配空间。

3. 当类加载器卸载类时，对应的块将被回收或返回给操作系统。

`-XX:MetaspaceSize` : 初始值，超过该值将触发Metaspace的回收。

`-XX:MaxMetaspaceSize` : 超过该值将抛出OutOfMemoryError异常。

元空间的分配和回收由专门的元空间虚拟机(C++实现)管理，当元空间使用量超过MetaspaceSize的值时，元空间虚拟机将在MaxMetaspaceSize内自动增加元空间大小。