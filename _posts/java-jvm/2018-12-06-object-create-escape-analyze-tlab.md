---
layout: post
title: Java对象创建、逃逸分析和TLAB
categories: [Java, JVM]
description: Java对象创建、逃逸分析和TLAB
keywords: Java, JVM
---


### 对象的创建

#### 对象创建过程

1. 判断类是否加载、解析、初始化  

    虚拟机遇到一条new指令 --> 检查该类是否能在常量池中定位到一个类的符号引用 --> 符号引用代表的类是否被加载、解析、初始化 --> 如果没有则先进行类加载过程。

2. 为新对象分配内存  

    对象的内存分配通常是在Java堆中，也可能在栈上分配(见 逃逸分析)。对于堆中的内存，有两种分配方式：  
    1. 指针碰撞(Bump The Pointer)。  
            
            适用于堆内存是规整的，所有用过的内存在一边，空闲的在另一边，中间放着一个指针作为分界点。分配内存仅需要把这个指针向空闲处移动。  
        
    2. 空闲列表(Free List)。  
            
            适用于堆内存不规整，用过的内存和空闲区相互交错。虚拟机维护一个列表，记录上哪些内存块是可用的，在分配的时候从列表中找到一块足够大的控件划分给对象实例，并更新列表上的记录。  
    
    选择哪种分配方式由Java堆是否规整决定，而Java堆是否规整又由所采用的垃圾收集器是否带有压缩整理功能决定。  
    1. 对于Serial、ParNew等带Compact过程的垃圾收集器，系统采用的是指针碰撞算法。  
    2. 对于CMS这种基于Mark-Sweep算法的收集器，通常采用空闲列表算法。

3. 初始化内存空间  

    初始化内空间为零。

4. 设置对象头

    对对象进行必要的设置，主要是设置对象的对象头信息，比如，这个对象是哪个类的实例、如何才能找到类的元数据信息、对象的哈希码、对象的GC分代年龄等。

5. 初始化

    从虚拟机角度来看，一个新的对象已经产生了，但从Java程序的角度来看，对象创建才刚刚开始，对象实例中的字段仅仅都为零值，还需要通过<init>方法进行初始化，把对象按照程序员的意愿进行初始化。此时，一个真正可用的对象才算完全产生出来。
    
#### Java对象内存分配过程 

1. 编译器通过逃逸分析，确定对象是在栈上分配还是在堆上分配。如果是在堆上分配，则进入选项2. 

2. 如果tlab_top + size <= tlab_end，则在在TLAB上直接分配对象并增加tlab_top 的值，如果现有的TLAB不足以存放当前对象则3.  

3. 重新申请一个TLAB，并再次尝试存放当前对象。如果放不下，则4.  

4. 在Eden区加锁（这个区是多线程共享的），如果eden_top + size <= eden_end则将对象存放在Eden区，增加eden_top的值，如果Eden区不足以存放，则5.  

5. 执行一次Young GC（minor collection）。  

6. 经过Young GC之后，如果Eden区任然不足以存放当前对象，则直接分配到老年代。

#### 对象的内存布局

以最常用的HotSpot虚拟机为例，对象在内存中存储的布局分为3块区域：对象头（Header）、实例数据（Instance Data）、对齐填充（Padding）。  

1. 对象头  

    包含两部分信息，  
    1. **对象自身运行数据**，包括Hash Code、GC分代年龄、锁标志等。  
    2. **类型指针**，指向类元数据的指针。  
    3. 如果对象是Java数组，对象头中还有**一块用于记录数组长度的数据**，因为虚拟机可以通过普通Java对象的元数据信息确定Java对象的大小，但是从数组的元数据中却无法确定数组大小。

2. 实例数据

    真正存储对象有效信息的部分。也就是在程序中定义的各种类型的字段内容，包括从父类继承下来的，以及子类中定义的，都会在实例数据中记录。

3. 对齐填充

    对于HotSpot来说，虚拟机的自动内存管理系统要求对象其实**地址必须是8字节的整数倍**，因此，如果对象实例数据部分没有对齐时，就需要通过对齐填充的方式来补全。

#### 对象的访问定位

对数据的使用是通过栈上的reference数据来操作堆上的具体对象，对于不同的虚拟机实现，reference数据类型有不同的定义:

1. 句柄  

在堆中划出一块内存作为句柄池，reference中存储的就是对象的句柄地址，而句柄中包含了对象实例数据与类型数据各自的具体地址信息。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/java_object_handler_locate.png)

**优点**：reference中存储的是稳定的句柄地址，在对象被移动（垃圾收集时移动对象是非常普遍的行为）时，只会改变句柄中的实例数据指针，而reference本身不需要修改。

2. 直接指针  

此时reference中存储的就是对象的地址。对象的类型数据指针又存储在对象的实例数据中。**HotSpot使用直接指针的方式**。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/java_object_pointer_locate.png)


**优点**：它节省了一次指针定位的时间开销，速度更快。由于对象的访问在Java中非常频繁，因此，这类开销积少成多后也是一项非常可观的执行成本。  



### 逃逸分析

#### 逃逸分析定义

逃逸分析就是分析对象动态作用域，确定对象是否发生逃逸行为。 
在方法中定义的对象，可能被外部方法引用，称为方法逃逸。甚至可能被外部线程访问到，如赋值给类变量(Static)，称为线程逃逸。  

```java
public class EscapeTest {
    public static Object obj;
    public void globalVariableEscape() {  // 给全局变量赋值，发生逃逸
        obj = new Object();
    }
    public Object methodEscape() {  // 方法返回值，发生逃逸
        return new Object();
    }
    public void instanceEscape() {  // 实例引用发生逃逸
        test(this); 
    }
}
```

#### 逃逸分析的作用

如果通过逃逸分析，证明一个对象不会产生==方法逃逸或者线程逃逸==，JVM就可以为这个变量进行优化。

1. 栈分配

如果对象不会产生方法逃逸，就可以让对象在栈上分配内存，==随栈帧出栈而销毁，能够减轻垃圾回收的消耗==。

2. 同步消除(锁省略)

如果对象不会产生线程逃逸，就可以==省略局部变量上的锁操作==。

3. 标量替换

如果逃逸分析证明一个对象不会被外部访问，并且这个对象是可分解的，那程序真正执行的时候将可能不创建这个对象，而改为直接创建它的若干个被这个方法使用到的成员变量来代替。  
拆散后的变量便可以被单独分析与优化，可以各自分别在栈帧或寄存器上分配空间，原本的对象就无需整体分配空间了。  


#### 参数

JDK 1.6及以后版本中默认开启逃逸分析。

-XX:+DoEscapeAnalysis开启逃逸分析
-XX:-DoEscapeAnalysis 关闭逃逸分析


### TLAB(Thread Local Allocation Buffer)

1. JVM在新生代Eden Space中为**每个线程**开辟了一块私有区域，成为TLAB，默认占用Eden Space的1%。
2. 每个TLAB都只有一个线程可以操作，结合bump-the-pointer技术可以快速分配对象，不需要任何锁同步，只需在自己的TLAB中分配即可。
3. 在Java程序中很多对象都是小对象且用过即丢，不存在线程共享也适合被快速GC，所以对于小对象通常JVM会优先分配在TLAB上。
4. TLAB只有在“分配”这个动作上是线程独占的，而在使用/收集(GC)意义上都还是让所有线程共享的。
5. 当线程的TLAB用尽，再要分配就会出发一次“TLAB refill”，也就是说之前自己的TLAB就“不管了”（所有权交回给共享的Eden），然后重新从Eden里分配一块空间作为新的TLAB。


refs:  
对象创建  
https://blog.csdn.net/ahence/article/details/77993768
https://blog.csdn.net/shakespeare001/article/details/51732155  
逃逸分析  
https://blog.csdn.net/yangzl2008/article/details/43202969  
http://www.importnew.com/23150.html  
http://blog.stormma.me/2017/04/21/java%E9%80%83%E9%80%B8%E5%88%86%E6%9E%90/  

 
```
本文地址：https://cheng-dp.github.io/2018/12/06/object-create-escape-analyze-tlab/
```
 
