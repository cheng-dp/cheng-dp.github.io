---
layout: post
title: synchronized、Monitor、锁优化及wait&notify&notifyAll实现原理
categories: [Java]
description: synchronized、Monitor、锁优化及wait&notify&notifyAll实现原理
keywords: Java, Java多线程
---
## synchronized基本使用
1. 修饰普通方法

锁在当前实例this object。
```java
public class AccountingSync implements Runnable{
//共享资源(临界资源)
static int i=0;
/**
* synchronized 修饰实例方法
*/
public synchronized void increase(){
i++;
}
@Override
public void run() {
for(int j=0;j<1000000;j++){
increase();
}
}
public static void main(String[] args) throws InterruptedException {
AccountingSync instance=new AccountingSync();
Thread t1=new Thread(instance);
Thread t2=new Thread(instance);
t1.start();
t2.start();
t1.join();
t2.join();
System.out.println(i);
}
/**
* 输出结果:
* 2000000
*/
}
```

2. 修饰静态方法

锁在当前类的Class对象。  
```java
public class AccountingSyncClass implements Runnable{
static int i=0;

/**
* 作用于静态方法,锁是当前class对象,也就是
* AccountingSyncClass类对应的class对象
*/
public static synchronized void increase(){
i++;
}

@Override
public void run() {
for(int j=0;j<1000000;j++){
increase();
}
}

public static void main(String[] args) throws InterruptedException {
//new新实例
Thread t1=new Thread(new AccountingSyncClass());
Thread t2=new Thread(new AccountingSyncClass());
//启动线程
t1.start();t2.start();

t1.join();t2.join();
System.out.println(i);
}
}
```

3. 修饰代码块

锁在传入的Object上，通常使用this。  
```java
public class AccountingSync implements Runnable{
static AccountingSync instance=new AccountingSync();
static int i=0;
@Override
public void run() {
//省略其他耗时操作....
//使用同步代码块对变量i进行同步操作,锁对象为instance
synchronized(instance){ //或者synchronized(this)
for(int j=0;j<1000000;j++){
i++;
}
}
}
public static void main(String[] args) throws InterruptedException {
Thread t1=new Thread(instance);
Thread t2=new Thread(instance);
t1.start();t2.start();
t1.join();t2.join();
System.out.println(i);
}
}
```

### synchronized反编译

1. 反编译同步代码块

```java
public class SynchronizedDemo {
public void method() {
synchronized (this) {
System.out.println("Method 1 start");
}
}
}
```

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_javaConcur/synchronized_block.png)



2. 反编译synchronized方法

```java
public class SynchronizedMethod {
public synchronized void method() {
System.out.println("Hello World!");
}
}
```

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_javaConcur/synchronized_method.png)


3. monitorenter和monitorexist

```
monitorenter  
Each object is associated with a monitor. A monitor is locked if and only if it has an owner. The thread that executes monitorenter attempts to gain ownership of the monitor associated with objectref, as follows:  
• If the entry count of the monitor associated with objectref is zero, the thread enters the monitor and sets its entry count to one. The thread is then the owner of the monitor.  
• If the thread already owns the monitor associated with objectref, it reenters the monitor, incrementing its entry count.  
• If another thread already owns the monitor associated with objectref, the thread blocks until the monitor's entry count is zero, then tries again to gain ownership.  
```

```
monitorexit
The thread that executes monitorexit must be the owner of the monitor associated with the instance referenced by objectref.
The thread decrements the entry count of the monitor associated with objectref. If as a result the value of the entry count is zero, the thread exits the monitor and is no longer its owner. Other threads that are blocking to enter the monitor are allowed to attempt to do so.

```

1. 每一个Object都关联一个monitor对象，当monitor有owner时monitor即被锁住，monitorenter命令就是尝试设置monitor的owner。
2. monitor有entry count记录被重复加锁的次数。
3. 线程对monitor加锁就是设置monitor的owner，并且设置entry count为1。
4. 已获取monitor的线程重入monitorenter，entry count增加1。
5. 线程发现monitor已被设置其他owner，阻塞直到该monitor的entry count为0，重新尝试获取monitor。
6. 执行monitorexit后，entry count减1，当entry count为0时，线程不再是monitor的owner，其他被阻塞线程将尝试获取该monitor。

4. ACC_SYNCHRONIZED

当方法调用时，调用指令将会检查方法的**ACC_SYNCHRONIZED**访问标志是否被设置，如果设置了，执行线程将先获取monitor，获取成功之后才能执行方法体，方法执行完后再释放monitor。在方法执行期间，其他任何线程都无法再获得同一个monitor对象。 其实本质上和monitorenter没有区别，只是方法的同步是一种隐式的方式来实现，无需通过字节码来完成。



## Java对象头和Monitor对象
Java对象头和Monitor是实现synchronized的基础。

### ==Java对象头==

JVM中，对象在内存中的布局分为三块区域：对象头、实例数据、对齐填充。  

JVM中主要有两个字存储对象头，主要结构为Mark Word和Class Metadata Address，如果对象是数组，则多一个字记录数组长度。


虚拟机位数 | 内容 | 说明
---|---|---
32/64bit | Mark Word | 存储对象的hashCode、锁信息或分代年龄或GC标志等
32/64bit | Class Metadata Address | 类型指针，指向对象的元数据
32/32bit | Array Length | 数组长度(如果对象是数组)


**Mark Word**

为了节省空间效率，Mark Word被设计成非固定的数据结构，根据对象本身(锁)的状态复用存储空间。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/jvm_object_mark_word.jpg)



### Monitor监视器对象

Monitor可以理解为一个同步工具，通常被实现为一个对象。每一个被锁住的对象都会与一个Monitor关联(重量级锁的锁指针指向的就是monitor对象的起始地址)。  

在HotSpot虚拟机中，monitor采用ObjectMonitor实现。每个线程都有两个ObjectMonitor对象列表，分别为free和used列表，如果当前free列表为空，线程将向全局global list请求分配ObjectMonitor。  
其中，**_owner指向获得ObjectMonitor对象的线程**，表示该锁被这个线程占用。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/monitor_CPP.png)

ObjectMonitor对象中有两个队列：_WaitSet 和 _EntryList，用来保存ObjectWaiter对象列表。所有处于wait状态的线程及等待锁的线程都会被包装为一个ObjectWaiter。

**_WaitSet** ：处于WAITING状态(object.wait())的线程，会被加入到wait set；  
**_EntryList**：处于BLOCKED状态(锁阻塞)的线程，会被加入到entry set；

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/jvm_monitor_work.png)

**理解Monitor**

尝试获取锁失败的线程在EntryList中阻塞等待，线程状态为BLOCKED。

获取锁后进入“特殊房间”运行临界代码，线程状态为RUNNING。

运行中如果需要等待其他线程(调用object.wait, thread.join等)，将==释放锁==并被加入waitSet，状态改为WAITING。

线程从waitSet被唤醒后将重新竞争锁，如果失败则重新加入EntryList中，状态为BLOCKED。

**Waiting状态和Blocked状态的区别**

Blocked状态指线程正在等待获取monitor锁。

Waiting状态指线程正在等待其他线程，如调用Object.wait()的线程需要等待其他线程notify，或者调用Thread.join()的线程等待目标线程的终止。

从waiting状态离开的线程，可能继续执行(RUNNABLE)，也可能再次尝试获取锁(BLOCKED)。

```
/*
* Thread state for a thread blocked waiting for a monitor lock.
* A thread in the blocked state is waiting for a monitor lock
* to enter a synchronized block/method or
* reenter a synchronized block/method after calling
* {@link Object#wait() Object.wait}.
*/
BLOCKED,

/**
* Thread state for a waiting thread.
* A thread is in the waiting state due to calling one of the
* following methods:
* <ul>
*   <li>{@link Object#wait() Object.wait} with no timeout</li>
*   <li>{@link #join() Thread.join} with no timeout</li>
*   <li>{@link LockSupport#park() LockSupport.park}</li>
* </ul>
*
* <p>A thread in the waiting state is waiting for another thread to
* perform a particular action.
*
* For example, a thread that has called <tt>Object.wait()</tt>
* on an object is waiting for another thread to call
* <tt>Object.notify()</tt> or <tt>Object.notifyAll()</tt> on
* that object. A thread that has called <tt>Thread.join()</tt>
* is waiting for a specified thread to terminate.
*/
WAITING,
```

### wait/notify/notifyAll

wait/notify/notifyAll实现了线程间的等待通知机制，==实现了线程间的简单通信==。

wait/notify/notifyAll都需要首先获取Object上的Monitor锁(synchronized)，wait会释放锁，notify/notifyAll不会释放锁。

```java
import java.util.concurrent.TimeUnit;

public class WaitNotify {

final static Object lock = new Object();

public static void main(String[] args) {

new Thread(new Runnable() {
@Override
public void run() {
System.out.println("线程 A 等待拿锁");
synchronized (lock) {
try {
System.out.println("线程 A 拿到锁了");
TimeUnit.SECONDS.sleep(1);
System.out.println("线程 A 开始等待并放弃锁");
lock.wait(); //调用object的wait。
System.out.println("被通知可以继续执行 则 继续运行至结束");
} catch (InterruptedException e) {
}
}
}
}, "线程 A").start();

new Thread(new Runnable() {
@Override
public void run() {
System.out.println("线程 B 等待锁");
synchronized (lock) {
System.out.println("线程 B 拿到锁了");
try {
TimeUnit.SECONDS.sleep(5);
} catch (InterruptedException e) {
}
lock.notify();//调用object的notify。
System.out.println("线程 B 随机通知 Lock 对象的某个线程");
}
}
}, "线程 B").start();
}


}
```

### 执行原理

wait/notify/notifyAll基于Monitor机制实现线程的等待通知机制，从Monitor的介绍中可知， **_WaitSet**链表链接所有处于waiting状态的线程， **_EntryList**链表链接所有处于blocked状态的线程。当锁被释放时，处于_EntryList链表中的线程将竞争锁。

由于wait是对竞争同一个Monitor的线程进行操作，==因此必须先拿到Monitor锁==，才能进行wait/notify/notifyAll操作。如果进行wait/notify/notifyAll操作时没有取得对应Object的monitor，会抛出**IllegalMonitorStateException**。

1. wait()
- 将当前线程封装成ObjectWaiter对象。
- 通过ObjectMonitor::AddWaiter方法将node添加到_WaitSet列表中。
- 通过ObjectMonitor::exit方法**释放当前的ObjectMonitor对象(释放锁)**。
- 挂起线程(线程状态WAITING)。

2. notify()
- 如果当前 **_WaitSet** 为空，即没有正在等待的线程，则直接返回。
- 通过ObjectMonitor::DequeueWaiter方法，获取_WaitSet列表中的第一个ObjectWaiter节点。(JDK定义中唤醒随机一个，实现中是第一个)。
- 根据不同的策略，将取出来的ObjectWaiter节点，加入到 **_EntryList** 或则通过Atomic::cmpxchg_ptr指令进行自旋操作cxq。

**注意！notify不会释放锁，在退出synchronized块时才会释放锁。**

3. notifyAll()  
- 通过for循环取出 **_WaitSet**的ObjectWaiter节点，并根据不同策略，加入到 **_EntryList**或则进行自旋操作。


## 锁优化(偏向锁、轻量级锁、重量级锁)

==Monitor的底层依赖于系统提供的互斥锁实现(mutex)==，操作系统实现线程之间的切换需从用户态切换到核心态，成本较高，因此，原始的synchronized实现效率较低。

在Java 1.6 后，引入了“偏向锁”和“轻量级锁”==对synchronized进行了优化==：一共有四种状态，级别从低到高依次为：无锁状态、偏向锁状态、轻量级锁状态和重量级锁状态。

偏向锁和轻量级锁都是基于自旋和CAS操作实现的锁，线程通过CAS操作尝试获取锁，基于自旋等待锁释放，相比于重量级锁，==避免系统调用引起的内核态与用户态切换、以及线程阻塞造成的线程切换等。

synchronized的实现将首先使用偏向锁，并随着竞争加剧按照偏向锁 -> 轻量级锁 -> 重量级锁的方向升级锁。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/jvm_object_mark_word.jpg)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/java_synchronized_monitor_update_path.png)

### 注意点

1. 偏向锁检测获取锁的线程是否存活以及是否在同步代码块中运行，需要等待程序运行到全局安全点后Stop The World，检测完毕后才恢复所有线程的运行。

2. 从对象头Mark Word中可知，只有在无锁状态会记录Hash Code，而偏向锁及轻量级锁无法记录Hash Code，重量级锁的Hash Code将被记录在对应的Monitor中。在JVM的实现中，一旦调用过锁对象的Object#hash或System.identityHashCode()方法，就无法进行偏向锁和轻量级锁的优化，已经加的锁也会直接升级为重量级锁。

### 轻量级锁

轻量级锁的目标是，基于自旋和CAS操作，减少==无实际竞争==情况下，使用重量级锁产生的性能消耗，包括系统调用引起的内核态与用户态切换、线程阻塞造成的线程切换等。

使用轻量级锁时，不需要申请互斥量，仅仅将Mark Word中的部分字节CAS更新指向线程栈中的Lock Record，如果更新成功，则轻量级锁获取成功，记录锁状态为轻量级锁；否则，说明已经有线程获得了轻量级锁，目前发生了锁竞争（不适合继续使用轻量级锁），接下来膨胀为重量级锁。

**加锁过程：**

1. 判断当前对象是否处于无锁状态（`锁标志位`为“01”状态，`是否为可偏向`为“0”）。

2. 在**当前线程的栈帧**中建立一个名为**锁记录(Lock Record)**的空间，用于存储锁对象目前的Mark Word的拷贝，官方称之为 `Displaced Mark Word`。

3. 拷贝对象头中的Mark Word复制到当前线程的**锁记录(Lock Record)**的**Displaced Mark Word**中，==此时拷贝的Mark Word是无锁状态的==。

4. 使用**CAS操作**尝试将对象的Mark Word更新为指向Lock Record的指针，并将Lock record里的owner指针指向object mark word。

4. 如果**CAS操作**成功，则加锁成功，并且对象Mark Word的锁标志位设置为“00”，即表示此对象处于轻量级锁定状态。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JVM/jvm_monitor_light_2.jpg)

5. 如果**CAS操作**失败，线程首先检查对象的Mark Word是否指向当前线程的栈帧，如果是就说明当前线程已经拥有了这个对象的锁，那就可以直接进入同步块继续执行。

6. 如果**CAS操作**失败且对象的Mark Word不指向当前线程，则说明发生了竞争，线程自旋一段时间等待，如果任然不能获取锁，则将锁膨胀为重量级锁。
```
膨胀的过程是，当前线程修改对象的`锁标志位`为“10”，获取一个Monitor并将对象的Mark Word指向该Monitor，之后当前线程阻塞等待唤醒。
```
6. 重量级锁使除了拥有锁的线程以外的线程都阻塞，锁标志的状态值变为“10”，Mark Word中存储的就是指向重量级锁（互斥量）的指针，后面等待锁的线程也要进入阻塞状态。

**释放锁过程：**

1. 通过CAS操作尝试把线程中复制的Displaced Mark Word对象替换当前的Mark Word。

```
在加锁时从对象头拷贝到Displaced Mark Word的是无锁模式的，解锁时正好直接CAS替换回去。
```

2. 如果替换成功，整个同步过程就完成了。

3. 如果替换失败（此时锁已膨胀），说明有其他线程尝试过获取该锁，那就要在释放锁的同时，唤醒被挂起的线程。

### 偏向锁

偏向锁是对轻量级锁的优化，轻量级锁假设不存在多线程竞争，而偏向锁假设不仅==不存在多线程竞争==，而且总是由==同一线程多次重复获得==。

偏向锁的目标是，减少无竞争且只有一个线程使用锁的情况下，使用轻量级锁产生的性能消耗。轻量级锁每次申请、释放锁都至少需要一次CAS，但偏向锁只有**初始化**时需要一次CAS。

“偏向”的意思是，偏向锁假定将来只有==第一个==申请锁的线程会使用锁（不会有任何线程再来申请锁），因此，只需要**在Mark Word中CAS记录线程ID（本质上也是CAS更新，但==初始值为空==）**，如果记录成功，则偏向锁获取成功，记录锁状态为偏向锁。之后再次获取锁只需要查看Mark Word中记录的线程ID是否是当前线程，无需CAS操作，如果不是当前线程，则证明已有竞争，膨胀为轻量级锁。


==偏向锁检测获取锁的线程是否存活以及是否在同步代码块中运行，需要等待程序运行到全局安全点后Stop The World，检测完毕后才恢复所有线程的运行。==

**加锁过程：**

如果JVM支持偏向锁，在分配对象时，对象头Mark Word的最后三位为101，及`锁标志位`为01状态(无锁或偏向锁)，`是否可偏向`为1，即为**可偏向**状态。

1. 判断当前对象是否处于**可偏向状态(101)**。

2. 如果是可偏向状态，则使用CAS操作 (位置：MarkWord.threadId, 原值：0， 现值：当前threadId) 设置Mark Word记录的Thread ID为自己，并在当前线程栈中由高到低顺序找到可用的Lock Record，将其obj字段指向锁对象。

3. 当前线程重入锁时，只需要检查Mark Word记录的是否是自己的Thread ID, 如果是，则会往当前线程的栈中添加一条Displaced Mark Word为空的Lock Record中，用来统计重入的次数，然后继续执行同步块代码。

4. 如果CAS操作失败，证明Mark Word记录的ThreadId不是0，或者发生了多线程竞争，此时偏向锁假设不成立，需要进入**锁撤销**及**升级为轻量级锁**的流程。

5. 如果重入锁时，Mark Word记录的不是自己的Thread ID, 同样进入**锁撤销**及**升级为轻量级锁**的流程。

**锁撤销**

当线程检测到偏向锁记录的ThreadId不是自身，或者CAS操作失败，证明偏向锁假设不成立。

如果此时获得锁的线程死亡或者不在，就会进入**锁撤销**流程，设置锁为无锁状态(`锁标志位`为01，`是否可偏向`为0)。

1. 如果CAS操作失败，证明MarkWord记录的ThreadId不是0，或者由于多线程竞争失败，偏向锁假设不成立，进入锁撤销。

2. 从Mark Word中得到取得锁的线程ID，判断该线程是否存活，如果不存活，则将Mark Word中的ThreadId设置为0，`是否为偏向锁`设置为0。

3. 如果线程存活，遍历该线程的Lock Record(统计), 判断线程是否还在该同步代码块中，如果不在，同样撤销锁为无锁状态。

锁撤销后，当前线程继续尝试获取锁，会进入**轻量级锁**的加锁模式。

**升级为轻量级锁**

当线程检测到偏向锁记录的ThreadId不是自身，或者CAS操作失败，证明偏向锁假设不成立。

如果此时获得锁的线程仍然在同步代码块中，会将锁升级为轻量级锁。

1. 生成一个==无锁状态==的Mark Word字段，拷贝入取得锁的线程Lock Record的Displaced Mark Word中。

2. 取得锁的线程Lock Record的owner字段指向该锁对象头。

3. 锁对象的Mark Word修改为轻量级锁模式，并指向取得锁的线程。

当前对象将进入轻量级锁模式，自旋等待获得锁的线程释放锁。


## 相关问题

1. synchronized优缺点
```
优点：  

a. 代码方便，由JVM控制释放，无需主动释放。

b. 是java的关键字，不许引入新的类，一直在优化。

缺点(通过与Lock对比)：  

a. 不可中断正在等待获取锁的线程。

b. 非公平锁，可能产生线程饥饿。

c. 只支持一个条件队列。

d. 不区分读写锁，读操作也相互互斥。
```

2. synchronized和Lock的区别

a. synchronized是关键字，Lock是接口，有不同的实现。
```java
public interface Lock{
void lock();
void lockInterruptibly();
Condition newCondition();
boolean tryLock();
boolean tryLock(long time, TimeUnit timeUnit);
void unlock();
}
```
b. Lock需要显示调用unlock方法解锁，通常放在try...catch...finally的finally中。

c. synchronized不可中断，Lock提供了lockInterruptibly()方法可中断地获取锁。

d. Lock提供公平锁机制，synchronized为非公平锁。
```
公平锁：加锁前检查是否有排队等待的线程，先来先得 FIFO，即先排队，再尝试获取锁。
非公平锁：加锁时不考虑排队等待问题，直接尝试获取锁，获取不到自动到队尾等待，即先尝试获取锁，再排队。
```

e. Lock提供非阻塞获取锁操作，以及超时机制。

f.Lock支持多个条件对象Condition，能够实现多个条件等待队列，而synchronized只有一个，也就是其锁对象的等待队列。

g. Lock提供了读写锁实现ReentrantReadWriteLock。

h. Lock性能明显高于synchronized，但是synchronized还在不断优化，且还有优化的空间，在没有以上需求时，官方更加提倡使用synchronized。

### REFS

synchronized:

- https://zhuanlan.zhihu.com/p/29866981
- https://www.cnblogs.com/paddix/p/5367116.html
- https://blog.csdn.net/javazejian/article/details/72828483
- https://juejin.im/post/5a43ad786fb9a0450909cb5f#comment

monitor:
- https://juejin.im/post/5bfe6eafe51d4524f35d04d1
- https://segmentfault.com/a/1190000018852153
- https://blog.csdn.net/chenssy/article/details/54883355
- https://www.jianshu.com/p/f4454164c017
- https://www.ibm.com/developerworks/cn/java/j-lo-synchronized/
- https://blog.csdn.net/jingzi123456789/article/details/69951057

notifyAll/notify/wait:
- https://blog.csdn.net/boling_cavalry/article/details/77793224
- https://www.jianshu.com/p/f4454164c017
- https://www.journaldev.com/1037/java-thread-wait-notify-and-notifyall-example
- https://www.cnblogs.com/stateis0/p/9061611.html
