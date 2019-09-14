---
layout: post
title: Java同步工具类(CountDownLatch, FutureTask, Semaphore, CyclicBarrier, Exchanger) 简介
categories: [Java, Java多线程]
description: Java同步工具类(CountDownLatch, FutureTask, Semaphore, CyclicBarrier, Exchanger) 简介
keywords: Java, Java多线程
---


#### CountDownLatch(闭锁)

闭锁的作用相当于一扇门，在闭锁到达结束状态之前，这扇门一直是关闭的。并没有任何线程能通过，当到达结束状态时，这扇门会打开并允许所有线程通过。闭锁可以用来确保某些活动知道其他活动都完成后才继续执行。

```java
//方法
CountDownLatch(int) //构造器，初始化计数。
await() //当前线程一直等待，直到计数器为0才往下执行。
await(long,TimeUnit) //设置当前线程等待一段时间，时间一到，不管其它线程是否执行完成。
countDown() //当前计数器的值减一，当计数器的值减到零时，释放所有await的线程。
getCount() //获取当前计数器的值。
```

栗子：
```java
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadLocalRandom;

public class TempTest {
    public static void main(String[] args) {
        final CountDownLatch firstLatch = new CountDownLatch(3);
        final CountDownLatch secondLatch = new CountDownLatch(3);
        for (int i = 0; i < 3; ++i) {
            Thread t = new Thread("thread " + Integer.toString(i)) {
                public void run() {
                    try {
                        System.out.println(Thread.currentThread().getName() + " start first task");
                        sleep(ThreadLocalRandom.current().nextInt(1, 4) * 1000);
                        System.out.println(Thread.currentThread().getName() + " finish first task");
                        System.out.println(Thread.currentThread().getName() + " wait for all to finish first task");
                        firstLatch.countDown();
                        firstLatch.await();
                        System.out.println(Thread.currentThread().getName() + " start second task");
                        sleep(ThreadLocalRandom.current().nextInt(1, 4));
                        System.out.println(Thread.currentThread().getName() + " finish second task");
                        System.out.println(Thread.currentThread().getName() + " wait for all to finish second task");
                        secondLatch.countDown();
                        secondLatch.await();
                    }
                    catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            };
            t.start();
        }

        try {
            System.out.println("main wait for all finish");
            secondLatch.await();
            System.out.println("All task finished");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

```

输出：
```
thread 0 start first task
thread 1 start first task
main wait for all finish
thread 2 start first task
thread 1 finish first task
thread 1 wait for all to finish first task
thread 2 finish first task
thread 2 wait for all to finish first task
thread 0 finish first task
thread 0 wait for all to finish first task
thread 0 start second task
thread 1 start second task
thread 2 start second task
thread 0 finish second task
thread 0 wait for all to finish second task
thread 2 finish second task
thread 2 wait for all to finish second task
thread 1 finish second task
thread 1 wait for all to finish second task
All task finished
```

#### FutureTask

略

#### Semaphore

```java
/*
构造函数中第二个参数为fair：
fair = true : 当多个线程等待信号量时，先启动的线程优先得到。
fair = false : 当多个线程等待信号量时，与启动顺序无关。
*/
Semaphore semaphore = new Semaphore(10);
Semaphore semaphore = new Semaphore(10,true);  

semaphore.acquire();  
//do something here  
semaphore.release();  
```

测试：
```java
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;

public class TempTest {
    public static void main(String[] args) {
        final Semaphore sema = new Semaphore(1,true);
        for (int i = 0; i < 5; ++i) {
            Thread t = new Thread("thread " + Integer.toString(i)) {
                public void run() {
                    try {
                        sema.acquire();
                        System.out.println(Thread.currentThread().getName() + " acquire the sem");
                        sleep(ThreadLocalRandom.current().nextInt(1, 4) * 1000);
                        sema.release();
                        System.out.println(Thread.currentThread().getName() + " release the sem");
                    }
                    catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            };
            t.start();
        }

        try {
            Thread.sleep(10000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

/*
fair = true时或为默认值时输出：

thread 0 acquire the sem
thread 0 release the sem
thread 1 acquire the sem
thread 1 release the sem
thread 2 acquire the sem
thread 2 release the sem
thread 3 acquire the sem
thread 3 release the sem
thread 4 acquire the sem
thread 4 release the sem

fair = false时输出：

thread 0 acquire the sem
thread 0 release the sem
thread 4 acquire the sem
thread 4 release the sem
thread 2 acquire the sem
thread 2 release the sem
thread 3 acquire the sem
thread 3 release the sem
thread 1 acquire the sem
*/
```

#### CyclicBarrier

CyclicBarrier可以使一定数量的参与方反复地在Barrier位置汇集，阻塞直到所有的线程都达到Barrier的位置。如果所有线程都达到Barrier的位置，Barrier将打开，释放所有线程，并且能够重置以便下一次使用。**如果在await时有线程调用超时，或者有线程被中断，则认为Barrier被打破，所有阻塞的线程将终止并抛出BrokenBarrierException**。

CyclicBarrier通常被用于并行迭代算法中。

CyclicBarrier提供的方法：
```java
//parties表示屏障拦截的线程数量，当屏障撤销时，先执行barrierAction，然后再释放所有线程
public CyclicBarrier(int parties, Runnable barrierAction)
//barrierAction默认为null
public CyclicBarrier(int parties)

/*
 *当前线程等待直到所有线程都调用了该屏障的await()方法
 *如果当前线程不是将到达的最后一个线程，将会被阻塞。解除阻塞的情况有以下几种
 *    1）最后一个线程调用await()
 *    2）当前线程被中断
    3）其他正在该CyclicBarrier上等待的线程被中断
    4）其他正在该CyclicBarrier上等待的线程超时
    5）其他某个线程调用该CyclicBarrier的reset()方法
 *如果当前线程在进入此方法时已经设置了该线程的中断状态或者在等待时被中断，将抛出InterruptedException，并且清除当前线程的已中断状态。
 *如果在线程处于等待状态时barrier被reset()或者在调用await()时 barrier 被损坏，将抛出 BrokenBarrierException 异常。
 *如果任何线程在等待时被中断，则其他所有等待线程都将抛出 BrokenBarrierException 异常，并将 barrier 置于损坏状态。 *如果当前线程是最后一个将要到达的线程，并且构造方法中提供了一个非空的屏障操作（barrierAction），那么在允许其他线程继续运行之前，当前线程将运行该操作。如果在执行屏障操作过程中发生异常，则该异常将传播到当前线程中，并将 barrier 置于损坏状态。
 *
 *返回值为当前线程的索引，0表示当前线程是最后一个到达的线程
 */
public int await() throws InterruptedException, BrokenBarrierException
//在await()的基础上增加超时机制，如果超出指定的等待时间，则抛出 TimeoutException 异常。如果该时间小于等于零，则此方法根本不会等待。
public int await(long timeout, TimeUnit unit) throws InterruptedException, BrokenBarrierException, TimeoutException

//将屏障重置为其初始状态。如果所有参与者目前都在屏障处等待，则它们将返回，同时抛出一个BrokenBarrierException。
public void reset()
```

栗子：
```java
    public static void main(String[] args) {
        final CyclicBarrier cyclicBarrier = new CyclicBarrier(2,
                () -> System.out.println("Run this task first")
                );

        for (int i = 0; i < 2; ++i) {
            new Thread(() -> {
                try {
                    System.out.println(Thread.currentThread().getName() + " start first task");
                    Thread.sleep(ThreadLocalRandom.current().nextInt(1, 4) * 1000);
                    System.out.println(Thread.currentThread().getName() + " finish first task");
                    System.out.println(Thread.currentThread().getName() + " wait before barrier");
                    cyclicBarrier.await();
                    System.out.println(Thread.currentThread().getName() + " start second task");
                    Thread.sleep(ThreadLocalRandom.current().nextInt(1, 4) * 1000);
                    System.out.println(Thread.currentThread().getName() + " finish second task");
                    System.out.println(Thread.currentThread().getName() + " wait before barrier");
                    cyclicBarrier.await();
                    System.out.println(Thread.currentThread().getName() + "finish all");
                }
                    catch (Exception e) {
                        e.printStackTrace();
                    }
                }).start();
        }

        try {
            Thread.sleep(20 * 1000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    
/*
输出：
Thread-0 start first task
Thread-1 start first task
Thread-1 finish first task
Thread-1 wait before barrier
Thread-0 finish first task
Thread-0 wait before barrier
Run this task first
Thread-0 start second task
Thread-1 start second task
Thread-0 finish second task
Thread-0 wait before barrier
Thread-1 finish second task
Thread-1 wait before barrier
Run this task first
Thread-1finish all
Thread-0finish all
*/
```

### Exchanger<V>

Exchanger能够在并发任务之间交换数据。Exchanger允许在两个线程之间定义交换点，两个达到交换点的线程能够交换数据，第一个线程中的数据进入第二个线程，第二个线程中的数据进入第一个线程。

```java
//构造函数
public Exchanger();
//等待另一个线程到达交换点并交换数据。
public V exchange(V x) throws InterruptedException;
//等待给定时间内另一个线程到达交换点并交换数据。
public V exchange(V x, long timeout, TimeUnit unit)
        throws InterruptedException, TimeoutException;
```

利用Exchanger实现生产者消费者模型。
```java
class FillAndEmpty {
   Exchanger<DataBuffer> exchanger = new Exchanger<DataBuffer>();
   DataBuffer initialEmptyBuffer = ... a made-up type
   DataBuffer initialFullBuffer = ...

   class FillingLoop implements Runnable {
     public void run() {
       DataBuffer currentBuffer = initialEmptyBuffer;
       try {
         while (currentBuffer != null) {
           addToBuffer(currentBuffer);
           if (currentBuffer.isFull())
             currentBuffer = exchanger.exchange(currentBuffer);
         }
       } catch (InterruptedException ex) { ... handle ... }
     }
   }

   class EmptyingLoop implements Runnable {
     public void run() {
       DataBuffer currentBuffer = initialFullBuffer;
       try {
         while (currentBuffer != null) {
           takeFromBuffer(currentBuffer);
           if (currentBuffer.isEmpty())
             currentBuffer = exchanger.exchange(currentBuffer);
         }
       } catch (InterruptedException ex) { ... handle ...}
     }
   }

   void start() {
     new Thread(new FillingLoop()).start();
     new Thread(new EmptyingLoop()).start();
   }
}
```