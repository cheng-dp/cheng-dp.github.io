---
layout: post
title: CyclicBarrier实现分析
categories: [Java, Java多线程]
description: CyclicBarrier实现分析
keywords: Java, Java多线程
---


## CyclicBarrier

CyclicBarrier基于ReentrantLock + Condition 条件队列 实现。

1. ReentrantLock的作用是在await()中更新count，既剩余需要等待的线程数。

2. Condition trip为等待条件队列，线程将调用trip.await()在该条件队列中等待。

3. 当breakBarrier或者nextGeneration时，将重置计数count，并调用trip.signalAll()唤醒所有线程。

### 重要方法

```java
CyclicBarrier(int parties)
//创建一个新的 CyclicBarrier，它将在给定数量的参与者（线程）处于等待状态时启动，但它不会在启动 barrier 时执行预定义的操作。
CyclicBarrier(int parties, Runnable barrierAction)
//创建一个新的 CyclicBarrier，它将在给定数量的参与者（线程）处于等待状态时启动，并在启动 barrier 时执行给定的屏障操作，该操作由最后一个进入 barrier 的线程执行。

int await()
//在所有参与者都已经在此 barrier 上调用 await 方法之前，将一直等待。
int await(long timeout, TimeUnit unit)
//在所有参与者都已经在此屏障上调用 await 方法之前将一直等待,或者超出了指定的等待时间。
int getNumberWaiting()
//返回当前在屏障处等待的参与者数目。
int getParties()
//返回要求启动此 barrier 的参与者数目。
boolean isBroken()
//查询此屏障是否处于损坏状态。
void reset()
//将屏障重置为其初始状态。
```


### 使用示例
```java
public class Test {

    public static class Worker implements Runnable{

        public Worker(CyclicBarrier barrier, int num){
            this.cyclicBarrier = barrier;
            this.number = num;
        }

        CyclicBarrier cyclicBarrier;
        int number;

        @Override
        public void run() {
            for(int i = 0;i < 3; ++i){
                try{
                    System.out.println("Thread number " + number + " round " + i + " start");
                    Thread.currentThread().sleep(100 * i * number);
                    System.out.println("Thread number " + number + " round " + i + " end");
                    cyclicBarrier.await();

                } catch(Exception e){
                    System.out.println("barrier broke");
                }

            }
        }
    }

    public static void main(String[] args){
        CyclicBarrier cyclicBarrier = new CyclicBarrier(3,() -> {
            System.out.println("Barrier finish one round");
        });

        ExecutorService executorService = Executors.newFixedThreadPool(5);
        executorService.submit(new Worker(cyclicBarrier,1));
        executorService.submit(new Worker(cyclicBarrier,2));
        executorService.submit(new Worker(cyclicBarrier,3));

        executorService.shutdown();

    }

}
```
输出
```
Thread number 1 round 0 start
Thread number 2 round 0 start
Thread number 3 round 0 start
Thread number 1 round 0 end
Thread number 2 round 0 end
Thread number 3 round 0 end
Barrier finish one round
Thread number 3 round 1 start
Thread number 1 round 1 start
Thread number 2 round 1 start
Thread number 1 round 1 end
Thread number 2 round 1 end
Thread number 3 round 1 end
Barrier finish one round
Thread number 3 round 2 start
Thread number 1 round 2 start
Thread number 2 round 2 start
Thread number 1 round 2 end
Thread number 2 round 2 end
Thread number 3 round 2 end
Barrier finish one round
```

### 实现分析

源代码：

https://github.com/unofficial-openjdk/openjdk/blob/jdk/jdk/src/java.base/share/classes/java/util/concurrent/CyclicBarrier.java

CyclicBarrier直接基于**ReentrantLock**和**Condition**实现。

1. 构造函数
```java
public CyclicBarrier(int parties, Runnable barrierAction) {
    if (parties <= 0) throw new IllegalArgumentException();
    // parties表示“必须同时到达barrier的线程个数”。
    this.parties = parties;
    // count表示“处在等待状态的线程个数”。
    this.count = parties;
    // barrierCommand表示“parties个线程到达barrier时，会执行的动作”。
    this.barrierCommand = barrierAction;
}
```
2. 等待函数
```java
public int await() throws InterruptedException, BrokenBarrierException {
    try {
        return dowait(false, 0L);
    } catch (TimeoutException toe) {
        throw new Error(toe); // cannot happen;
    }
}

private int dowait(boolean timed, long nanos)
    throws InterruptedException, BrokenBarrierException,
           TimeoutException {
    final ReentrantLock lock = this.lock;
    // 获取“独占锁(lock)”
    lock.lock();
    try {
        // 保存“当前的generation”
        final Generation g = generation;

        // 若“当前generation已损坏”，则抛出异常。
        if (g.broken)
            throw new BrokenBarrierException();

        // 如果当前线程被中断，则通过breakBarrier()终止CyclicBarrier，唤醒CyclicBarrier中所有等待线程。
        if (Thread.interrupted()) {
            breakBarrier();
            throw new InterruptedException();
        }

       // 将“count计数器”-1
       int index = --count;
       // 如果index=0，则意味着“有parties个线程到达barrier”。
       if (index == 0) {  // tripped
           boolean ranAction = false;
           try {
               // 如果barrierCommand不为null，则执行该动作。
               final Runnable command = barrierCommand;
               if (command != null)
                   command.run();
               ranAction = true;
               // 唤醒所有等待线程，并更新generation。
               nextGeneration();
               return 0;
           } finally {
               if (!ranAction)
                   breakBarrier();
           }
       }

        // 当前线程一直阻塞，直到“有parties个线程到达barrier” 或 “当前线程被中断” 或 “超时”这3者之一发生，
        // 当前线程才继续执行。
        for (;;) {
            try {
                // 如果不是“超时等待”，则调用await()进行等待；否则，调用awaitNanos()进行等待。
                if (!timed)
                    trip.await();
                else if (nanos > 0L)
                    nanos = trip.awaitNanos(nanos);
            } catch (InterruptedException ie) {
                // 如果等待过程中，线程被中断，则执行下面的函数。
                if (g == generation && ! g.broken) {
                    breakBarrier();
                    throw ie;
                } else {
                    Thread.currentThread().interrupt();
                }
            }

            // 如果“当前generation已经损坏”，则抛出异常。
            if (g.broken)
                throw new BrokenBarrierException();

            // 如果“generation已经换代”，则返回index。
            if (g != generation)
                return index;

            // 如果是“超时等待”，并且时间已到，则通过breakBarrier()终止CyclicBarrier，唤醒CyclicBarrier中所有等待线程。
            if (timed && nanos <= 0L) {
                breakBarrier();
                throw new TimeoutException();
            }
        }
    } finally {
        // 释放“独占锁(lock)”
        lock.unlock();
    }
}
```
1. ReentrantLock的作用是在await中更新count，既剩余需要等待的线程数。
2. Condition trip为等待条件队列，线程将在该条件队列中等待被唤醒。
3. 当breakBarrier或者nextGeneration时，将重置计数count，并唤醒所有线程。
```java
/**
 * Sets current barrier generation as broken and wakes up everyone.
 * Called only while holding lock.
 */
private void breakBarrier() {
    generation.broken = true;
    count = parties;
    trip.signalAll();
}

/**
 * Updates state on barrier trip and wakes up everyone.
 * Called only while holding lock.
 */
private void nextGeneration() {
    // signal completion of last generation
    trip.signalAll();
    // set up next generation
    count = parties;
    generation = new Generation();
}
```
4. generation为CyclicBarrier的一个成员变量，同一批的线程属于同一generation，当有parties个线程到达barrier，generation就会被更新换代。线程调用await中会检查generation是否已被更新(换代)或者被标记broken。
```java
private Generation generation = new Generation();

private static class Generation {
    boolean broken = false;
}
```


### REFS

- http://www.cnblogs.com/skywang12345/p/3533995.html