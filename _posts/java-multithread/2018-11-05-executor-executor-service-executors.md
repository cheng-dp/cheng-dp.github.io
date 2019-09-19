---
layout: post
title: Executor, ExecutorService, Executors, ScheduledExecutorService和CompletionService
categories: [Java, Java多线程]
description: Executor, ExecutorService, Executors, ScheduledExecutorService和CompletionService
keywords: Java, Java多线程
---

java.util.concurrent.Executor, java.util.concurrent.ExecutorService, java.util.concurrent.Executors 这三者均是 Java Executor 框架的一部分，使用Executor框架能够将任务的提交和任务的执行解耦，从单个线程的提交执行进化到通过线程池的形式进行管理。Java 1.5之后还提供了许多内置的线程池配置进一步简化线程池的创建和管理。


### Executor

```java
public interface Executor {
    void execute(Runnable command);
}
```
java.lang.Thread类是将任务的提交与执行耦合在一起，而Executor接口能够将任务提交与执行分离。如：
```java
//为每个提交的任务创建一个线程执行
class ThreadPerTaskExecutor implements Executor{
    public void execute(Runnable r){
        new Thread(r).start();
    }
}

//同步执行每个任务
class DirectExecutor implements Executor{
    public void execute(Runnable r){
        r.run();
    }
}
```

### ExecutorService

ExecutorService接口扩展了Executor接口，是Java.util.concurrent中对于线程池的抽象。ExecutorService提供了返回Future的提交方法，以及终止、关闭线程池的方法。

```java
public interface ExecutorService extends Executor {
    
    //还未执行的任务不再执行，等待正在执行的任务完成后关闭。
    void shutdown();
    
    //还未执行的任务不再执行，尝试interrupt正在执行的任务，并且返回==已提交但尚未开始==的任务
    List<Runnable> shutdownNow();
    
    //当executor被shutdown后返回true。
    boolean isShutdown();
    
    //当executor被shutdown后，所有任务都完成后，返回true。
    //除非首先调用shutdown()或shutdownNow()，否则都为false。
    boolean isTerminated();
    
    //shutdown后等待所有任务线程执行完成。
    boolean awaitTermination(long timeout, TimeUnit unit)
        throws InterruptedException;
    
    <T> Future<T> submit(Callable<T> task);
    
    //当执行完成无异常时返回future.get()得到result。
    <T> Future<T> submit(Runnable task, T result);
    
    //当执行完成无异常时future.get()得到null值。
    Future<?> submit(Runnable task);
    
    //提交一个容器的task，阻塞直到所有任务完成并返回future，或者抛出exception。
    <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks)
        throws InterruptedException;
    
    //提交一个容器的task，阻塞直到所有任务完成并返回future，或者timeout超时返回future，超时后所有未完成的任务会被取消。
    <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks,
                                  long timeout, TimeUnit unit)
        throws InterruptedException;
        
    //返回任意一个已经完成的任务==future==，返回或抛出exception后，未完成的任务将被取消。也就是只需要一个结果。
    <T> T invokeAny(Collection<? extends Callable<T>> tasks)
        throws InterruptedException, ExecutionException;

    //在timeout时限内返回任意一个已经完成的任务的返回值，返回或抛出exception后，所有未完成的任务将被取消。
    <T> T invokeAny(Collection<? extends Callable<T>> tasks,
                    long timeout, TimeUnit unit)
        throws InterruptedException, ExecutionException, TimeoutException;
}
```

1. submit为无返回值的runnable提供了返回值参数。
2. invokeAll会阻塞直到所有的任务都完成或者超时或抛出exception，通过future.get()得到各个任务的运行结果或者exception信息。
3. ==invokeAny当一个线程返回时，其他线程会被interrupt。==
4. 调用shutdown/shutdownNow后，ExecutorService的状态变成`SHUTDOWN`,submit新任务会抛出`RejectedExecutionException`。
5. 优雅的关闭ExecutorService：
    ```java
    service.shutdown();
    try{
        if(service.awaitTermination(2,TimeUnit.SECONDS)){
            service.shutdownNow();
        }
    }
    catch(InterruptedException e){
        service.shutdownNow();
    }
    ```

例子一：invokeAny()，未完成的任务被interrupt
```java
public static void main(String[] args) {
    ExecutorService executorService = Executors.newCachedThreadPool();
    List<Callable<Long>> tasks = new LinkedList<>();
    tasks.add(new Callable<Long>() {
        @Override
        public Long call() {
            log.info("start thread " + Thread.currentThread().getName());
            try {
                Thread.sleep(5 * 1000);
            }
            catch (Exception e) {
                e.printStackTrace();
            }
            log.info("finish thread " + Thread.currentThread().getName());
            return Thread.currentThread().getId();
        }
    });

    tasks.add(new Callable<Long>() {
        @Override
        public Long call() {
            log.info("start thread " + Thread.currentThread().getName());
            try {
                Thread.sleep(2 * 1000);
            }
            catch (Exception e) {
                e.printStackTrace();
            }
            log.info("finish thread " + Thread.currentThread().getName());
            return Thread.currentThread().getId();
        }
    });

    try {
        log.info("Start tasks");
        Long ret = executorService.invokeAny(tasks);
        log.info("Finish tasks");
    } catch (Exception e) {
        log.info("Interrupted!!");
    }
    executorService.shutDown();
}

//output
/*
12:47:35.775 INFO  com.worksap.company.TempTest - Start tasks
12:47:35.835 INFO  com.worksap.company.TempTest - start thread pool-1-thread-1
12:47:35.839 INFO  com.worksap.company.TempTest - start thread pool-1-thread-2
12:47:37.840 INFO  com.worksap.company.TempTest - finish thread pool-1-thread-2
12:47:37.842 INFO  com.worksap.company.TempTest - Finish tasks
12:47:37.845 INFO  com.worksap.company.TempTest - finish thread pool-1-thread-1
java.lang.InterruptedException: sleep interrupted
	at java.lang.Thread.sleep(Native Method)
	at com.worksap.company.TempTest$1.call(TempTest.java:21)
	at com.worksap.company.TempTest$1.call(TempTest.java:16)
	at java.util.concurrent.FutureTask.run$$$capture(FutureTask.java:266)
	at java.util.concurrent.FutureTask.run(FutureTask.java)
	at java.util.concurrent.Executors$RunnableAdapter.call(Executors.java:511)
	at java.util.concurrent.FutureTask.run$$$capture(FutureTask.java:266)
	at java.util.concurrent.FutureTask.run(FutureTask.java)
	at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1142)
	at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:617)
	at java.lang.Thread.run(Thread.java:745)
*/
```

例子二：invokeAll(),到future.get时抛出异常
```java
public static void main(String[] args) {
    ExecutorService executorService = Executors.newCachedThreadPool();
    List<Callable<Long>> tasks = new LinkedList<>();
    tasks.add(new Callable<Long>() {
        @Override
        public Long call() {
            log.info("start thread " + Thread.currentThread().getName());
            try {
                Thread.sleep(5 * 1000);
            }
            catch (Exception e) {
                e.printStackTrace();
            }
            log.info("finish thread " + Thread.currentThread().getName());
            return Thread.currentThread().getId();
        }
    });

    tasks.add(new Callable<Long>() {
        @Override
        public Long call() {
            log.info("start thread " + Thread.currentThread().getName());
            try {
                Thread.sleep(2 * 1000);
            }
            catch (Exception e) {
                e.printStackTrace();
            }
            throw new RuntimeException("thread" + Thread.currentThread().getName() + " throws exception.");
        }
    });

    try {
        List<Future<Long>> futures = executorService.invokeAll(tasks);
        log.info("first future isDone " + futures.get(0).isDone());
        log.info("second future isDone " + futures.get(1).isDone());
        log.info("first future result " + futures.get(0).get());
        log.info("second future result " + futures.get(1).get());
    } catch (Exception e) {
        e.printStackTrace();
    }

    try {
        Thread.sleep(10 * 1000);
    } catch (Exception e) {
        e.printStackTrace();
    }
    executorService.shutdown();
}
```
输出：
```
15:22:27.548 INFO  com.worksap.company.TempTest - start thread pool-1-thread-1
15:22:27.554 INFO  com.worksap.company.TempTest - start thread pool-1-thread-2
15:22:32.553 INFO  com.worksap.company.TempTest - finish thread pool-1-thread-1
15:22:32.555 INFO  com.worksap.company.TempTest - first future isDone true
15:22:32.555 INFO  com.worksap.company.TempTest - second future isDone true
15:22:32.555 INFO  com.worksap.company.TempTest - first future result 12
java.util.concurrent.ExecutionException: java.lang.RuntimeException: threadpool-1-thread-2 throws exception.
	at java.util.concurrent.FutureTask.report(FutureTask.java:122)
	at java.util.concurrent.FutureTask.get(FutureTask.java:192)
	at com.worksap.company.TempTest.main(TempTest.java:51)
Caused by: java.lang.RuntimeException: threadpool-1-thread-2 throws exception.
	at com.worksap.company.TempTest$2.call(TempTest.java:42)
	at com.worksap.company.TempTest$2.call(TempTest.java:32)
	at java.util.concurrent.FutureTask.run$$$capture(FutureTask.java:266)
	at java.util.concurrent.FutureTask.run(FutureTask.java)
	at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1142)
	at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:617)
	at java.lang.Thread.run(Thread.java:745)
```

### Executors

Executors是一个工具类，类似于java.utils.collections，提供方法创建不同的线程池。

[java documents](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/Executors.html)

```java
//经常使用的方法有(不是全部)
static ExecutorService	newCachedThreadPool();
static ExecutorService	newCachedThreadPool(ThreadFactory threadFactory);
static ExecutorService	newFixedThreadPool(int nThreads);
static ExecutorService	newFixedThreadPool(int nThreads, ThreadFactory threadFactory);
static ExecutorService  newSingleThreadExecutor(ThreadFactory threadFactory);

static ScheduledExecutorService	newScheduledThreadPool(int corePoolSize);
static ScheduledExecutorService	newScheduledThreadPool(int corePoolSize, ThreadFactory threadFactory);
```

这些方法都带有一个ThreadFactory的重载方法，ThreadFactory是一个接口，指定线程池创建线程时的行为。
```java
public interface ThreadFactory{
    Thread newThread(Runnable r);
}
```
如果不指定ThreadFactory，默认使用DefaultThreadFactory构造线程，该类只是为线程简单设置了名字、是否守护线程和优先级。
```java
/**
* The default thread factory
*/
static class DefaultThreadFactory implements ThreadFactory {
    private static final AtomicInteger poolNumber = new AtomicInteger(1);
    private final ThreadGroup group;
    private final AtomicInteger threadNumber = new AtomicInteger(1);
    private final String namePrefix;

    DefaultThreadFactory() {
        SecurityManager s = System.getSecurityManager();
        group = (s != null) ? s.getThreadGroup() :
                              Thread.currentThread().getThreadGroup();
        namePrefix = "pool-" +
                      poolNumber.getAndIncrement() +
                     "-thread-";
    }

    public Thread newThread(Runnable r) {
        Thread t = new Thread(group, r,
                              namePrefix + threadNumber.getAndIncrement(),
                              0);
        if (t.isDaemon())
            t.setDaemon(false);
        if (t.getPriority() != Thread.NORM_PRIORITY)
            t.setPriority(Thread.NORM_PRIORITY);
        return t;
    }
}
```

**CachedThreadPool**

```java
/**
 * Creates a thread pool that creates new threads as needed, but
 * will reuse previously constructed threads when they are
 * available, and uses the provided
 * ThreadFactory to create new threads when needed.
 * @param threadFactory the factory to use when creating new threads
 * @return the newly created thread pool
 * @throws NullPointerException if threadFactory is null
 */
public static ExecutorService newCachedThreadPool(ThreadFactory threadFactory) {
    return new ThreadPoolExecutor(0, Integer.MAX_VALUE,
                                  60L, TimeUnit.SECONDS,
                                  new SynchronousQueue<Runnable>(),
                                  threadFactory);
}
```
1. 缓存型线程池，先使用线程池中能够重用的线程，如果没有再创建线程。
2. 线程池中线程有timeout，如果timeout后线程仍未被使用，线程将被终止并移除线程池，默认的timeout时间为60s。
3. 由于CachedThreadPool能够自行终止不用线程，因此适用于*生存期很短的异步任务*。


**FixedThreadPool**

```java
/**
 * Creates a thread pool that reuses a fixed number of threads
 * operating off a shared unbounded queue, using the provided
 * ThreadFactory to create new threads when needed.  At any point,
 * at most {@code nThreads} threads will be active processing
 * tasks.  If additional tasks are submitted when all threads are
 * active, they will wait in the queue until a thread is
 * available.  If any thread terminates due to a failure during
 * execution prior to shutdown, a new one will take its place if
 * needed to execute subsequent tasks.  The threads in the pool will
 * exist until it is explicitly {@link ExecutorService#shutdown
 * shutdown}.
 *
 * @param nThreads the number of threads in the pool
 * @param threadFactory the factory to use when creating new threads
 * @return the newly created thread pool
 * @throws NullPointerException if threadFactory is null
 * @throws IllegalArgumentException if {@code nThreads <= 0}
 */
public static ExecutorService newFixedThreadPool(int nThreads, ThreadFactory threadFactory) {
    return new ThreadPoolExecutor(nThreads, nThreads,
                                  0L, TimeUnit.MILLISECONDS,
                                  new LinkedBlockingQueue<Runnable>(),
                                  threadFactory);
}
```

1. 线程池的大小固定为nThreads。
2. 当线程池中没有可用的线程时，新提交的任务将在queue中等待。
3. 线程的timeout时间被设为0，也就是永远不会timeout。

**SingleThreadPool**

```java
/**
 * Creates an Executor that uses a single worker thread operating
 * off an unbounded queue, and uses the provided ThreadFactory to
 * create a new thread when needed. Unlike the otherwise
 * equivalent {@code newFixedThreadPool(1, threadFactory)} the
 * returned executor is guaranteed not to be reconfigurable to use
 * additional threads.
 *
 * @param threadFactory the factory to use when creating new
 * threads
 *
 * @return the newly created single-threaded Executor
 * @throws NullPointerException if threadFactory is null
 */
public static ExecutorService newSingleThreadExecutor(ThreadFactory threadFactory) {
    return new FinalizableDelegatedExecutorService
        (new ThreadPoolExecutor(1, 1,
                                0L, TimeUnit.MILLISECONDS,
                                new LinkedBlockingQueue<Runnable>(),
                                threadFactory));
}
```

SingleThreadPool和FixedThreadPool唯一的区别就是线程池的大小固定为1。


**CachedThreadPool, FixedThreadPool和SingleThreadPool低层的实现都是ThreadPoolExecutor，只是参数不同。**
**关于ThreadPoolExecutor请见**`ThreadPoolExecutor`。


**ScheduledThreadPool**

```java
/**
 * Creates a thread pool that can schedule commands to run after a
 * given delay, or to execute periodically.
 * @param corePoolSize the number of threads to keep in the pool,
 * even if they are idle
 * @param threadFactory the factory to use when the executor
 * creates a new thread
 * @return a newly created scheduled thread pool
 * @throws IllegalArgumentException if {@code corePoolSize < 0}
 * @throws NullPointerException if threadFactory is null
 */
public static ScheduledExecutorService newScheduledThreadPool(
        int corePoolSize, ThreadFactory threadFactory) {
    return new ScheduledThreadPoolExecutor(corePoolSize, threadFactory);
}

/**
 * Creates a new {@code ScheduledThreadPoolExecutor} with the
 * given initial parameters.
 *
 * @param corePoolSize the number of threads to keep in the pool, even
 *        if they are idle, unless {@code allowCoreThreadTimeOut} is set
 * @param threadFactory the factory to use when the executor
 *        creates a new thread
 * @throws IllegalArgumentException if {@code corePoolSize < 0}
 * @throws NullPointerException if {@code threadFactory} is null
 */
public ScheduledThreadPoolExecutor(int corePoolSize,
                                   ThreadFactory threadFactory) {
    super(corePoolSize, Integer.MAX_VALUE, 0, NANOSECONDS,
          new DelayedWorkQueue(), threadFactory);
}
```

得到的ScheduledExecutorService：
```java
public Interface ScheduledExecutorService{

    //经过delay时间开始执行。
    <V> ScheduledFuture<V> schedule(Callable<V> callable, long delay, TimeUnit unit);

    ScheduledFuture<?> schedule(Runnable command, long delay, TimeUnit unit);

    //经过initialDelay时间后，每个period执行一次，如果上一个还没有完成，则等待上一个完成再执行。两个开始时间的间隔为period。
    ScheduledFuture<?> scheduleAtFixedRate(Runnable command, long initialDelay, long period, TimeUnit unit);
    
    //经过initialDelay时间后，上一个结束后，经过delay时间执行下一个。上一个任务结束和下一个任务开始间隔为delay。
    ScheduledFuture<?> scheduleWithFixedDelay(Runnable command, long initialDelay, long delay, TimeUnit unit);
}
```


### CompletionService

通过ExecutorService提交一组任务，希望在任务完成后得到结果，一种方法是保留提交得到的Future，并反复轮询判断是否有任务完成，另一种方法是通过invokeAll或invokeAny，但是invokeAll需要阻塞知道所有任务完成，invokeAny只能得到一个任务完成的结果，都不是一个比较好的方法。

JDK5.0中提出了CompletionService，将Executor和BlockingQueue结合，生产者向CompletionService提交任务，CompletionService将完成的任务结果根据完成顺序放入BlockingQueue中，消费者依次从BlockingQueue中拿出结果。ExecutorCompletionService是CompletionService的一个实现。
```java
public interface CompletionService<V> {
    //从BlockingQueue中拿取一个完成的future，如果没有则返回null，非阻塞。
    Future<V> poll();
    //从BlockingQueue中拿取一个完成的future，等待timeout时间。
    Future<V> poll(long timeout, TimeUnit timeUnit) throws InterruptedException;   
    //同ExecutorService
    Future<V> submit(Callable<V> task);
    //同ExecutorService
    Future<V> submit(Runnable task, V result);
    //从BlockingQueue中拿取一个完成的future，如果没有则等待，阻塞。
    Future<V> take() throws InterruptedException;
}
```

为了解决执行服务的声明周期问题，ExecutorService扩展了Executor接口，添加了一些用于声明周期管理的方法。

Timer -> ScheduledThreadPoolExecutor

DelayQueue

Future的生命周期，在Future规范中包含的含义是任务的声明周期只能前进，不能后退。

CompletionService:Executor+BlockingQueue
 
```
本文地址：https://cheng-dp.github.io/2018/11/05/executor-executor-service-executors/
```
 
