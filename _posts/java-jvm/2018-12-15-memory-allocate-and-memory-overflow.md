---
layout: post
title: Java内存区域及内存溢出
categories: [Java, JVM]
description: Java内存区域及内存溢出
keywords: Java, JVM
---

### 堆溢出
Java堆用于存储对象实例，只要不断地创建对象，并且保证GC Roots到对象之间有可达路径避免垃圾回收，当到达最大堆的容量限制后就会产生Java.lang.OutOfMemoryError.
```java
/**
 * VM Options:
 * -Xms20M
 * -Xmx20M
 * -XX:+HeapDumpOnOutOfMemoryError
 */
public class HeapOOM{
    static class OOMObject{}
    
    public static void main(String[] args){
        List<OOMObject> list = new ArrayList<OOMObject>();
        while(true){
            list.add(new OOMObject());
        }
    }
}
```
结果：
GC多次执行后触发OutOfMemoryError.

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/BLOG/HeapOutOfMemory.png)

### 栈溢出
关于虚拟机栈，在Java规范中描述了两种异常：
1. 如果线程请求的栈深度大于虚拟机所允许的最大深度，将抛出StackOverflowError异常。
2. 如果虚拟机在扩展栈时无法申请到足够的内存空间，则抛出OutOfMemoryError异常。

然而，在单线程下，虚拟机在栈空间不足时会尝试扩展栈空间，因此，当无法继续分配时，到底是内存太小，还是已使用的栈空间太大，其实是一回事。在实验中，单线程环境下，只会抛出StackOverflowError异常。
```java
/**
 * VM Option:
 * -Xss160K
 */
public class JavaVMStackSOF{
    private int stackLength = 1;
    public void stackLeak(){
        stackLength++;
        stackLeak();
    }
    public static void main(String[] args) throws Throwable{
        JavaVMStackSOF oom = new JavaVMStackSOF();
        try{
            oom.stackLeak();
        }
        catch(Throwable e){
            System.out.println("Stack length:" + oom.stackLength);
            throw e;
        }
    }
}
```
结果：
![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/BLOG/Multi-threadOutOfMemory.png)

操作系统分配给每个进程的内存是有限制的，通常为`操作系统限制总内存-最大堆容量(Xmx)-最大方法区容量(MaxPermSize)-程序计数器消耗`。每个线程分配到的栈容量越大，可以建立的线程数目越小。
```java
/**
 * VM Options:
 * -Xss2M
 */
public class JavaVMStackOOM{
    private void dontStop(){
        while(true){}
    }
    
    public void stackLeakByThread(){
        while(true){
            Thread thread = new Thread(new Runnable(){
                @Override
                public void run(){
                    dontStop();
                }
            });
            thread.start();
        }
    }
    
    public static void main(String[] args) throws Throwable{
        JavaVMStackOOM oom = new JavaVMStackOOM();
        oom.stackLeakByThread();
    }
}
```
结果：
`Exception in thread "main" java.lang.outOfMemoryError: unable to create new native thread`

### 运行时常量池溢出
**运行时常量池在JDK 1.6及之前版本中在方法区中，在1.7及之后转移至堆空间**。在JDK 1.6及之前版本中可以通过限制方法区大小，从而间接限制运行时常量池大小。而在Java8中，已经彻底没有了永久代(JDK 1.7及之前对方法区的实现)，将方法区直接放在一个与堆不相连的本地内存区域，这个区域被叫做元空间。  
```java
/**
 * ONLY WORKS BEFORE JDK 1.7
 * VM Options:
 * -XX:PermSize=10M
 * -XX:MaxPermSize=10M
public class RuntimeConstantPoolOOM{
    public static void main(String[] args){
        List<String> list = new ArrayList<String>();
        int i = 0;
        while(true){
            list.add(String.valueof(i++).intern());
        }
    }
}
```
结果：
`Exception in thread "main" java.lang.OutOfMemoryError:PermGen space`

### 方法区溢出
方法区用于存放Class相关信息，因此要使得方法区溢出，除了在JDK 1.7之前使运行时常量池溢出外，基本的思路是运行时生成大量的类去填满方法区。
结果
`Exception in thread "main" java.lang.OutOfMemoryError:PermGen space`
JDK 1.8中，取消了方法区(永久代Permanent Gen), 取而代之的是元数据区(MetaSpace), 元数据区与方法区在功能上基本一致，最大的不同是，由于随着JDK的不断发展，动态加载和销毁Class变得更加常见，为了防止PermGen容量有限造成经常的OutOfMemoryError，元数据区不再属于虚拟机内存，而是直接分配在本机内存中，并能够动态的增长。

### 直接内存(DirectMemory)溢出
直接内存不是虚拟机运行时数据区的一部分。在JDK 1.4中新加入了NIO(New Input/Output)类，引入了一种基于通道(Channel)与缓冲区(Buffer)的I/O方式，使用Native函数库直接分配堆外内存。  
DirectMemory容量可通过`-XX: MaxDirectMemorySize`指定，如果不指定，则默认与Java堆最大值一样(-Xmx)。直接通过allocateMemory可以造成本机内存溢出。  

结果：  
`Exception in thread "main" java.lang.OutOfMemoryError`  
直接内存溢出的一个特征是Heap Dump文件中不会看先明显的异常指示。如果OOM之后Dump文件很小，而程序中又直接或间接使用了DIO，就应该检查是否直接内存溢出。

### String.intern()
String.intern()是一个Native方法，作用是：如果字符串常量池中已经包含一个等于此String对象的字符串，则返回代表池中这个字符串的String对象，否则，将此String对象包含的字符串添加到常量池中，并且返回此String对象的引用。

```java
public class RuntimeConstantPoolOOM{
    public static void main(String[] args){
        String str1 = new StringBuilder("计算机").append("软件").toString();
        System.out.println(str1.intern() == str1);//JDK 1.6 false JDK 1.7 true
        
        String str2 = new StringBuilder("ja").append("va").toString();
        System.out.println(str2.intern() == str2);//JDK 1.6 false JDK 1.7 true
    }
}
```
在JDK 1.6中，intern()方法会把首次遇到的字符串实例复制到永久代(方法区运行时常量池)，返回的是这个永久代中这个字符串实例的引用，而由StringBuilder创建的字符串实例在Java堆上，所以必然不是同一个引用。  
在JDK 1.7中，intern()实现不会再复制，只是在常量池中记录首次出现的实例引用，因此intern()返回的引用和由StringBuilder创建的那个字符串实例是同一个。

### 小节

内存区域 | 描述 | VM Option | 异常
:-:|:-:|:-:|:-:
程序计数器 | 略 | 略 |略
虚拟机栈 | 存放编译器可知的各种基本类型，对象引用和returnAddress类型 | -Xss160K 每个线程的栈大小 | StackOverflowError/OutOfMemoryError
Java堆 | 存放对象实例 | -Xms10M 最大值<br> -Xmx20M 最小值 | OutOfMemory: Java heap space
运行时常亮池 | 存放编译期生成的字面量和符号引用，运行期也能放入常量池(string.intern())。JDK 1.7之前在方法区中，JDK 1.7及之后移至堆中，jdk1.8放在元空间里面，和堆相独立。 | 随方法区或堆设置 | OutOfMemoryError
方法区 | 存储虚拟机加载的类信息、常亮、静态变量、即时编译器编译后的代码等数据，**又称为永久代(Permanent Generation)** | -XX:PermSize=10M 初始值<br> -XX:MaxPermSize=20M 最大值 | OutOfMemoryError: PermGen space
直接内存 | 在JDK 1.4中加入NIO类，直接分配堆外内存 | -XX:MaxDirectMemorySize=10M,<br> 如果不指定默认与-Xmx一样| OutOfMemoryError
