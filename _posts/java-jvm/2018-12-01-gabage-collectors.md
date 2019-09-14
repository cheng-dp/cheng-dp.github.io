---
layout: post
title: Java垃圾收集器
categories: [Java, JVM]
description: Java垃圾收集器
keywords: Java, JVM
---

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/JVM_Gabage_Collector.png)

新生代收集器:Serial、ParNew、Parallel Scavenge  
老年代收集器:Serial Old、Parallel Old、CMS  
整堆收集器:G1

两个收集器有连线，表明他们可以组合使用。
- Serial/Serial Old
- Serial/CMS + Serial Old
- ParNew/Serial Old
- ParNew/CMS + Serial Old
- Parallel Scavenge/Serial Old
- Parallel Scavenge/Parallel Old
- G1

### 新生代收集器

#### Serial收集器

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/serial%E6%94%B6%E9%9B%86%E5%99%A8.png)  

特点：  
1. 新生代
2. 复制算法
3. 单线程
4. Stop The World

优点：  
简单高效

参数：
-XX:+UseSerialGC 显示使用串行垃圾收集器

#### ParNew收集器

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/parnew%E6%94%B6%E9%9B%86%E5%99%A8.png)

ParNew和Serial Old

特点：
是Serial收集器的多线程版本，除了多线程外，其余和Serial一样。

优点：  
充分利用多核

缺点：  
存在线程开销

参数：  
-XX:+UseParNewGC 显示使用ParNew
-XX:ParallelGCThreads=8 制定垃圾收集的线程数量，默认与CPU数目相同。

#### Parallel Scavenge收集器

特点：  
1. 与ParNew基本类似，也是新生代、复制算法、多线程。
2. ==其他收集器关注于缩短用户线程停顿时间，Parallel Scavenge更**关注可控吞吐量**，也称为吞吐量收集器(Throughput Collector)。  ==

参数：  
-XX:MaxGCPauseMillis=200  
最大暂停时间，单位为毫秒  

==-XX:GCTimeRatio=99==  
垃圾收集时间占总时间的比率=1/(1+n)，n为99时为1%，相当于设置吞吐量的大小。默认值也是99。

==-XX:+UseAdaptiveSizePolicy==  
开启这个参数后，JVM会根据当前系统运行情况，动态调整相关参数，以提供最合适的暂停时间或最大吞吐量。(相关参数：-Xmn,-XX:SurvivorRatio,-XX:PretenureSizeThreshold等)

**吞吐量VS暂停时间**

吞吐量和暂停时间是互相矛盾的。

吞吐量是指应用程序线程总用时，占程序总用时的比例。吞吐量 = 应用程序线程总时间/(应用程序线程总时间+总暂停时间)  

应用程序GC时会造成额外的线程开销，加上JVM内部安全措施的开销，意味着==GC及随之而来的不可忽略的开销将增加GC线程执行实际工作的时间==。因此要最大化吞吐量就要尽可能减少运行GC的次数。
```
如果收集全部垃圾的时间是固定的，要最大化吞吐量，就要尽量减少其他额外开线，即尽可能减少GC运行次数。
```
然而，GC次数少意味着每次GC时要回收更多的对象，单个GC需要花更多的时间来完成，也就要更多的暂停时间。如果考虑减少暂定时间就要频繁的运行GC，这又导致吞吐量下降。  

高吞吐量适合后台计算不需要太多交互的任务，短停顿时间适合需要与用户交互的任务。
```
ParallelScavenge关注高吞吐量即尽量减少GC次数，适合不需要太多交互的任务。
```
### 老年代收集器

#### Serial Old收集器
Serial收集器的老年代版本。单线程，使用**标记-整理**算法。

在CMS收集器发生ConcurrentModeFailure时可以作为后备使用。

#### Parallel Old收集器

是**Parallel Scavenge**收集器的老年代版本。多线程，采用**标记-整理**算法。

在注重吞吐量以及CPU资源敏感的场景下，就有Parallel Scavenge + Parallel Old的组合。

参数：  
-XX:UseParallelOldGC

#### CMS收集器(Concurrent Mark Sweep,并发标记清理)
见《CMS垃圾收集器》

#### G1收集器(Garbage-First)
见《G1垃圾收集器》



refs:
https://blog.csdn.net/zqz_zqz/article/details/70568819  
https://crowhawk.github.io/2017/08/15/jvm_3/