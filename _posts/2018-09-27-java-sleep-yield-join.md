---
layout: post
title: Thread线程方法sleep、yield、join详解
categories: [Java, Java多线程]
description: Thread线程方法sleep、yield、join详解
keywords: Java, Java多线程
---
#### sleep方法

sleep方法由==native实现==，使thread休眠给定时间，且休眠时不会释放已获取的monitor锁(synchronzied)。

sleep中线程状态为TIMED_WAITING。

```java
/**
* Causes the currently executing thread to sleep (temporarily cease
* execution) for the specified number of milliseconds, subject to
* the precision and accuracy of system timers and schedulers. The thread
* does not lose ownership of any monitors.
*
* @param  millis
*         the length of time to sleep in milliseconds
*
* @throws  IllegalArgumentException
*          if the value of {@code millis} is negative
*
* @throws  InterruptedException
*          if any thread has interrupted the current thread. The
*          <i>interrupted status</i> of the current thread is
*          cleared when this exception is thrown.
*/
public static native void sleep(long millis) throws InterruptedException;
```


#### yield方法

yield方法也由==native实现==，通知线程调度器当前线程可以让出CPU，线程调度器可以响应或者忽略此请求。线程从运行状态变为就绪状态，其他处于可运行状态的线程将竞争CPU资源。


由yield只是暂时释放CPU，并不会释放获取的锁。

```java
/**
* A hint to the scheduler that the current thread is willing to yield
* its current use of a processor. The scheduler is free to ignore this
* hint.
*
* <p> Yield is a heuristic attempt to improve relative progression
* between threads that would otherwise over-utilise a CPU. Its use
* should be combined with detailed profiling and benchmarking to
* ensure that it actually has the desired effect.
*
* <p> It is rarely appropriate to use this method. It may be useful
* for debugging or testing purposes, where it may help to reproduce
* bugs due to race conditions. It may also be useful when designing
* concurrency control constructs such as the ones in the
* {@link java.util.concurrent.locks} package.
*/
public static native void yield();
```

#### join方法

A线程调用B线程的join方法，A线程将阻塞等待B线程结束。

==join方法基于wait方法实现==，将调用被等待线程thread对象的wait方法。由《synchronized、Monitor、wait&notify&notifyAll实现原理》可知，调用Object的wait方法需要首先持有monitor锁，因此join方法必须是synchronzied的。

==wait方法调用时会释放对应的对象锁，而join方法本身是synchronized，需要获取锁，因此调用wait方法释放的正是join方法获取的锁，也就不会释放其他锁。==

```java
/**
* Waits at most {@code millis} milliseconds for this thread to
* die. A timeout of {@code 0} means to wait forever.
*
* <p> This implementation uses a loop of {@code this.wait} calls
* conditioned on {@code this.isAlive}. As a thread terminates the
* {@code this.notifyAll} method is invoked. It is recommended that
* applications not use {@code wait}, {@code notify}, or
* {@code notifyAll} on {@code Thread} instances.
*
* @param  millis
*         the time to wait in milliseconds
*
* @throws  IllegalArgumentException
*          if the value of {@code millis} is negative
*
* @throws  InterruptedException
*          if any thread has interrupted the current thread. The
*          <i>interrupted status</i> of the current thread is
*          cleared when this exception is thrown.
*/
public final synchronized void join(long millis)
throws InterruptedException {
long base = System.currentTimeMillis();
long now = 0;

if (millis < 0) {
throw new IllegalArgumentException("timeout value is negative");
}

if (millis == 0) {
while (isAlive()) {
wait(0);
}
} else {
while (isAlive()) {
long delay = millis - now;
if (delay <= 0) {
break;
}
wait(delay);
now = System.currentTimeMillis() - base;
}
}
}
```

==join方法的基础逻辑为：==
```java
while(isAlive()){
wait(time);
}
```
即，join方法将阻塞A线程，直到：
- B线程isAlive=false。
- A线程收到notify/notifyAll。

当B线程结束时，isAlive=false成立，同时，线程结束时，在JVM实现的native C++方法中，将调用一个ensure_join方法，对B thread对象调用notifyAll。

```
static void ensure_join(JavaThread* thread) {
Handle threadObj(thread, thread->threadObj());

ObjectLocker lock(threadObj, thread);

thread->clear_pending_exception();

java_lang_Thread::set_thread_status(threadObj(), java_lang_Thread::TERMINATED);

java_lang_Thread::set_thread(threadObj(), NULL);

//唤醒所有在该thread上join(wait)的线程。
lock.notify_all(thread);

thread->clear_pending_exception();
}
```

#### REFS

- https://segmentfault.com/q/1010000005052854
- https://www.zhihu.com/question/44621343
