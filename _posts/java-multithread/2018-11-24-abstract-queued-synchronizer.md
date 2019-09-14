---
layout: post
title: AbstractQueuedSynchronizer及Condition队列实现分析
categories: [Java, Java多线程]
description: AbstractQueuedSynchronizer及Condition队列实现分析
keywords: Java, Java多线程
---


## AbstractQueuedSynchronizer

### 概念

AbstractQueuedSynchronizer(AQS)是一个用于构建锁和同步器的框架，主要包含：
1. 一个int成员变量state表示==同步状态==，状态的具体含义由子类定义。
2. 一个内置==双向链表管理阻塞线程==(阻塞和唤醒), 保存头尾节点head和tail.
3. 一个==Condition条件队列==的实现类(AQS本身并没有用，Lock.newCondition()返回的就是该Condition实现ConditionObject)。

AQS提供Exclusive和Shared两套API，同时支持独占锁和共享锁(同时多个线程能够获取锁)。

ReentrantLock, Semaphore, CountDownLatch, ReentrantReadWriteLock, FutureTask都是基于AQS构建。

JUC中所有的同步器类都没有直接扩展AQS，而是都将它们的相应功能委托给私有的AQS子类(Sync)实现。**Why?**

```
// 需要子类去实现的方法
protected boolean tryAcquire(int arg)
protected boolean tryRelease(int arg) 
protected int tryAcquireShared(int arg) 
protected boolean tryReleaseShared(int arg)
protected boolean isHeldExclusively()

// 对外提供的public方法
public final void acquire(int arg)
public final void acquireInterruptibly(int arg)
public final boolean tryAcquireNanos(int arg, long nanosTimeout)
public final boolean release(int arg)
public final void acquireShared(int arg)
public final void acquireSharedInterruptibly(int arg)
public final boolean tryAcquireSharedNanos(int arg, long nanosTimeout)
public final boolean releaseShared(int arg)     
```


### 源码分析

**AQS的具体实现参考：**
- https://blog.csdn.net/u014634338/article/details/77168608
- https://blog.csdn.net/u014634338/article/details/77428108

```java
class AbstractQueuedSynchronizer extends AbstractOwnableSynchronizer {
    //基于CLH队列变形实现的线程阻塞队列
    static final class Node {

        //线程已被取消。
        static final int CANCELLED =  1;
        //successor线程需要被唤醒。
        static final int SIGNAL    = -1;
        //线程正处在CONDITION队列中，condition队列是和阻塞队列不同的队列，只是使用了相同的node方便管理。
        static final int CONDITION = -2;
        /**
         * waitStatus value to indicate the next acquireShared should
         * unconditionally propagate
         */
        static final int PROPAGATE = -3;
        //CANCELLED/SIGNAL/CONDITION/PROPAGATE/0.
        volatile int waitStatus;
        
        // sync queue 中的前序节点、后续节点及Node上的thread。
        volatile Node prev;
        volatile Node next;
        volatile Thread thread;
        
        
        //仅仅起到标记作用。在sync queue中给nextWaiter赋值。
        static final Node SHARED = new Node();
        static final Node EXCLUSIVE = null;
        
        // 在sync queue中，标记该node是SHARED还是EXCLUSIVE。
        // 在condition条件队列中，指向下一个节点。
        Node nextWaiter;

        final boolean isShared() {
            return nextWaiter == SHARED;
        }
        
        final Node predecessor() throws NullPointerException {
            Node p = prev;
            if (p == null)
                throw new NullPointerException();
            else
                return p;
        }
        
        // Used to establish initial head or SHARED marker
        Node() {    
        }
        // Used by addWaiter
        Node(Thread thread, Node mode) {
            this.nextWaiter = mode;
            this.thread = thread;
        }
        // Used by Condition
        Node(Thread thread, int waitStatus) {
            this.waitStatus = waitStatus;
            this.thread = thread;
        }
    }
    private transient volatile Node head;
    private transient volatile Node tail;
    
    
    //AQS提供了一下三个函数操作state
    private volatile int state;
    protected final int getState() {
        return state;
    }
    protected final void setState(int newState) {
        state = newState;
    }
    protected final boolean compareAndSetState(int expect, int update) {
        return unsafe.compareAndSwapInt(this, stateOffset, expect, update);
    }
    
    
    private Node enq(final Node node)
    private void setHead(Node node)
    private void unparkSuccessor(Node node)
    private void doReleaseShared()
    final boolean acquireQueued(final Node node, int arg) 
    private void doAcquireInterruptibly(int arg)
    private boolean doAcquireNanos(int arg, long nanosTimeout)
    private void doAcquireShared(int arg) 
    private void doAcquireSharedInterruptibly(int arg)
    private boolean doAcquireSharedNanos(int arg, long nanosTimeout)
    
    // 需要子类去实现的方法
    protected boolean tryAcquire(int arg)
    protected boolean tryRelease(int arg) 
    protected int tryAcquireShared(int arg) 
    protected boolean tryReleaseShared(int arg)
    protected boolean isHeldExclusively()
    
    // 对外提供的public方法
    public final void acquire(int arg)
    public final void acquireInterruptibly(int arg)
    public final boolean tryAcquireNanos(int arg, long nanosTimeout)
    public final boolean release(int arg)
    public final void acquireShared(int arg)
    public final void acquireSharedInterruptibly(int arg)
    public final boolean tryAcquireSharedNanos(int arg, long nanosTimeout)
    public final boolean releaseShared(int arg) 
    ...
}
```
**完整的Source Code**

https://github.com/unofficial-openjdk/openjdk/blob/jdk/jdk/src/java.base/share/classes/java/util/concurrent/locks/AbstractQueuedSynchronizer.java

### 独占锁支持

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/AbstractQueuedSynchronizer_acquire_exclusive.png)

#### acquire

tryAcquire由子类实现，返回值为布尔值，成功返回true，失败返回false。

tryAcquire失败后调用addWaiter()将node加入队尾。  

```java
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();//acquireQueued返回的是从park中醒来后的中断状态，如果是true，则同样调用interrupt传递中断状态。
}
```

addWaiter首先尝试直接将node加入队尾，失败则调用enq。

如果队列为空，创建一个新的空节点作为head。

enq中for循环确保Node被加入队尾后才会返回。

```java
private Node addWaiter(Node mode) {
    Node node = new Node(Thread.currentThread(), mode);
    // Try the fast path of enq; backup to full enq on failure
    Node pred = tail;
    if (pred != null) {
        node.prev = pred;
        if (compareAndSetTail(pred, node)) {
            pred.next = node;
            return node;
        }
    }
    enq(node);
    return node;
}
private Node enq(final Node node) {
    for (;;) {
        Node t = tail;
        if (t == null) { // Must initialize
            if (compareAndSetHead(new Node())) // 如果队列为空，创建一个空Node作为头结点。
                tail = head;
        } else {
            node.prev = t;
            if (compareAndSetTail(t, node)) {
                t.next = node;
                return t;
            }
        }
    }
}
```

addWaiter将Node加入队列后，调用acquireQueued。进入==循环等待==。

```java
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // 移除前head
                failed = false;
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

在循环中判断：

- 如果前序节点是head，则再次尝试tryAcquire获取锁，如果成功，则将自身设为头结点、移除前头结点、返回中断状态==继续线程任务==。

- 如果前序节点不是head，或者tryAcquire获取锁失败，则shouldParkAfterFailedAcquire(p, node)判断前序节点状态：
    - SIGNAL，该节点可以park，返回true。
    - CANCELLED，在while循环中移除前序节点，直至前序节点不是取消状态。
    - 其他，将前序节点设置为SIGNAL状态，保证前序节点会将本节点唤醒。

- shouldParkAFterFailedAcquire返回true，则将本节点线程park，等待被唤醒或者中断。

```
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    int ws = pred.waitStatus;
    if (ws == Node.SIGNAL)
        return true;
    if (ws > 0) {
        do {
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    
    return false;
}
```

```java
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);//在此阻塞，等待unpark。
    return Thread.interrupted();//当从park中醒来时，返回中断状态。
}
```

#### release

1. 调用子类复写的tryRelease，如果返回true，尝试unparkSuccessor唤醒后继节点对应的thread。

2. 此时该线程对应的节点为头结点，因此unparkSuccessor传入的也为头结点。


```java
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```

2. unparkSuccessor唤醒一个后继结点：
    - 尝试先清除节点状态，(SIGNAL -> 0)，表示SIGNAL已经触发。
    - 唤醒后继节点，如果后继节点为CANCELLED状态，则从后往前找第一个不是CANCELLED状态的节点唤醒。
```java
private void unparkSuccessor(Node node) {
    /*
     * If status is negative (i.e., possibly needing signal) try
     * to clear in anticipation of signalling.  It is OK if this
     * fails or if status is changed by waiting thread.
     */
    int ws = node.waitStatus;
    if (ws < 0)
        compareAndSetWaitStatus(node, ws, 0);

    /*
     * Thread to unpark is held in successor, which is normally
     * just the next node.  But if cancelled or apparently null,
     * traverse backwards from tail to find the actual
     * non-cancelled successor.
     */
    Node s = node.next;
    if (s == null || s.waitStatus > 0) {
        s = null;
        for (Node t = tail; t != null && t != node; t = t.prev)
            if (t.waitStatus <= 0)
                s = t;
    }
    if (s != null)
        LockSupport.unpark(s.thread);
}
```

### 共享锁支持

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/AbstractQueuedSychronizer_acquire_shared.png)

#### acquireShared

1. 调用子类覆写的tryAcquireShared，如果==返回值大于0==，则成功，否则失败调用doAcquireShared。

```java
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}
```

2. doAcquireShared和acquireQueued类似。将线程包装成SHARED node加入队列等待。

3. 在==循环中等待==：
    - 如果前序节点是头结点，则尝试tryAcquireShared获取锁，成功则调用setHeadAndPropagate设置自身为头结点==并release后继节点==。
    - 如果前序线程不是头结点，则==调用shouldParkAfterFailedAcquire判断是否park本线程(此处于独占模式调用同一个方法)。==

```java
private void doAcquireShared(int arg) {
    final Node node = addWaiter(Node.SHARED);
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head) {
                int r = tryAcquireShared(arg);
                if (r >= 0) {
                    setHeadAndPropagate(node, r);
                    p.next = null; // help GC
                    if (interrupted)
                        selfInterrupt();
                    failed = false;
                    return;
                }
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

3. setHeadAndPropagate(Node node, int propagate)，传入的propagate是tryAcquireShared的返回结果，也就是资源的剩余数目。  

==获取锁后，当剩余数目大于0时，调用doReleaseShared()。==

```java
private void setHeadAndPropagate(Node node, int propagate) {
    Node h = head; // Record old head for check below
    setHead(node);
    if (propagate > 0 || h == null || h.waitStatus < 0 ||
        (h = head) == null || h.waitStatus < 0) {
        Node s = node.next;
        if (s == null || s.isShared())
            doReleaseShared();
    }
}
```
#### releaseShared

releaseShared调用子类复写的tryReleaseShared函数，==返回布尔值==，如果为true，则调用doReleaseShared函数唤醒后继线程。

==释放锁成功时，调用doReleaseShared();==

```java
public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {
        doReleaseShared();
        return true;
    }
    return false;
}
```

#### doReleaseShared

doReleaseShared共享锁模式中分别有两次调用：

1. 在acquireShared，线程成功获取到共享锁后，如果共享变量值大于0，调用doReleaseShared唤醒后继线程。

2. 在releaseShared，调用doReleaseShared唤醒后继线程。

同一时间可能有多个线程持有共享锁，因此，和独占锁的unparkSucessor不同，doReleaseShared同一时间可能被多个线程调用。

```java
private void doReleaseShared() {

    for (;;) {
        Node h = head;
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            if (ws == Node.SIGNAL) {
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0)) // 保证多线程释放时，同一个head的后继线程unparkSuccessor只被执行一次。
                    continue;            
                unparkSuccessor(h); // 唤醒head的下一个节点线程。
            }
            else if (ws == 0 &&
                     !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                continue;                
        }
        if (h == head) // 只有当头结点==未改变==时，退出循环 (如果头结点改变，继续释放下一个node)
            break;
    }
    
}
```

==如何理解 [头结点改变，继续释放下一个node]==

refs: https://segmentfault.com/a/1190000016447307#articleHeader3

此处为一个**优化**，为了形成对doReleaseShared的**调用风暴**，头节点改变时，意味着有新的线程获取到共享锁，该线程在setHeadAndPropagate中也会调用doReleaseShared，如此重复，如果新的线程获取共享锁的速度足够块，将会有多个线程帮助释放node唤醒线程。

如果每个线程仅仅只是释放一个后继节点，从功能上讲，最终也可以实现唤醒所有等待共享锁的节点的目的，只是效率上没有之前的“调用风暴”快。


**如何理解 else if(ws == 0 && !compareAndSetWaitStatus(h, 0, Node.PROPAGATE)) continue**

对特殊情况的优化, 可不加 refs: https://segmentfault.com/a/1190000016447307#articleHeader3

### AbstractOwnableSynchronizer

AQS继承了AbstractOwnableSynchronizer，AbstractOwnableSynchronizer提供了方法记录和获取拥有独占锁的线程。

```java
public abstract class AbstractOwnableSynchronizer
    implements java.io.Serializable {

    private static final long serialVersionUID = 3737899427754241961L;

    protected AbstractOwnableSynchronizer() { }

    private transient Thread exclusiveOwnerThread;

    protected final void setExclusiveOwnerThread(Thread thread) {
        exclusiveOwnerThread = thread;
    }

    protected final Thread getExclusiveOwnerThread() {
        return exclusiveOwnerThread;
    }
}
```

在大多数独占锁的实现中(如，ReentrantLock)，tryRelease会首先判断线程拥有锁，即调用getExclusiveOwnerThread()，如果该线程不拥有锁，将抛出异常。

## Condition条件队列

Condition条件队列是JUC提供的对原生Object wait/notify/notifyAll的一个模拟和扩展。

Condition可以和任意基于AQS实现的Lock组合使用，并且可以对同个Lock维护多个不同的Condition队列。

```java
public interface Condition {
    void await() throws InterruptedException;
    void awaitUninterruptibly();
    long awaitNanos(long nanosTimeout) throws InterruptedException;
    boolean await(long time, TimeUnit unit) throws InterruptedException;
    boolean awaitUntil(Date deadline) throws InterruptedException;
    void signal();
    void signalAll();
}
```

**ConditionObject**是Condition的一个实现类，是AbstractQueuedSynchronizer的内部类：

https://github.com/unofficial-openjdk/openjdk/blob/bf19adcc8c0cee2d723a39e5bad251e78ab14ca4/src/java.base/share/classes/java/util/concurrent/locks/AbstractQueuedSynchronizer.java#L1868

### ConditionObject实现分析

ConditionObject为单向链表(Node.nextWaiter)，Sync queue为双向链表(Node.prev, Node.next)。

ConditionObject复用了AQS sync queue中的Node，Node中含有状态Node.CONDITION，以及指向ConditionObject队列下一个元素的nextWatier。一个Node只会存在于Sync queue和ConditionObject list中的一个。

#### await方法

==已经获取锁==的线程调用await加入条件队列等待被signal/signalAll唤醒。

1. 为线程创建新的Node加入Condition队列，状态为Node.CONDITION。

2. 释放线程所持有的锁，最终调用对应子类实现的tryRelease()方法 (此时如果线程没有获取锁，通常会抛出IllegalMonitorStateException)。

3. 调用LockSupport.park挂起线程直到线程被condition.signal()/condition.signalAll()唤醒。

4. signal/signalAll将线程从条件队列移除，加入同步等待队列(sync queue)。

#### signal/signalAll方法

调用condition.signal()和condition.signalAll()都需要首先获得对应的锁，signal和signalAll会调用isHeldExclusively()方法判断，如果没有获得锁，抛出IllegalMonitorStateException。

signal(): 将firstWaiter指向的有效Node加入sync queue(同步等待队列)，唤醒对应线程，尝试重新获取锁。

signalAll(): 从firstWaiter开始遍历单链表，将所有Node加入sync queue(同步等待队列)，唤醒对应线程，尝试重新获取锁。


```
public class ConditionObject implements Condition, java.io.Serializable {
    
    private transient Node firstWaiter; // 单向链表的表头

    private transient Node lastWaiter; // 单向链表的表尾

    public ConditionObject() { }

    public final void await() throws InterruptedException {
        if (Thread.interrupted())
            throw new InterruptedException();
        Node node = addConditionWaiter();
        int savedState = fullyRelease(node);
        int interruptMode = 0;
        while (!isOnSyncQueue(node)) { // 直到被signal/signalAll加入sync queue，否则一直被park。
            LockSupport.park(this);
            if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
                break;
        }
        if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
            interruptMode = REINTERRUPT;
        if (node.nextWaiter != null) // clean up if cancelled
            unlinkCancelledWaiters();
        if (interruptMode != 0)
            reportInterruptAfterWait(interruptMode);
    }

    public final void signal() {
        if (!isHeldExclusively())
            throw new IllegalMonitorStateException();
        Node first = firstWaiter;
        if (first != null)
            doSignal(first);
    }

    private void doSignal(Node first) {
        do {
            if ( (firstWaiter = first.nextWaiter) == null)
                lastWaiter = null;
            first.nextWaiter = null;
        } while (!transferForSignal(first) &&
                 (first = firstWaiter) != null);
    }

    public final void signalAll() {
        if (!isHeldExclusively())
            throw new IllegalMonitorStateException();
        Node first = firstWaiter;
        if (first != null)
            doSignalAll(first);
    }
    
    private void doSignalAll(Node first) {
        lastWaiter = firstWaiter = null;
        do {
            Node next = first.nextWaiter;
            first.nextWaiter = null;
            transferForSignal(first);
            first = next;
        } while (first != null);
    }

    final boolean transferForSignal(Node node) {
        if (!compareAndSetWaitStatus(node, Node.CONDITION, 0))
            return false;

        Node p = enq(node);
        int ws = p.waitStatus;
        if (ws > 0 || !compareAndSetWaitStatus(p, ws, Node.SIGNAL))
            LockSupport.unpark(node.thread);
        return true;
    }

    private Node addConditionWaiter() {
        Node t = lastWaiter;
        // If lastWaiter is cancelled, clean out.
        if (t != null && t.waitStatus != Node.CONDITION) {
            unlinkCancelledWaiters();
            t = lastWaiter;
        }
        Node node = new Node(Thread.currentThread(), Node.CONDITION);
        if (t == null)
            firstWaiter = node;
        else
            t.nextWaiter = node;
        lastWaiter = node;
        return node;
    }

    private void unlinkCancelledWaiters() {
        Node t = firstWaiter;
        Node trail = null;
        while (t != null) {
            Node next = t.nextWaiter;
            if (t.waitStatus != Node.CONDITION) {
                t.nextWaiter = null;
                if (trail == null)
                    firstWaiter = next;
                else
                    trail.nextWaiter = next;
                if (next == null)
                    lastWaiter = trail;
            }
            else
                trail = t;
            t = next;
        }
    }
    
    //......
}
```
### Condition应用举例

一个Condition和Lock配合实现生产者-消费者模型的例子：

```java
public class FoodQueue<T> {

    //队列大小
    private  int size;

    //list 充当队列
    private List<T> food;

    //锁
    private Lock lock=new ReentrantLock();

    //保证队列大小不<0 的condition
    private Condition notEmpty=lock.newCondition();

    //保证队列大小不>size的condition
    private Condition notFull=lock.newCondition();

    public  FoodQueue(int size){
        this.size=size;
        food=new ArrayList<T>();
    }
    
    public void product(T t) throws Exception {
        lock.lock();
        try{

            //如果队列满了，就不能生产了，等待消费者消费数据
            while (size==food.size()){
                notFull.await();
            }

            //队列已经有空位置了，放入数据
            food.add(t);

            //队列已经有数据了，也就是不为空了，可以通知消费者消费了
            notEmpty.signal();
        }finally {
            lock.unlock();
        }

    }

    public T consume() throws  Exception{
        lock.lock();
        try{

            //队列为空，需要等待生产者生产数据
            while (food.size()==0){
                notEmpty.await();
            }
            //生产者生产了数据，可以拿掉一个数据
            T t=food.remove(0);

            //通知消费者可以继续生产了
            notFull.signal();
            return t;
        }finally {
            lock.unlock();
        }

    }
}
```

```
线程1调用reentrantLock.lock获取锁成功。
线程1调用await方法被调用时，对应操作是锁的释放。
接着马上被加入到Condition的等待队列中，意味着该线程需要signal信号。
线程2，因为线程1释放锁的关系，被唤醒，并判断可以获取锁，于是线程2获取锁，并被加入到AQS的同步等待队列中。
线程2调用signal方法，这个时候Condition的等待队列中只有线程1一个节点，于是它被取出来，并被加入到AQS的同步等待队列中。 注意，这个时候，线程1 并没有被唤醒。
signal方法执行完毕，线程2调用reentrantLock.unLock()方法，释放锁。这个时候因为AQS中只有线程1，于是，AQS释放锁后按从头到尾的顺序唤醒线程时，线程1被唤醒，于是线程1恢复执行。
直到释放锁整个过程执行完毕。
```

### REFS

**AbstractQueuedSynchronizer**

- https://segmentfault.com/a/1190000016447307#articleHeader3
- https://novoland.github.io/%E5%B9%B6%E5%8F%91/2014/07/26/AQS%20%E5%92%8C%20%E9%AB%98%E7%BA%A7%E5%90%8C%E6%AD%A5%E5%99%A8.html
- https://blog.csdn.net/u014634338/article/details/77168608
- https://blog.csdn.net/u014634338/article/details/77428108
- http://www.infoq.com/cn/articles/jdk1.8-abstractqueuedsynchronizer
- http://ifeve.com/introduce-abstractqueuedsynchronizer/
- https://liuzhengyang.github.io/2017/05/12/aqs/
- https://stackoverflow.com/questions/207946/why-does-abstractqueuedsynchronizer-interrupt-on-acquring-lock