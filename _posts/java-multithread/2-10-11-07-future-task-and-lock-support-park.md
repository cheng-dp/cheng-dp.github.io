---
layout: post
title: fail-fast机制和ConcurrentModificationException
categories: [Java, Java多线程]
description: fail-fast机制和ConcurrentModificationException
keywords: Java, Java多线程
---

## FutureTask使用

FutureTask同时继承了Runnable和Future接口，因此，既可以作为Runnable被Thread或Executor执行，也可以作为Future用来获取任务执行返回结果。

**任务提交运行的流程：**
1. 创建runnable或callable。
2. executor.submit(runnable/callable)，submit中newTaskFor方法会创建并返回FutureTask(实现了RunnableFuture接口)，FutureTask中runnable会被封装为返回值为null的callable。
3. submit方法调用ThreadPoolExecutor中实现的execute方法，分配线程池中的线程调用FutureTask的run方法运行任务。
4. FutureTask的run方法会调用其中的callable.call或runnable.run得到运行结果并保存在FutureTask中。
5. executor.submit方法最终返回该FutureTask，用户调用FutureTask.get等待并得到其中的运行结果

## FutureTask实现

**源码：**

https://github.com/unofficial-openjdk/openjdk/blob/jdk/jdk/src/java.base/share/classes/java/util/concurrent/FutureTask.java

**FutureTask相关类图：**

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/FutureTaskUML.png)

- RunnableFuture接口继承了Runnable接口和Future接口。
- FutureTask实现了RunnableFuture接口，也就是实现了Runnable的run()方法以及Future中get()/isDone()/isCancelled()/cancal()方法。

### 内部字段

```java
public class FutureTask<V> implements RunnableFuture<V> {
    private volatile int state;
    private static final int NEW          = 0;
    private static final int COMPLETING   = 1;
    private static final int NORMAL       = 2;
    private static final int EXCEPTIONAL  = 3;
    private static final int CANCELLED    = 4;
    private static final int INTERRUPTING = 5;
    private static final int INTERRUPTED  = 6;

    /** The underlying callable; nulled out after running */
    private Callable<V> callable;
    
    /** The result to return or exception to throw from get() */
    private Object outcome; // non-volatile, protected by state reads/writes
    
    /** The thread running the callable; CASed during run() */
    private volatile Thread runner;
    
    /** Treiber stack of waiting threads */
    private volatile WaitNode waiters;

    //...
    //...
    //...
}
```

1. state

当前FutureTask的状态。
```
NEW:表示是个新的任务或者还没被执行完的任务。这是初始状态。
COMPLETING:任务已经执行完成或者执行任务的时候发生异常，但是任务执行结果或者异常原因还没有保存到outcome字段(outcome字段用来保存任务执行结果，如果发生异常，则用来保存异常原因)的时候，状态会从NEW变更到COMPLETING。但是这个状态会时间会比较短，属于中间状态。
NORMAL:任务已经执行完成并且任务执行结果已经保存到outcome字段，状态会从COMPLETING转换到NORMAL。这是一个最终态。
EXCEPTIONAL:任务执行发生异常并且异常原因已经保存到outcome字段中后，状态会从COMPLETING转换到EXCEPTIONAL。这是一个最终态。
CANCELLED:任务还没开始执行或者已经开始执行但是还没有执行完成的时候，用户调用了cancel(false)方法取消任务且不中断任务执行线程，这个时候状态会从NEW转化为CANCELLED状态。这是一个最终态。
INTERRUPTING: 任务还没开始执行或者已经执行但是还没有执行完成的时候，用户调用了cancel(true)方法取消任务并且要中断任务执行线程但是还没有中断任务执行线程之前，状态会从NEW转化为INTERRUPTING。这是一个中间状态。
INTERRUPTED:调用interrupt()中断任务执行线程之后状态会从INTERRUPTING转换到INTERRUPTED。这是一个最终态。
```

2. callable

该FutureTask对应的任务。

3. runner

执行callable的线程。

4. waiters

==其他线程调用get阻塞，会创建对应WaitNode链表。==

### 构造函数

```java
public FutureTask(Callable<V> callable) {
    if (callable == null)
        throw new NullPointerException();
    this.callable = callable;
    this.state = NEW;       // ensure visibility of callable
}

//runnable将被包装为callable
public FutureTask(Runnable runnable, V result) {
    this.callable = Executors.callable(runnable, result);
    this.state = NEW;       // ensure visibility of callable
}
```

### run方法

FutureTask的第一个重要方法是Runnable接口的run方法，无论是通过Thread还是线程池运行，最终都是调用FutureTask的run方法。

1. 判断当前任务的state是否等于NEW,如果不为NEW则说明任务或者已经执行过，或者已经被取消，直接返回。
2. 如果状态为NEW则接着会通过unsafe类把任务执行线程引用CAS的保存在runner字段中，如果保存失败，则直接返回。
3. 执行任务。
4. 如果任务执行发生异常，则调用setException()方法保存异常信息。

```java
public void run() {
    // 1. 状态如果不是NEW，说明任务或者已经执行过，或者已经被取消，直接返回
    // 2. 状态如果是NEW，则尝试把当前执行线程保存在runner字段中
    // 如果赋值失败则直接返回
    if (state != NEW ||
        !UNSAFE.compareAndSwapObject(this, runnerOffset,
                                     null, Thread.currentThread()))
        return;
    try {
        Callable<V> c = callable;
        if (c != null && state == NEW) {
            V result;
            boolean ran;
            try {
                // 3. 执行任务
                result = c.call();
                ran = true;
            } catch (Throwable ex) {
                result = null;
                ran = false;
                // 4. 任务异常
                setException(ex);
            }
            if (ran)
                // 4. 任务正常执行完毕
                set(result);
        }
    } finally {
        // runner must be non-null until state is settled to
        // prevent concurrent calls to run()
        runner = null;
        // state must be re-read after nulling runner to prevent
        // leaked interrupts
        int s = state;
        // 5. 如果任务被中断，执行中断处理
        if (s >= INTERRUPTING)
            handlePossibleCancellationInterrupt(s);
    }
}
```

### get方法

FutureTask的第二个重要方法是Future接口的get方法。

get方法中根据任务状态判断是否完成，如果完成或异常则返回结果，如果没有完成则调用awaitDone阻塞等待结果。

```java
public V get() throws InterruptedException, ExecutionException {
    int s = state;
    if (s <= COMPLETING)
        s = awaitDone(false, 0L);
    return report(s);
}
```

### awaitDone方法

awaitDone是FutureTask的private方法，当调用get()获取任务结果但是任务还没执行完成的时候，调用线程会调用awaitDone()方法进行阻塞等待。

==awaitDone中，在**for循环**中判断任务线程是否已被中断，或者任务是否完成、中断或取消。如果任务仍在执行，则构造wWaitNode节点加入waiter队列，并调用**LockSupport.park阻塞线程**。==

```java
private int awaitDone(boolean timed, long nanos)
        throws InterruptedException {
    // 计算等待截止时间
    final long deadline = timed ? System.nanoTime() + nanos : 0L;
    WaitNode q = null;
    boolean queued = false;
    for (;;) {
        // 1. 判断阻塞线程是否被中断,如果被中断则在等待队
        // 列中删除该节点并抛出InterruptedException异常
        if (Thread.interrupted()) {
            removeWaiter(q);
            throw new InterruptedException();
        }

        // 2. 获取当前状态，如果状态大于COMPLETING
        // 说明任务已经结束(要么正常结束，要么异常结束，要么被取消)
        // 则把thread显示置空，并返回结果
        int s = state;
        if (s > COMPLETING) {
            if (q != null)
                q.thread = null;
            return s;
        }
        // 3. 如果状态处于中间状态COMPLETING
        // 表示任务已经结束但是任务执行线程还没来得及给outcome赋值
        // 这个时候让出执行权让其他线程优先执行
        else if (s == COMPLETING) // cannot time out yet
            Thread.yield();
        // 4. 如果等待节点为空，则构造一个等待节点
        else if (q == null)
            q = new WaitNode();
        // 5. 如果还没有入队列，则把当前节点加入waiters首节点并替换原来waiters
        else if (!queued)
            queued = UNSAFE.compareAndSwapObject(this, waitersOffset,
                    q.next = waiters, q);
        else if (timed) {
            // 如果需要等待特定时间，则先计算要等待的时间
            // 如果已经超时，则删除对应节点并返回对应的状态
            nanos = deadline - System.nanoTime();
            if (nanos <= 0L) {
                removeWaiter(q);
                return state;
            }
            // 6. 阻塞等待特定时间
            LockSupport.parkNanos(this, nanos);
        }
        else
            // 6. 阻塞等待直到被其他线程唤醒
            LockSupport.park(this);
    }
}
```

### cancel方法

用户调用FutureTask.cancel(mayInterruptIfRunning)方法取消任务的执行。

- 如果mayInterruptIfRunning=true，则设置任务线程中断位，并且将任务状态修改为INTERRUPTED。
- 如果mayInterruptIfRunning=false，则直接修改任务状态为CANCELLED。
- 调用finishCompletion方法唤醒等待线程。

cancel方法只是设置任务线程的中断位(interrupted=true)，并不一定能成功中断任务线程。

```java
public boolean cancel(boolean mayInterruptIfRunning) {
    // 1. 如果任务已经结束，则直接返回false
    if (state != NEW)
        return false;
    // 2. 如果需要中断任务执行线程
    if (mayInterruptIfRunning) {
        // 2.1. 把任务状态从NEW转化到INTERRUPTING
        if (!UNSAFE.compareAndSwapInt(this, stateOffset, NEW, INTERRUPTING))
            return false;
        Thread t = runner;
        // 2.2. 中断任务执行线程
        if (t != null)
            t.interrupt();
        // 2.3. 修改状态为INTERRUPTED
        UNSAFE.putOrderedInt(this, stateOffset, INTERRUPTED); // final state
    }
    // 3. 如果不需要中断任务执行线程，则直接把状态从NEW转化为CANCELLED
    else if (!UNSAFE.compareAndSwapInt(this, stateOffset, NEW, CANCELLED))
        return false;
    // 4. 
    finishCompletion();
    return true;
}
```

### finishCompletion方法

无论任务成功执行、抛出异常、被取消最终都会调用finishCompletion方法。
- run方法执行完毕调用set方法设置返回值，set方法会调用finishCompletion方法。
- setException方法调用finishCompletion方法。
- cancel方法调用finishCompletion方法。

finishCompletion方法依次遍历waiters链表，唤醒节点中的线程，然后把callable置空。

```java
private void finishCompletion() {
    // assert state > COMPLETING;
    for (WaitNode q; (q = waiters) != null;) {
        if (UNSAFE.compareAndSwapObject(this, waitersOffset, q, null)) {
            for (;;) {
                Thread t = q.thread;
                if (t != null) {
                    q.thread = null;
                    LockSupport.unpark(t);
                }
                WaitNode next = q.next;
                if (next == null)
                    break;
                q.next = null; // unlink to help gc
                q = next;
            }
            break;
        }
    }

    done();

    callable = null;        // to reduce footprint
}
```

## LockSupport类

LockSupport是Java 1.6引入的一个类，提供了基本的线程同步原语。

属于`java.util.concurrent.locks`包。

LockSupport利用Unsafe中的park和unpark操作精确控制线程的阻塞和唤醒。

```
public class LockSupport {
    //...
    //...
    
    public static void unpark(Thread thread) {
        if (thread != null)
            UNSAFE.unpark(thread);
    }
    
    public static void park() {
        UNSAFE.park(false, 0L);
    }
    
    //...
    
}
```

### 使用方式

LockSupport.park()等待"许可"，LockSupport.unpark()则为线程提供"许可"。

"许可"类似于信号量，但是“许可”不能叠加，并且是一次性的。

可以在park()之前调用unpark()提供许可，这样下一次线程调用park()就会发现已经有许可，会马上继续运行。

如果线程B连续调用了三次unpark(ThreadA)，线程A只要调用一次park()就会消费该许可，再次调用park()就进入WAITING状态。

### Unsafe.park和Unsafe.unpark

```
public final class Unsafe {
    public native void unpark(Thread jthread);
    public native void park(boolean isAbsolute, long time);
}
```

Unsafe.park和Unsafe.unpark基于native实现，低层调用系统提供的posix mutex及condition实现。

### park(), unpark()和wait(), notify(), notifyAll()的区别

park/unpark模型真正解耦了线程之间的同步，线程之间不再需要一个Object或者其它变量来存储状态，不再需要关心对方的状态。

**区别**

1. park/unpark更加直接

wait()/notify()/notifyAll()模型是基于object monitor实现的，方法的对象是Object，且需要首先取得synchronized锁。

park和unpark是直接对线程进行操作，方法的对象是线程本身。

2. park/unpark更加灵活

如果要通知特定的线程，notify时必须确保目标线程已经调用wait，否则如果notify先被调用，目标线程将不会被唤醒。

并且notify/notifyAll无法对特定线程进行操作，只能是唤醒某一个或者所有。

**联系**

调用park和wait阻塞的线程状态都是WAITING或TIMED_WAITING。

## REFS
- http://beautyboss.farbox.com/post/study/shen-ru-xue-xi-futuretask
 
```
本文地址：https://cheng-dp.github.io//-multithread/2-10-11-07-future-task-and-lock-support-park/
```
 
