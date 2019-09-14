---
layout: post
title: Java堆内存分配与回收策略
categories: [Java, JVM]
description: Java堆内存分配与回收策略
keywords: Java, JVM
---

java主要在堆上分配内存，而Java堆又分为新生代(YoungGen)和老年代(OldGen)两个部分，新生代又再分为Eden区和Survivor区两部分，本文根据java堆的划分，描述hotspot的内存分配策略。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/BLOG/memory-jvm.jpg)

### GC垃圾收集分类
- Minor GC: 发生在新生代中的垃圾收集，采用复制算法。
- Major GC/Full GC: 发生在老年代的垃圾收集动作，所采用的是**标记-清除**或者**标记-整理**算法。

### Eden区和Survivor区
对于采用**复制算法**的虚拟机，新生代通常有一个Eden区和两个Survivor区。
对象优先在Eden区分配，当Eden区没有足够的空间进行分配时，虚拟机讲发起一次Minor GC，Eden中存活的对象将被移动到第一块Survivor区S1，Eden被清空。
当Eden区再次填满，再次触发Minor GC，Eden区和S1中的存活对象被复制送入第二块Survivor区S2中，S1和Eden被清空，下一轮交换S1和S2的角色。
使用两个Survivor区能够简化复制算法的过程，并且避免复制过程中**内存碎片**的产生。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/BLOG/minor_gc.jpg)
当对象的复制次数达到`-XX:MaxTenuringThreshold`设置的值(默认-XX:MaxTenuringThreshold=15)时，将被移至老年代。

### 实验
```java
/**
 * VM Options:
 * -Xmx20M 堆最大20M
 * -Xms20M 堆最小20M
 * -Xmn10M 新生代为10M
 * -XX:SurvivorRatio=8 Eden区和Survivor区的比值为8:1
 * -XX:+PrintGCDetails 输出回收日志及退出时内存各区域情况
 */
private static final int _1MB = 1024 * 1024;
public static void testAllocation(){
    byte[] allocation1,allocation2,allocation3,allocation4;
    allocation1 = new byte[2 * _1MB];
    allocation2 = new byte[2 * _1MB];
    allocation3 = new byte[2 * _1MB];
    allocation4 = new byte[4 * _1MB];
}
```
结果：
```
 PSYoungGen      total 9216K, used 7479K [0x00000007bf600000, 0x00000007c0000000, 0x00000007c0000000)
  eden space 8192K, 91% used [0x00000007bf600000,0x00000007bfd4df10,0x00000007bfe00000)
  from space 1024K, 0% used [0x00000007bff00000,0x00000007bff00000,0x00000007c0000000)
  to   space 1024K, 0% used [0x00000007bfe00000,0x00000007bfe00000,0x00000007bff00000)
 ParOldGen       total 10240K, used 4096K [0x00000007bec00000, 0x00000007bf600000, 0x00000007bf600000)
  object space 10240K, 40% used [0x00000007bec00000,0x00000007bf000010,0x00000007bf600000)
 Metaspace       used 2692K, capacity 4486K, committed 4864K, reserved 1056768K
  class space    used 288K, capacity 386K, committed 512K, reserved 1048576K
```
在退出时各个区域结果如上, PSYoungGen的`PS`指的是`Parallel Scavenge`垃圾回收器，ParOldGen中的`Par`指的是`Parallel Old`垃圾回收器。  
设置中堆为10M，新生代为10M，因此老年代为10M。设置SurvivorRatio为8:1，因此Eden区大小为8M，Survivor区大小为1M。因为Survivor区同一时刻只有一个能用于分配，因此PSYoungGen区域总可用大小为9M。  
在allocation4进行分配时，新生代eden区已经用了6M，只剩2M，无法进行分配，触发MinorGC。新生代中3个2M大小的对象全部无法放入1M的Survivor区中，所以只能通过分配担保机制将两个2M的对象放入老年代中，再将allocation4的4M对象放入Eden区中。
最终Eden区分配6M，survivor区中没有对象，老年代分配4M。

### 大对象直接进入老年代
大对象是指需要大量连续内存空间的Java对象。为了避免在Eden区及两个Survivor区之间发生大量的内存复制，虚拟机提供了`-XX:PretenureSizeThreshold`参数。大于该参数设置值的对象将直接分配在老年代。

### 长期存活对象直接进入老年代
虚拟机给每个对象定义了一个对象年龄计数器，对象每经过一个MinorGC仍然存活，则年龄加一，当年龄增加到超过`-XX:MaxTenuringThreshold`设置的值(默认为16)时，将被移至老年代。

### 空间分配担保

MinorGC中，一部分晋升的对象将放入老年代，当Survivor分区容量不足时，也会有一部分对象直接被分配至老年代，因此，==MinorGC前需要保证老年代可用空间的大小==。

- 如果老年代可用连续空间大于新生代所有对象总空间，则MinorGC肯定是安全的。
- 如果老年代可用连续空间小于新生代所有对象总空间，则需要老年代进行**空间分配担保**。

**空间分配担保**需要保证老年代连续可用空间大小 大于 之前每次MinorGC后晋升到老年代的对象总大小的平均值。

- 如果 小于，则无法保证MinorGC的安全性，先进行一次FullGC，再进行MinorGC。
- 如果 大于，则MinorGC可能是安全的，尝试进行MinorGC，如果晋升的对象大小还是超过了老年代剩余的连续空间大小，则**空间分配担保**失败，再进行FullGC。

**空间分配担保**实质就是在老年代可用连续空间大小 小于 新生代所有对象总空间时，对出现的情况进行了一次细化，减少了FullGC发生的频率。


### 参数设置小结

参数 | 描述
--- | ---
-Xms20M | 堆最小值
-Xmx20M | 堆最大值
-Xmn10M | 新生代大小
-XX:SurvivorRatio=8 | Eden区比Survivor区的大小
-XX:+PrintGCDetails | 输出回收日志和退出时各内存区域情况
-XX:PretenureSizeThreshold=10M | 大于该参数设置值的对象直接分配在老年代
-XX:MaxTenuringThreshold=15 | 新生代对象年龄增加到超过该值时，将被移至老年代

