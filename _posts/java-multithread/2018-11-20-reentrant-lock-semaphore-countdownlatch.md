---
layout: post
title: ReentrantLock, Semaphore, CountDownLatch实现
categories: [Java, Java多线程]
description: ReentrantLock, Semaphore, CountDownLatch实现
keywords: Java, Java多线程
---



JUC中ReentrantLock, Semaphore, CountDownLatch, ReentrantReadWriteLock, FutureTask都是基于AQS构建。但是没有直接扩展AQS，而是都将它们的相应功能委托给私有的AQS子类Sync实现。

#### ReentrantLock

**源代码**

方法 | 方法
--- | ---
ReentrantLock() | getHoldCount()
ReentrantLock(boolean fair) | getOwner()
void lock() | getQueuedThreads()
void lockinterruptibly() | getQueueLength()
boolean tryLock() | getWaitingThreads(Condition condition)
boolean tryLock(long timeout, TimeUnit unit) | getWaitQueueLength(Condition condition)
void unlock() | hasQueuedThread(thread thread)
Condition newCondition() | hasQueuedThreads()
isFair() | hasWaiters(Condition condition)

https://github.com/unofficial-openjdk/openjdk/blob/jdk/jdk/src/java.base/share/classes/java/util/concurrent/locks/ReentrantLock.java

1. ReentrantLock的state为可重入锁的重入次数，当state=0时，表示未锁定。state>0时，表示占有锁的线程重入的次数。
2. ReentrantLock有公平和非公平两种模式。非公平模式先直接调用compareAndSetState尝试获取锁，失败后再调用acquire。公平模式先调用hasQueuedPredecessors()判断同步队列**没有前序结点**后再尝试获取锁。
3. ReentrantLock中有两个子类fairSync和nonFairSync分别继承了Sync并提供了tryAquire和Lock实现。
4. ReentrantLock的Condition队列直接返回AQS中的ConditionObject实现。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/java_reentrantLock_uml.jpeg)

#### Semaphore

方法 | 方法
--- | ---
void acquire() | getQueuedThreads()
void acquire(int permits) | getQueueLength()
void acquireUninterruptibly() | hasQueuedThreads()
void acquireUninterruptibly(int permits) | reducePermits(int reduction)
int availablePermits() | void release() 
boolean tryAcquire() | void release(int permits) 
boolean tryAcquire(int permits) | boolean isFair() 
boolean tryAcquire(int permits, long timeout, Timeunit unit) 

**源代码**

https://github.com/unofficial-openjdk/openjdk/blob/jdk/jdk/src/java.base/share/classes/java/util/concurrent/Semaphore.java

1. Semaphore的state表示permit的总数目。

2. Semaphore允许多个线程同时持有锁，因此Semaphore为==共享锁SHARED==。

3. Semaphore和ReentrantLock一样也有公平和非公平两种模式。公平模式同样也是先调用hasQueuedPredecessors()判断同步队列**没有前序结点**后再尝试获取锁。

4. 和ReentrantLock一样提供fairSync和nonFairSync两个子类继承Sync实现不同的tryAcquireShared。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/java_semaphore_uml.jpg)

#### CountDownLatch

方法 | 方法
--- | ---
await() |
await(long timeout, TimeUnit unit) |
countDown() |
getCount() |

**源代码**

https://github.com/unofficial-openjdk/openjdk/blob/jdk/jdk/src/java.base/share/classes/java/util/concurrent/CountDownLatch.java

1. CountDownLatch的state表示计数数目。
2. CountDownLatch只有一个Sync实现。当计数减至0时，需要释放**所有**阻塞的线程，因此使用SHARED模式，复写tryAcquireShared和tryReleaseShared。
```java
private static final class Sync extends AbstractQueuedSynchronizer {
    private static final long serialVersionUID = 4982264981922014374L;

    Sync(int count) {
        setState(count);
    }

    int getCount() {
        return getState();
    }

    protected int tryAcquireShared(int acquires) {
        return (getState() == 0) ? 1 : -1;
    }

    protected boolean tryReleaseShared(int releases) {
        // Decrement count; signal when transition to zero
        for (;;) {
            int c = getState();
            if (c == 0)
                return false;
            int nextc = c-1;
            if (compareAndSetState(c, nextc))
                return nextc == 0;
        }
    }
}
```
3. await实现
由于state不等于0时，tryAcquireShared一直返回-1，线程调用await会在doAcquireShared中被park阻塞。
```java
public void await() throws InterruptedException {
    sync.acquireSharedInterruptibly(1);
}
```
4. countDown实现
调用countDown会调用tryReleaseShared使得state减一，当state不等于0时，tryReleaseShared返回false，不会释放阻塞的线程。
```java
public void countDown() {
    sync.releaseShared(1);
}
```

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/java_CountDownLatch_uml.jpg)

### ReentrantReadWriteLock

见笔记 ReentrantReadWriteLock实现分析。

**源代码**

https://github.com/unofficial-openjdk/openjdk/blob/jdk/jdk/src/java.base/share/classes/java/util/concurrent/locks/ReentrantReadWriteLock.java


 
```
本文地址：https://cheng-dp.github.io/2018/11/20/reentrant-lock-semaphore-countdownlatch/
```
 
