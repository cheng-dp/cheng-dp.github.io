---
layout: post
title: Java线程状态及Thread类
categories: [Java, Java多线程]
description: Java线程状态及Thread类
keywords: Java, Java多线程
---

#### 线程的状态

```java
public static enum Thread.State {
BLOCKED
//Thread state for a thread blocked waiting for a monitor lock.
NEW
//Thread state for a thread which has not yet started.
RUNNABLE
//Thread state for a runnable thread. Might be waiting for operating system resource.
TERMINATED
//Thread state for a terminated thread.
TIMED_WAITING
//Thread state for a waiting thread with a specified waiting time.
WAITING
//Thread state for a waiting thread.
}

```

Thread State是JVM的线程状态，不是操作系统线程状态。如Runnable状态的线程可能正在运行，也可能在等待操作系统CPU资源(对应操作系统线程状态的Runnable和Running)。

![线程状态](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_javaConcur/%E7%BA%BF%E7%A8%8B%E7%8A%B6%E6%80%81%E5%88%87%E6%8D%A2.jpg)



#### 重要方法
```
public class Thread implements Runnable{
public void run();
//start()方法启动线程后，线程获得CPU时间后会执行run中的语句。
//通过构造函数传入Runnable或者继承重写run方法，默认run方法为空。

public void start(); //JVM开始调用线程的run方法。 

static void sleep(long millis); //sleep方法不会释放锁！
static void sleep(long millis, int nanos);

static void yield(); //让出当前CPU执行权限，重回Runnable状态，不会释放锁。

void join();
void join(long millis);
void join(long millis, int nanos);
//等待thread执行完毕或超时，实质是调用Object.wait()方法，阻塞并释放所持有的锁。

void interrupt();
//设置中断位，对于wait/join/sleep等阻塞方法，将抛出InterruptedException并重置中断位。

boolean isInterrupted();
//返回是否设置中断位。

static boolean interrupted();
//返回是否设置中断位，并重置中断位，也就是如果连续两次调用该方法，第二次调用肯定返回false。

getPriority();
void setPriority(int newPriority);
//设置优先级，Thread中有三个预定义的优先级:MAX_PRIORITY, MIN_PRIORITY, NORM_PRIORITY。

boolean isDaemon();
void setDaemon(boolean on);
//设置线程为daemon，必须在调用start前调用该方法。当JVM中没有普通线程(用户线程)/只存在daemon线程时，JVM将退出。

static Thread.UncaughtExceptionHandler getDefaultUncaughtExceptionHandler();
static void setDefaultUncaughtExceptionHandler(Thread.UncaughtExceptionHandler eh);
Thread.UncaughtExceptionHandler getDefaultUncaughtExceptionHandler();
void setUncaughtExceptionHandler(Thread.UncaughtExceptionHandler eh);
//设置UncaughtExceptionHandler。
}

```

几个注意点：

sleep()和yield()方法不会释放持有的锁，join()方法会释放持有的锁。

interrupt()方法只是设置中断位。

1. Object.wait()/join()/sleep()会抛出InterruptedException。
2. 线程阻塞在能够被中断的I/O channel上，抛出ClosedByInterruptException。
3. 线程被阻塞在Selector上，Selector会立即返回。
4. 其他情况下只是设置中断位，需要线程中配合isInterrupted()检测并处理。


## UncaughtExceptionHandler

在多线程环境下，线程抛出的异常是无法通过try...catch...捕获的，Java Thread提供了UncaughtExceptionHandler来捕获并处理异常。
```java
interface Thread.UncaughtExceptionHandler{
void uncaughtException(Thread t, Throwable e);
//t为发生异常的线程，e为抛出的异常。
}
```
`Thread.setDefaultExceptionHandler(Thread.UncaughtExceptionHandler eh);`能够为所有线程设置默认的UncaughtExceptionHandler。
