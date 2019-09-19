---
layout: post
title: 直接内存和DirectByteBuffer
categories: [Java, JVM]
description: 直接内存和DirectByteBuffer
keywords: Java, JVM
---


## 直接内存

直接内存(Direct Memory)又叫堆外内存，直接内存不是Java虚拟机规范中定义的运行时内存区域，也不属于JVM虚拟机管理，而是直接受操作系统管理。

直接内存不受JVM堆内存大小限制，但是也可能导致OutOfMemoryError异常，仍然需要限制分配的最大直接内存大小(-XX:MaxDirectMemorySize)。

## DirectByteBuffer

```java
java.nio.DirectByteBuffer extends MappedByteBuffer implements sun.nio.ch.DirectBuffer  
```

JDK 1.4新加入了NIO机制，并提供了DirectByteBuffer类，DirectBuffer类继承自ByteBuffer，但与HeapByteBuffer不同，DirectByteBuffer不在JVM堆上分配，而是直接分配在直接内存中。

DirectByteBuffer在低层实现上直接使用os::malloc分配内存。

```java
ByteBuffer buffer = ByteBuffer.allocateDirect(500);//分配500个字节的DirectBuffer
for (int i = 0; i < 100000; i ++) {
    for (int j = 0; j < 99; j ++) {
        buffer.putInt(j);           //向DirectBuffer写入数据
    }
    buffer.flip();
    for (int j = 0; j < 99; j ++) {
        buffer.get();                   //从DirectBuffer中读取数据
    }
    buffer.clear();
}
System.out.println("DirectBuffer use : " + ( System.currentTimeMillis() - start ) + "ms");
```

### DirectByteBuffer直接内存回收

**DirectByteBuffer实现：**

Java NIO中的DirectByteBuffer自身是一个Java对象，在Java堆中，对象中保存一个long类型的字段address，记录着malloc()申请到的直接内存地址。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/java_DirectByteBuffer.png)

**直接内存回收**

DirectByteBuffer中有一个内部静态类Deallocator，实现了Runnable接口，并维护一个对DirectByteBuffer对象的虚引用(PhantomReference)。

当DirectByteBuffer对象被GC回收时，Deallocator会通过虚引用得到通知，创建一个线程释放该DirectByteBuffer对象malloc申请的直接内存空间。

### 为什么用DirectByteBuffer

1. 减少复制操作，加快传输速度

HotSpot虚拟机中，GC除了CMS算法之外，都需要移动对象。

在NIO实现中(如: FileChannel.read(ByteBuffer dst), FileChannel.write(ByteByffer src)), ==底层要求连续的内存，且使用期间不得变动==， 如果提供的Buffer是HeapByteBuffer，为了保证在数据传输时，被传输的byte数组背后的对象不会被GC回收或者移动，JVM会首先将堆中的byte数组拷贝至直接内存，再由直接内存进行传输。

那么，相比于HeapByteBuffer在堆上分配空间，直接只用DirectByteBuffer在直接内存分配就节省了一次拷贝，加快了数据传输的速度。

2. 减少GC压力

虽然GC仍然管理DirectByteBuffer，但基于DirectByteBuffer分配的空间不属于GC管理，如果IO数量较大，可以明显降低GC压力。

### 注意事项

1. 创建和销毁比普通Buffer慢。

虽然DirectByteBuffer的传输速度很快，但是创建和销毁比普通Buffer慢。因此DirectByteBuffer不适合只是短时使用需要频繁创建和销毁的场合。

2. 使用直接内存要设置-XX:MaxDirectMemorySize指定最大大小。

直接内存不受GC管理，而基于DirectByteBuffer对象的自动回收过程并不稳定，如DirectByteBuffer对象被MinorGC经过MinorGC进入老年代，但是由于堆内存充足，迟迟没有触发Full GC，DirectByteBuffer将不会被回收，其申请的直接内存也就不会被释放，最终造成直接内存的OutOfMemoryError。

## REFS

- https://www.kancloud.cn/zhangchio/springboot/806316
 
```
本文地址：https://cheng-dp.github.io/2018/12/11/direct-memory-and-direct-byte-buffer/
```
 
