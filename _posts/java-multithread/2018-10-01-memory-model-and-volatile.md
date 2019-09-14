---
layout: post
title: Java内存模型和volatile实现分析
categories: [Java, Java多线程]
description: Java内存模型和volatile实现分析
keywords: Java, Java多线程
---

### 缓存一致性协议

现代计算机中内存与处理器间都有一层高速缓存(Cache)来加快运算速度。当多个处理器的运算任务(多线程)都涉及同一块主内存区域时，将可能导致各自的缓存数据不一致。

解决缓存不一致的方案有两种：
1. 总线加锁

此时只有一个CPU能运行，效率低。

2. 缓存一致性协议(MESI协议 Modified-Exlusive-Shared-Invalid)

当某个CPU在写数据时，如果发现操作的变量是共享变量，能够通知其他CPU告知该变量的缓存行是无效的，因此其他CPU在读取该变量时，发现其无效会重新从主存中重新加载数据。

缓存一致性协议能够确保每个缓存中使用的共享变量的副本是一致的。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/MESIProtocal.jpg)

### Java内存模型(JMM)

Java虚拟机通过定义==Java内存模型(Java Memory Model, JMM)==来屏蔽掉各种硬件访问的差异。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/java%E5%86%85%E5%AD%98%E6%A8%A1%E5%9E%8B.png)

- 所有的变量都存储在主内存(Main Memory)中。
- 每条线程有自己的工作内存(Working Memory)，线程的工作内存中保存了被该线程使用到的变量的主内存拷贝，线程对变量的所有操作(读取、赋值等)都必须在工作内存中进行，而不能直接读写主内存中的变量。
- 不同的线程之间也无法直接访问对方工作内存中的变量，线程间变量值的传递均需要通过主内存来完成。

```
这里的线程工作内存不同于JVM内存划分，是一个抽象概念，是对CPU、寄存器、高速缓存的抽象。
```

### volatile关键字

volatile可以说是Java虚拟机提供的最轻量级的同步机制。当一个变量定义为volatile之后，它将具备两种特性：

1. 保证此变量对所有线程的可见性。新值立即同步到主内存，每次使用前立即从主内存刷新。
2. 禁止指令重排优化。

#### volatile实现原理

volatile修饰的共享变量==写操作==时，==生成的汇编代码会多出一个`lock`前缀。==`lock`前缀相当于一个**内存屏障**，**内存屏障**有3个功能：

1. 内存屏障后的指令不能被重排至内存屏障前，内存屏障前的指令不能被重排至内存屏障后。(内存屏障前的指令结果对内存屏障后的指令结果可见)。(有序性)
2. 对缓存的修改操作立即回写到主存。(可见性)
3. 缓存回写到内存会导致其他处理器的缓存无效。(可见性)

#### volatile和原子性、可见性、有序性

1. 原子性

定义：一个操作或者多个操作，要么全部执行并且执行的过程不会被任何因素打断，要么就都不执行。

在多线程环境下实现原子性，可以通过synchronized和锁来实现，**volatile不能保证原子性**。

**为什么volatile不能保证原子性？**

例如，对一个volatile变量i进行自增操作，生成的汇编如下：
```
mov    0xc(%r10),%r8d ; //Load
inc    %r8d           ; //Increment
mov    %r8d,0xc(%r10) ; //Store
lock addl $0x0,(%rsp) ; //StoreLoad Barrier
```
最后一个lock即内存屏障，但是内存屏障只能保证这次store对其他处理器可见，并不能保证在上面三步中其他CPU不会修改值。


2. 可见性

定义：当多个线程访问同一个变量时，一个线程修改了这个变量的值，其他线程能够立即看得到修改的值。

对volatile修饰变量的修改会被立即回写到主存，且其他处理器的缓存失效。volatile可以保证可见性。

3. 有序性

定义：程序执行的顺序按照代码的先后顺序执行。

在Java内存模型中，为了效率是允许编译器和处理器对指令进行重排序，当然重排序它不会影响单线程的运行结果，但是对多线程会有影响。

根据先行发生原则，利用内存屏障，volatile可以保证==一定的有序性==。

- 当对volatile变量操作时，在其前面的操作的更改肯定全部已经进行，且结果已经对后面的操作可见，在其后面的操作肯定还没有进行。
- Java 在进行指令优化时，不能将在对volatile变量访问的语句放在其后面执行，也不能把volatile变量后面的语句放到其前面执行。

**先行发生原则(happens-before)**

在JMM(Java Memory Model)中，如果一个操作执行的结果需要对另一个操作可见，那么这两个操作之间必须存在happens-before关系。happens-before原则是判断数据是否存在竞争、线程是否安全的主要依据。

原则 | 解释
---|---
程序次序规则(Program Order Rule) | 在一个线程内，书写在前面的操作先行发生于书写在后面的操作
管程锁定规则(Monitor Lock Rule) | 一个unlock操作先行发生于后面对同一个锁的lock操作。后面是时间上的先后顺序。
volatile变量规则(Volatile Variable Rule) | 对一个volatile变量的写操作先行发生于后面对这个变量的读操作，后面是时间上的先后顺序。
线程启动规则(Thread Start Rule) | Thread对象的start()方法先行发生于此线程的每一个动作。
线程终止规则(Thread Termination Rule) | 线程中的所有操作都先行发生于此线程的终止检测，我们可以通过Thread.join()方法结束、Thread.isAlive()的返回值等手段检测到线程已经终止执行。
线程中断规则(Thread Interruption Rule) | 对线程interrupt()方法的调用先行发生于被中断线程的代码检测到中断事件发生，可以通过Thread.interrupted()方法检测到中断发生。
对象终结规则(Finalizer Rule) | 一个对象的初始化完成(构造函数执行结束)先行发生于它的finalize()方法的开始。
传递性(Transitivity) | 如果操作A先行发生于操作B，操作B先行发生于操作C，那就可以得出操作A先行发生于操作C的结论。

如果某两个操作的关系不满足happens-before的任意一条，就不能保证有序和可见性，JVM可以对它们进行重排序。

#### volatile的使用

由于volatile不能保证原子性，因此虽然volatile性能优于synchronized和Lock，但是无法代替锁。通常来说，使用volatile修饰的变量需要具备以两个条件：
1. 对变量的操作不依赖于当前。
2. 该变量没有包含在具有其他变量的不变式中。

即：**对volatile变量的操作必须是原子的，不依赖于其他变量的改变，也不依赖于该变量的当前状态。**

#### 典型应用场景

##### 状态标记量

volatile能够保证对修饰变量的可见性和有序性，很适合修饰表示状态的变量。对状态的操作需要保证是原子的，如简单的get/set操作。

```java
volatile boolean flag = false;

while(!flag){
doSomething();
}

public void setFlag() {
flag = true;
}
```

##### 单例模式下的double-check

基础单例模式：

instance单例是static的，在类加载时就进行了初始化操作。
```java
public class Singleton {
private Singleton() {
//必须提供private构造函数，否则jvm会创建默认public构造函数。
}

private static Singleton instance = new Singleton();//必须为static

public static Singleton getInstance() {//static
return instance;
}
}
```
延迟初始化的单例模式：

为了防止初始化出多个instance，getInstance加锁。
```java
public class Singleton {
private Singleton() {
//must
}

private static Singleton instance = null;

public static synchronized Singleton getInstance() {
if (instance == null) {
instance = new Singleton();
}
return instance;
}
}
```
带volatile的double check的延迟初始化：
1. 只有当instance==null时才加锁初始化，提高了并发性。
2. 当A，B两个线程同时判断instance==null，A线程获取锁并初始化后，B线程再获取锁，为了防止重复初始化，添加了Double-Check。
3. new操作可以分解为三个操作：
```
memory = allocate();   //1：分配对象的内存空间
ctorInstance(memory);  //2：初始化对象
instance = memory;     //3：设置instance指向刚分配的内存地址
```
可能被JVM重排序为:
```
memory = allocate();   //1：分配对象的内存空间
instance = memory;     //3：设置instance指向刚分配的内存地址
ctorInstance(memory);  //2：初始化对象
```
重排序后当A线程运行到3，还未运行2时，B线程判断instance!=null，将**返回一个未初始化的错误instance。解决的方法是添加volatile修饰符，禁止对new操作的重排序。**
```java
public class Singleton {
private Singleton() {
//must
}

private static volatile Singleton instance = null;//volatile

public static Singleton getInstance() {
if (instance == null) {
synchronized (Singleton.class) {
if (instance == null) {//Double Check
instance = new Singleton();
}
}
}
return instance;
}
}
```
##### 优化的读-写锁

使用volatile修饰被读写的变量，写操作将立即对读线程可见，不需再对读加锁。由于写操作不是原子的，因此仍需加锁。

```java
@ThreadSafe
public class CheesyCounter {
// Employs the cheap read-write lock trick
// All mutative operations MUST be done with the 'this' lock held
@GuardedBy("this") private volatile int value;

public int getValue() { return value; }

public synchronized int increment() {
return value++;
}
}
```

##### 独立观察（independent observation）
若干线程独立于使用该变量的线程之外，独立观察并更新观察结果。其他线程可以读取该变量获取最新结果。
```java
public class UserManager {
public volatile String lastUser;

public boolean authenticate(String user, String password) {
boolean valid = passwordIsValid(user, password);
if (valid) {
User u = new User();
activeUsers.add(u);
lastUser = user;
}
return valid;
}
}
```





### REFS
- http://www.importnew.com/23520.html
- http://ifeve.com/volatile/
- https://www.cnblogs.com/Mainz/p/3556430.html
- https://www.cnblogs.com/dolphin0520/p/3920373.html

volatile应用
- https://www.ibm.com/developerworks/cn/java/j-jtp06197.html

单例模式、double check和volatile
- https://blog.csdn.net/fan2012huan/article/details/53454724
- http://www.infoq.com/cn/articles/double-checked-locking-with-delay-initialization
