---
layout: post
title: Java线程池框架ThreadPoolExecutor实现分析
categories: [Java, Java多线程]
description: Java线程池框架ThreadPoolExecutor实现分析
keywords: Java, Java多线程
---

### 线程池类图

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/ThreadPoolUML.png)

- Executor接口只定义了一个方法`void execute(Runnable command)`.
- ExecutorService接口继承了Executor接口并定义了submit()/shutdown()/invokeAll()/invokeAny()方法。
- AbstractExecutorService类是抽象类，实现了ExecutorService接口，提供了ExecutorService方法的实现。
```java
//AbstractExecutorService中submit方法的实现
public <T> Future<T> submit(Callable<T> task) {
    if (task == null) throw new NullPointerException();
    RunnableFuture<T> ftask = newTaskFor(task);
    execute(ftask);
    return ftask;
}

//runnable会在newTaskFor中被包装为一个返回null值的callable。
public <T> Future<T> submit(Runnable task, T result) {
    if (task == null) throw new NullPointerException();
    RunnableFuture<T> ftask = newTaskFor(task, result);
    execute(ftask);
    return ftask;
}
```
- ThreadPoolExecutor继承了AbstractExecutorService，实现了execute方法，还提供了细致管理线程池的具体方法。
- Executors.newCachedThreadPool/newSingleThreadPool/newFixedThreadPool都是ThreadPoolExecutor。

### 任务提交运行的流程：
1. 创建runnable或callable。
2. executor.submit(runnable/callable)，submit中newTaskFor方法会创建并返回FutureTask(实现了RunnableFuture接口)，FutureTask中runnable会被封装为返回值为null的callable。
3. submit方法调用ThreadPoolExecutor中实现的execute方法，分配线程池中的线程调用FutureTask的run方法运行任务。
4. FutureTask的run方法会调用其中的callable.call或runnable.run得到运行结果并保存在FutureTask中。
5. executor.submit方法最终返回该FutureTask，用户调用FutureTask.get等待并得到其中的运行结果。

### ThreadPoolExecutor实现

##### 构造函数

```java
public ThreadPoolExecutor(int corePoolSize,
                          int maximumPoolSize,
                          long keepAliveTime,
                          TimeUnit unit,
                          BlockingQueue<Runnable> workQueue,
                          ThreadFactory threadFactory) {
    this(corePoolSize, maximumPoolSize, keepAliveTime, unit, workQueue,
         threadFactory, defaultHandler);
```

参数分析：

1. corePoolSize

线程池中一直存活着的最小线程数量，这些一直存活着的线程又被称为核心线程。

2. maximumPoolSize

线程池内能够容纳的最大线程数。  
如果提供的阻塞队列(workQueue)是无界队列，那么maximumPoolSize将失去意义。

```
当通过execute提交新任务到线程池，如果RUNNING状态的线程数量少于corePoolSize，即使有一些非核心线程处于空闲状态，系统也会创建一个新的线程来处理新任务，直到RUNNING状态的线程数量大于corePoolSize。

如果处于RUNNING状态的线程数量大于corePoolSize小于maximumPoolSize，系统将去判断workQueue是否还有空，如果未满，将该任务加入队列，如果已满，才会创建一个新线程执行该任务。
```

3. keepAliveTime

keepAliveTime表示空闲线程处于等待状态的超时时间。当总线程数大于corePoolSize时，非核心线程进入空闲状态等待的时间大于keepAliveTime时，会停止工作。除非allowCoreThreadTimeOut设置为true，否则核心线程即使超时也不会被terinate。

4. workQueue

workQueue 是一个用于保存等待执行的任务Runnable的阻塞队列。当提交一个新的任务到线程池以后, 线程池会根据当前池子中正在运行着的线程的数量, 指定出对该任务相应的处理方式, 主要有以下几种处理方式: 
```
- 如果线程池中正在运行的线程数少于核心线程数, 那么线程池总是倾向于创建一个新线程来执行该任务, 而不是将该任务提交到该队列 workQueue 中进行等待. 
- 如果线程池中正在运行的线程数不少于核心线程数, 那么线程池总是倾向于将该任务先提交到队列 workQueue 中先让其等待, 而不是创建一个新线程来执行该任务. 
- 如果线程池中正在运行的线程数不少于核心线程数, 并且线程池中的阻塞队列也满了使得该任务入队失败, 那么线程池会去判断当前池子中运行的线程数是否已经等于了该线程池允许运行的最大线程数 maximumPoolSize. 
- 如果发现已经等于了, 说明池子已满, 无法再继续创建新的线程了, 那么就会拒绝执行该任务. 如果发现运行的线程数小于池子允许的最大线程数, 那么就会创建一个线程(这里创建的线程是非核心线程)来执行该任务.
```

5. threadFactory

threadFactory 线程工厂, ThreadPoolExecutor使用该工厂创建线程。自定义线程工厂可以设置线程的特定名字、优先级等。

6. handler

当提交任务失败(线程池已处于SHUTDOWN状态、没有可用线程且队列已满)时，handler的rejectedExecutor会被调用。

ThreadPoolExecutor预定义了几个handler:

```
- AbortPolicy

直接抛出异常。

- CallerRunsPolicy

新提交的任务放在调用execute所在的线程执行。

- DiscardPolicy

不执行新提交的任务。

- DiscardOldestPolicy

线程池已经关闭 (SHUTDOWN) 时, 就不执行这个任务了, 这也是 DiscardPolicy 的处理方式.   
线程池未关闭时, 会将阻塞队列中处于队首 (head) 的那个任务从队列中移除, 然后再将这个新提交的任务加入到该阻塞队列的队尾 (tail) 等待执行.
```

##### Executors中预定义的线程池

Executors.newCachedThreadPool()/newFixedThreadPool()/newSingleThreadExecutor()返回的都是经由指定参数构造的ThreadPoolExecutor。

1. CachedThreadPool

CachedThreadPool定义的corePoolSize为0，maximumPoolSize为MAX_VALUE，使用SynchronousQueue作为workQueue，也就是没有限制线程数量，每个新提交的任务如果没有空闲线程，都需要等待创建一个新线程执行。
```java
//newCachedThreadPool
public static ExecutorService newCachedThreadPool(ThreadFactory threadFactory) {
    return new ThreadPoolExecutor(0, Integer.MAX_VALUE,
                                  60L, TimeUnit.SECONDS,
                                  new SynchronousQueue<Runnable>(),
                                  threadFactory);
}
```

SingleThreadPool定义的corePoolSize和maximumPoolSize都为1，也就是固定线程池中只有一个线程。新提交的任务需要在LinkedBlockingQueue中排队等待。
```java
//newSingleThreadExecutor
public static ExecutorService newSingleThreadExecutor(ThreadFactory threadFactory) {
    return new FinalizableDelegatedExecutorService
        (new ThreadPoolExecutor(1, 1,
                                0L, TimeUnit.MILLISECONDS,
                                new LinkedBlockingQueue<Runnable>(),
                                threadFactory));
}
```

FixedThreadPool定义的corePoolSize和maximumPoolSize相等，也就是线程池中线程数量是恒定的。没有线程空闲时同样需要在LinkedBlockingQueue中排队。
```java
//newFixedThreadPool
public static ExecutorService newFixedThreadPool(int nThreads, ThreadFactory threadFactory) {
    return new ThreadPoolExecutor(nThreads, nThreads,
                                  0L, TimeUnit.MILLISECONDS,
                                  new LinkedBlockingQueue<Runnable>(),
                                  threadFactory);
}
```

##### 扩展ThreadPoolExecutor

ThreadPoolExecutor提供了几个可以在子类化中改写的行为:beforeExecutor, afterExecutor, terminated.

在任务执行前后将调用beforeExecutor和afterExecutor,在这些方法中可以添加日志、计时、统计信息等功能。无论任务是从run中正常返回，还是抛出一个异常返回，afterExecute都会被调用。(如果任务在完成后带有一个Error,afterExecutor不会被调用)，如果beforeExecutor抛出RuntimeExeception,任务将不被执行，afterExecutor也不会被调用。  

在线程池完成关闭操作时调用terminated,也就是在所有任务都已经完成且所有工作者线程都关闭后。

### 实现分析

##### 重要的域

```java
    private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));

    private final BlockingQueue<Runnable> workQueue;

    private final HashSet<Worker> workers = new HashSet<Worker>();

    //构造函数中涉及的域
    private volatile ThreadFactory threadFactory;
    private volatile RejectedExecutionHandler handler;
    private volatile long keepAliveTime;
    private volatile int corePoolSize;
    private volatile int maximumPoolSize;

```
1. ctl的高三位表示线程池的运行状态，低29位表示线程池内有效线程的数量。
线程池的运行状态：
```
//COUNT_BITS = 29
//rs < SHUTDOWN表示线程池处于RUNNING状态
private static final int RUNNING    = -1 << COUNT_BITS;
private static final int SHUTDOWN   =  0 << COUNT_BITS;
private static final int STOP       =  1 << COUNT_BITS;
private static final int TIDYING    =  2 << COUNT_BITS;
private static final int TERMINATED =  3 << COUNT_BITS;
```

2. workQueue为Runnable任务阻塞队列。

3. workers为表示工作线程Worker的集合，Worker为ThreadPoolExecutor的一个内部类，构造如下：
```java
private final class Worker
    extends AbstractQueuedSynchronizer
    implements Runnable
{

    private static final long serialVersionUID = 6138294804551838833L;

    //该worker对应的工作线程
    final Thread thread;
    
    //该worker第一个执行的任务
    Runnable firstTask;
    
    //该worker已经完成的任务数目
    volatile long completedTasks;

    Worker(Runnable firstTask) {
        setState(-1); // inhibit interrupts until runWorker
        this.firstTask = firstTask;
        this.thread = getThreadFactory().newThread(this);
    }

    /** Delegates main run loop to outer runWorker  */
    public void run() {
        runWorker(this);
    }

    //...
}
```

#### 运行分析

ThreadPoolExecutor调用**execute**提交并运行任务。

1. 有效线程数 < corePoolSize, 创建并启动一个线程来执行新提交的任务. 
2. 有效线程数 >= corePoolSize, 且workQueue阻塞队列未满, 将新提交的任务加入到该阻塞队列中. 
3. 有效线程数 >= corePoolSize &f& < maximumPoolSize, workQueue阻塞队列已满, 创建并启动一个线程来执行新提交的任务. 
4. 有效线程数 > maximumPoolSize, workQueue阻塞队列已满, 让 RejectedExecutionHandler 根据它的拒绝策略来处理该任务, 默认的处理方式是直接抛异常(AbortPolicy).

```java
public void execute(Runnable command) {
    if (command == null)
        throw new NullPointerException();

    // 获取ctl的值.
    int c = ctl.get();


    /********************************* 情况1 ************************************/

    // 根据ctl的值, 获取线程池中的有效线程数 workerCount, 如果 workerCount
    // 小于核心线程数 corePoolSize
    if (workerCountOf(c) < corePoolSize) {

        // 调用addWorker()方法, 将核心线程数corePoolSize设置为线程池中线程
        // 数的上限值, 将此次提交的任务command作为参数传递进去, 然后再次获取
        // 线程池中的有效线程数 workerCount, 如果 workerCount依然小于核心
        // 线程数 corePoolSize, 就创建并启动一个线程, 然后返回 true结束整个
        // execute()方法. 如果此时的线程池已经关闭, 或者此时再次获取到的有
        // 效线程数 workerCount已经 >= 核心线程数 corePoolSize, 就再继续执
        // 行后边的内容. 
        if (addWorker(command, true))
            return;

        // 再次获取 ctl的值
        c = ctl.get();
    }

    /***** 分析1 ****/
    // 如果情况1的判断条件不满足, 则直接进入情况2. 如果情况1的判断条件满足, 
    // 但情况1中的 addWorker()方法返回 false, 也同样会进入情况2.  
    // 总之, 进入情况2时, 线程池要么已经不处于RUNNING(运行)状态, 要么仍处于RUNNING
    // (运行)状态但线程池内的有效线程数 workerCount >= 核心线程数 corePoolSize


    /********************************* 情况2 ************************************/

    /***** 分析2 ****/
    // 经过上一段分析可知, 进入这个情况时, 线程池要么已经不处于RUNNING(运行)
    // 状态, 要么仍处于RUNNING(运行)状态但线程池内的有效线程数 workerCount
    // 已经 >= 核心线程数 corePoolSize

    // 如果线程池未处于RUNNING(运行)状态, 或者虽然处于RUNNING(运行)状态但线程池
    // 内的阻塞队列 workQueue已满, 则跳过此情况直接进入情况3.
    // 如果线程池处于RUNNING(运行)状态并且线程池内的阻塞队列 workQueue未满, 
    // 则将提交的任务 command 添加到阻塞队列 workQueue中.
    if (isRunning(c) && workQueue.offer(command)) {
        // 再次获取 ctl的值.
        int recheck = ctl.get();

        // 再次判断线程池此时的运行状态. 如果发现线程池未处于 RUNNING(运行)
        // 状态, 由于先前已将任务 command加入到阻塞队列 workQueue中了, 所以需
        // 要将该任务从 workQueue中移除. 一般来说, 该移除操作都能顺利进行. 
        // 所以一旦移除成功, 就再调用 handler的 rejectedExecution()方法, 根据
        // 该 handler定义的拒绝策略, 对该任务进行处理. 当然, 默认的拒绝策略是
        // AbortPolicy, 也就是直接抛出 RejectedExecutionException 异常, 同时也
        // 结束了整个 execute()方法的执行.
        if (! isRunning(recheck) && remove(command))
            reject(command);

        // 再次计算线程池内的有效线程数 workerCount, 一旦发现该数量变为0, 
        // 就将线程池内的线程数上限值设置为最大线程数 maximumPoolSize, 然后
        // 只是创建一个线程而不去启动它, 并结束整个 execute()方法的执行.
        else if (workerCountOf(recheck) == 0)
            addWorker(null, false);

        // 如果线程池处于 RUNNING(运行)状态并且线程池内的有效线程数大于0, 那么就直接结束该 
        // execute()方法, 被添加到阻塞队列中的该任务将会在未来的某个时刻被执行.
    }


    /********************************* 情况3 ************************************/

    /***** 分析3 ****/
    // 如果该方法能够执行到这里, 那么结合分析1和分析2可知, 线程池此时必定是
    // 下面两种情况中的一种:
    // ① 已经不处于RUNNING(运行)状态
    // ② 处于RUNNING(运行)状态, 并且线程池内的有效线程数 workerCount已经
    //   >= 核心线程数 corePoolSize, 并且线程池内的阻塞队列 workQueue已满

    // 再次执行addWorker() 方法, 将线程池内的线程数上限值设置为最大线程数 
    // maximumPoolSize, 并将提交的任务 command作为被执行的对象, 尝试创建并
    // 启动一个线程来执行该任务. 如果此时线程池的状态为如下两种中的一种, 
    // 就会触发 handler的 rejectedExecution()方法来拒绝该任务的执行:
    // ① 未处于RUNNING(运行)状态.
    // ② 处于RUNNING(运行)状态, 但线程池内的有效线程数已达到本次设定的最大
    // 线程数 (另外根据分析3可知, 此时线程池内的阻塞队列 workQueue已满).
    //
    // 如果线程池处于 RUNNING(运行)状态, 但有效线程数还未达到本次设定的最大
    // 线程数, 那么就会尝试创建并启动一个线程来执行任务 command. 如果线程的
    // 创建和启动都很顺利, 那么就直接结束掉该 execute()方法; 如果线程的创建或
    // 启动失败, 则同样会触发 handler的 rejectedExecution()方法来拒绝该
    // 任务的执行并结束掉该 execute()方法.
    else if (!addWorker(command, false))
        reject(command);
}
```

execute调用addWorker方法创建线程和执行任务。

**addWorker**方法更新workerCount有效线程计数，根据传入firstTask创建Worker新建线程并启动。

```java
private boolean addWorker(Runnable firstTask, boolean core) {

    // retry 是个无限循环. 当线程池处于 RUNNING (运行)状态时, 只有在线程池中
    // 的有效线程数被成功加一以后, 才会退出该循环而去执行后边的代码. 也就是说,
    // 当线程池在 RUNNING (运行)状态下退出该 retry 循环时, 线程池中的有效线程数
    // 一定少于此次设定的最大线程数(可能是 corePoolSize 或 maximumPoolSize).
    retry:
    for (;;) {
        int c = ctl.get();
        int rs = runStateOf(c);

        // 线程池满足如下条件中的任意一种时, 就会直接结束该方法, 并且返回 false
        // 表示没有创建新线程, 新提交的任务也没有被执行.
        // ① 处于 STOP, TYDING 或 TERMINATD 状态
        // ② 处于 SHUTDOWN 状态, 并且参数 firstTask != null
        // ③ 处于 SHUTDOWN 状态, 并且阻塞队列 workQueue为空

        // Check if queue empty only if necessary.
        if (rs >= SHUTDOWN &&
            ! (rs == SHUTDOWN &&
               firstTask == null &&
               ! workQueue.isEmpty()))
            return false;

        for (;;) {
            int wc = workerCountOf(c);

            // 如果线程池内的有效线程数大于或等于了理论上的最大容量 CAPACITY 或者实际
            // 设定的最大容量, 就返回 false直接结束该方法. 这样同样没有创建新线程, 
            // 新提交的任务也同样未被执行.
            // (core ? corePoolSize : maximumPoolSize) 表示如果 core为 true,
            // 那么实际设定的最大容量为 corePoolSize, 反之则为 maximumPoolSize.
            if (wc >= CAPACITY ||
                wc >= (core ? corePoolSize : maximumPoolSize))
                return false;

            // 有效线程数加一
            if (compareAndIncrementWorkerCount(c))
                break retry;
            c = ctl.get();  // Re-read ctl
            if (runStateOf(c) != rs)
                continue retry;
            // else CAS failed due to workerCount change; retry inner loop
        }
    }

    boolean workerStarted = false;
    boolean workerAdded = false;
    Worker w = null;
    try {
        // 根据参数 firstTask来创建 Worker对象 w.
        w = new Worker(firstTask);
        // 用 w创建线程对象 t.
        final Thread t = w.thread;
        if (t != null) {
            final ReentrantLock mainLock = this.mainLock;
            mainLock.lock();
            try {
                // Recheck while holding lock.
                // Back out on ThreadFactory failure or if
                // shut down before lock acquired.
                int rs = runStateOf(ctl.get());

                if (rs < SHUTDOWN ||
                    (rs == SHUTDOWN && firstTask == null)) {
                    if (t.isAlive()) // precheck that t is startable
                        throw new IllegalThreadStateException();
                    workers.add(w);
                    int s = workers.size();
                    if (s > largestPoolSize)
                        largestPoolSize = s;
                    workerAdded = true;
                }
            } finally {
                mainLock.unlock();
            }
            if (workerAdded) {

                // 启动线程 t. 由于 t指向 w.thread所引用的对象, 所以相当于启动的是 w.thread所引用的线程对象.
                // 而 w是 Runnable 的实现类, w.thread 是以 w作为 Runnable参数所创建的一个线程对象, 所以启动
                // w.thread所引用的线程对象, 也就是要执行 w 的 run()方法.            
                t.start();
                workerStarted = true;
            }
        }
    } finally {
        if (! workerStarted)
            addWorkerFailed(w);
    }
    return workerStarted;
}
```
addWorker中调用t.start()启动worker对应的线程，而在worker构造时有：
```java
Worker(Runnable firstTask) {
    setState(-1); // inhibit interrupts until runWorker
    this.firstTask = firstTask;
    this.thread = getThreadFactory().newThread(this);
}

/** Delegates main run loop to outer runWorker  */
public void run() {
    runWorker(this);
}
```
newThread将this作为参数传入，也就是thread会调用worker的run方法，最终调用外层的**runWorker**方法。

runWorker方法中如果firstTask不为null则执行firstTask，如果firstTask为null则循环调用getTask从workQueue中取出队头任务并执行。

```java
final void runWorker(Worker w) {
    Thread wt = Thread.currentThread();
    Runnable task = w.firstTask;
    w.firstTask = null;
    w.unlock(); // allow interrupts
    boolean completedAbruptly = true;
    try {
        // 由前边可知, task 就是 w.firstTask
        // 如果 task为 null, 那么就不进入该 while循环, 也就不运行该 task. 如果    
        // task不为 null, 那么就执行 getTask()方法. 而getTask()方法是个无限
        // 循环, 会从阻塞队列 workQueue中不断取出任务来执行. 当阻塞队列 workQueue
        // 中所有的任务都被取完之后, 就结束下面的while循环.
        while (task != null || (task = getTask()) != null) {
            w.lock();
            // If pool is stopping, ensure thread is interrupted;
            // if not, ensure thread is not interrupted.  This
            // requires a recheck in second case to deal with
            // shutdownNow race while clearing interrupt
            if ((runStateAtLeast(ctl.get(), STOP) ||
                 (Thread.interrupted() &&
                  runStateAtLeast(ctl.get(), STOP))) &&
                !wt.isInterrupted())
                wt.interrupt();
            try {
                beforeExecute(wt, task);
                Throwable thrown = null;
                try {
                    // 执行从阻塞队列 workQueue中取出的任务.
                    task.run();
                } catch (RuntimeException x) {
                    thrown = x; throw x;
                } catch (Error x) {
                    thrown = x; throw x;
                } catch (Throwable x) {
                    thrown = x; throw new Error(x);
                } finally {
                    afterExecute(task, thrown);
                }
            } finally {
                // 将 task 置为 null, 这样使得 while循环是否继续执行的判断, 就只能依赖于判断
                // 第二个条件, 也就是 (task = getTask()) != null 这个条件, 是否满足.
                task = null;
                w.completedTasks++;
                w.unlock();
            }
        }
        completedAbruptly = false;
    } finally {
        processWorkerExit(w, completedAbruptly);
    }
}
```

### 总结

ThreadPoolExecutor提供了==线程池执行的框==架，其中通过若干域控制了线程池大小和任务执行表现。ThreadPoolExecutor内部维护一个worker集合，并定义了一个内部类Worker表示运行线程，并且维护了一个任务队列workQueue。execute提交新任务时，ThreadPoolExecutor会根据线程池大小和任务队列情况决定是空闲线程运行、加入阻塞队列还是新建线程运行。

### REFS

- https://blog.csdn.net/cleverGump/article/details/50688008