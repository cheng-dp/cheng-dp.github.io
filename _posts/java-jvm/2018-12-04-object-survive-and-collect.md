---
layout: post
title: Java对象存活和垃圾收集方法
categories: [Java, JVM]
description: Java对象存活和垃圾收集方法
keywords: Java, JVM
---


### 对象存活判断

1. 引用计数法(Reference Counting)

每个对象有一个引用计数属性，新增一个引用时计数加1，引用释放时计数减1，计数为0时可以回收。
优点：实现简单。  
缺点：无法解决对象相互循环引用的问题。  

2. 可达性分析(Reachability Analysis)

从GC Roots开始向下搜索，搜索所走过的路径称为引用链(Reference Chain)。当一个对象到GC Roots没有任何引用链相连时，则证明此对象是不可用的。不可达对象。

优点：更加精确，能够分析出循环引用。
缺点：实现复杂，==需要Stop The World。==

==**GC Roots 对象**==
1. 虚拟机==栈==(栈帧中本地变量表)中引用的对象。
2. 本地方法==栈==中JNI(Native方法)引用的对象。
3. ==方法区==中类静态属性引用的对象。
4. ==方法区==中常量引用的对象。

==**Java中的Reference引用**==
1. 强引用(String Reference)  
Object obj = new Object();  
只要强引用还存在，GC永远不会回收被引用的对象。  

2. 软引用(Soft Reference)

直到内存空间不够时，才会被GC。  
用来描述还有用但非必须的对象。

可以用来实现内存敏感的高速缓存。

3. 弱引用(Weak Reference)

只能生存到下一次垃圾回收之前，无论内存是否足够。(当对象只有弱引用时，下一次垃圾回收仍会被回收)。

弱引用不会影响对象的生命周期。

例子：ThreadLocal中通过Map<WeakReference<ThreadLocal>, Object>保存对象。
```
To help deal with very large and long-lived usages, the hash table entries use WeakReferences for keys.

为了应对非常大和长时间的用途，哈希表使用弱引用的 key。
下面我们分两种情况讨论：
key 使用强引用：引用的ThreadLocal的对象被回收了，但是ThreadLocalMap还持有ThreadLocal的强引用，如果没有手动删除，ThreadLocal不会被回收，导致Entry内存泄漏。
key 使用弱引用：引用的ThreadLocal的对象被回收了，由于ThreadLocalMap持有ThreadLocal的弱引用，即使没有手动删除，ThreadLocal也会被回收。value在下一次ThreadLocalMap调用set,get，remove的时候会被清除。
```

4. 虚引用(Phantom Reference)

也称为幽灵引用或幻影引用。  
完全不会对其生存时间构成影响。  
唯一目的就是能在这个对象被回收时收到一个系统通知。

虚引用主要用来跟踪对象的垃圾回收回收的活动。

```
jdk中直接内存的回收就用到虚引用，由于jvm自动内存管理的范围是堆内存，而直接内存是在堆内存之外（其实是内存映射文件，自行去理解虚拟内存空间的相关概念），所以直接内存的分配和回收都是有Unsafe类去操作，java在申请一块直接内存之后，会在堆内存分配一个对象保存这个堆外内存的引用，这个对象被垃圾收集器管理，一旦这个对象被回收，相应的用户线程会收到通知并对直接内存进行清理工作。
```

### GC和finalize


### 安全点、安全区域的判断

### ooPMap


### 垃圾收集算法

1. 标记-清除算法(Mark-Sweep)

算法分为“标记”和“清除”两个阶段：首先标记出所有需要回收的对象，在标记完成后统一回收掉所有被标记的对象。

缺点：
    1. 标记和清除的效率都不高。
    2. 产生内存碎片。

2. 复制算法(Copying)

“复制”（Copying）的收集算法，它将可用内存按容量划分为大小相等的两块，每次只使用其中的一块。当这一块的内存用完了，就将还存活着的对象复制到另外一块上面，然后再把已使用过的内存空间一次清理掉。这样使得每次都是对其中的一块进行内存回收，内存分配时也就不用考虑内存碎片等复杂情况，只要移动堆顶指针，按顺序分配内存即可。

优点：实现简单，运行高效。  
缺点：只是这种算法的代价是将内存缩小为原来的一半，持续复制长生存期的对象则导致效率降低。

3. 标记-压缩算法(Mark-Compact)

复制收集算法在对象存活率较高时就要执行较多的复制操作，效率将会变低。更关键的是，如果不想浪费50%的空间，就需要有额外的空间进行分配担保，以应对被使用的内存中所有对象都100%存活的极端情况，所以在老年代一般不能直接选用这种算法。

根据老年代的特点，有人提出了另外一种“标记-压缩”（Mark-Compact）算法，标记过程仍然与“标记-清除”算法一样，但后续步骤不是直接对可回收对象进行清理，而是让所有存活的对象都向一端移动，然后直接清理掉端边界以外的内存。

4. 增量算法(Incremental Collecting)

增量算法的基本思想是，如果一次性将所有的垃圾进行处理，需要造成系统长时间的停顿，那么就可以让垃圾收集线程和应用程序线程交替执行。每次，垃圾收集线程只收集一小片区域的内存空间，接着切换到应用程序线程。依次反复，直到垃圾收集完成。使用这种方式，由于在垃圾回收过程中，间断性地还执行了应用程序代码，所以能减少系统的停顿时间。但是，因为线程切换和上下文转换的消耗，会使得垃圾回收的总体成本上升，造成系统吞吐量的下降。

5. 分代收集算法(Generational Collection)

把Java堆分为新生代和老年代，这样就可以根据各个年代的特点采用最适当的收集算法。

在新生代中，每次垃圾收集时都发现有大批对象死去，只有少量存活，那就选用复制算法，只需要付出少量存活对象的复制成本就可以完成收集。  
而老年代中因为对象存活率高、没有额外空间对它进行分配担保，就必须使用“标记-清理”或“标记-整理”算法来进行回收。
 
```
本文地址：https://cheng-dp.github.io/2018/12/04/object-survive-and-collect/
```
 
