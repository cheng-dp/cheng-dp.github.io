---
layout: post
title: Runnable, Callable, Future和FutureTask
categories: [Java, Java多线程]
description: Runnable, Callable, Future和FutureTask
keywords: Java, Java多线程
---

#### Runnable和Callable

```java
public interface Runnable {
public abstract void run();
}

public interface Callable<V> {
/**
* Computes a result, or throws an exception if unable to do so.
*
* @return computed result
* @throws Exception if unable to compute a result
*/
V call() throws Exception;
}
```
Runnable和Callable的显著区别是runnable没有返回值，而callable是一个泛型接口，返回的类型就是泛型传递进来的类型。

ExecutorService有三个submit重载方法，Callable通常配合ExecutorService使用：
```java
<T> Future<T> submit(Callable<T> task);
<T> Future<T> submit(Runnable task, T result);
Future<?> submit(Runnable task);
```

#### Future
Future也是一个接口，目的是对于具体的Runnable或者Callable任务的执行结果进行取消、查询是否完成、获取结果，通过get方法获取执行结果，该方法会阻塞知道任务返回、异常、超时或者中断。
```java
public interface Future<V> {
boolean cancel(boolean mayInterruptIfRunning);
boolean isCancelled();
boolean isDone();
V get() throws InterruptedException, ExecutionException;
V get(long timeout, TimeUnit unit)
throws InterruptedException, ExecutionException, TimeoutException;
}
```
下面详细说下cancel方法。

```
From document:
Attempts to cancel execution of this task. This attempt will fail if the task has already completed, has already been cancelled, or could not be cancelled for some other reason. If successful, and this task has not started when cancel is called, this task should never run. If the task has already started, then the mayInterruptIfRunning parameter determines whether the thread executing this task should be interrupted in an attempt to stop the task.

After this method returns, subsequent calls to isDone() will always return true. Subsequent calls to isCancelled() will always return true if this method returned true.
```
仔细看文档，我们可以总结出以下几点：
1. 如果任务已经完成、或者已经被取消，cancel方法返回false。  
2. 如果任务还没开始，cancel方法返回true。  
3. 如果任务正在执行，mayInterruptIfRunning为false时，返回false，mayInterruptIfRunning为true时，返回true。
4. 对于正在执行的任务，mayInterruptIfRunning为true时，cancel方法只是标记了中断位，并不能保证中断正在执行的线程，具体需要参考中断的实现机制。

文档第二段规定，调用cancel方法后，isCancelled方法必须和cancel方法的返回值一致，并且不论cancel方法的返回值是什么，isDone方法都会返回true。从上述规定，我们可以总结出cancel方法的一些设计思想：
1. 如果cancel方法返回true，表示future已经被cancel，所以isCancelled() == true
2. 如果cancel方法返回false，表示task已经结束，但是不是由于该cancel方法
3. cancel(false)的意思是，当task正在执行时不应该尝试取消该task，该任务还会继续执行但是对应的future已经被取消。
4. cancel(true)的意思是，当task正在执行时，要尝试取消该task，不管取消是否成功，对应的future都已经被取消。
在理解以上几点时要注意区分task和future，future只是task的结果。


#### FutureTask

```java
public class FutureTask<V> implements RunnableFuture<V>

public interface RunnableFuture<V> extends Runnable, Future<V> {
void run();
}
```
RunnableFuture继承了Runnable和Future接口，而FutureTask实现了RunnableFuture接口，所以它既可以作为Runnable被线程执行，又可以作为Future得到Callable的返回值。

FutureTask提供了两个构造函数
```java
//作为callable的返回值。
public FutureTask(Callable<V> callable) {
}

//作为Runnable被执行，如果执行成功，future.get()将返回result。
public FutureTask(Runnable runnable, V result) {
}
```

栗子：
```java
public static void main(String[] args) {
FutureTask<String> futureTask = new FutureTask<>(new Callable<String>() {
@Override
public String call() throws Exception {
try {
System.out.println("Trying to get the result");
Thread.sleep(10 * 1000);
} catch (InterruptedException e) {
e.printStackTrace();
}
return "I am the result";
}
});
ExecutorService executorService = Executors.newCachedThreadPool();
executorService.submit(futureTask);
executorService.shutdown();
System.out.println("future isDone=" + Boolean.toString(futureTask.isDone()));
System.out.println("future isCancelled=" + Boolean.toString(futureTask.isCancelled()));
System.out.println("cancel the task");
futureTask.cancel(true);
System.out.println("future isDone=" + Boolean.toString(futureTask.isDone()));
System.out.println("future isCancelled=" + Boolean.toString(futureTask.isCancelled()));

try {
Thread.sleep(20 * 1000);
} catch (Exception e) {
e.printStackTrace();
}
}
```

输出:

```
future isDone=false
future isCancelled=false
cancel the task
future isDone=true
future isCancelled=true
java.lang.InterruptedException: sleep interrupted
at java.lang.Thread.sleep(Native Method)
at com.worksap.company.TempTest$1.call(TempTest.java:14)
at com.worksap.company.TempTest$1.call(TempTest.java:10)
at java.util.concurrent.FutureTask.run$$$capture(FutureTask.java:266)
at java.util.concurrent.FutureTask.run(FutureTask.java)
at java.util.concurrent.Executors$RunnableAdapter.call(Executors.java:511)
at java.util.concurrent.FutureTask.run$$$capture(FutureTask.java:266)
at java.util.concurrent.FutureTask.run(FutureTask.java)
at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1142)
at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:617)
at java.lang.Thread.run(Thread.java:745)
```
