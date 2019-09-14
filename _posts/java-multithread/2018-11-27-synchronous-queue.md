---
layout: post
title: SynchronousQueue实现
categories: [Java, Java多线程]
description: SynchronousQueue实现
keywords: Java, Java多线程
---


### 基础

SynchronousQueue也是一个队列，但是该队列内部没有容器。生产线程put数据时，如果没有其他消费线程take，生产线程将阻塞，直到消费线程到来才会唤醒该生产线程。同样消费线程take时，也需要有生产线程同时put数据。这样一个过程称为一次配对。可以认为这是一种线程与线程间一对一传递消息的模型。

```java
public class SynchronousQueueDemo {
    public static void main(String[] args) throws InterruptedException {
        final SynchronousQueue<Integer> queue = new SynchronousQueue<Integer>();

        Thread putThread = new Thread(new Runnable() {
            @Override
            public void run() {
                System.out.println("put thread start");
                try {
                    queue.put(1);
                } catch (InterruptedException e) {
                }
                System.out.println("put thread end");
            }
        });

        Thread takeThread = new Thread(new Runnable() {
            @Override
            public void run() {
                System.out.println("take thread start");
                try {
                    System.out.println("take from putThread: " + queue.take());
                } catch (InterruptedException e) {
                }
                System.out.println("take thread end");
            }
        });

        putThread.start();
        Thread.sleep(1000);
        takeThread.start();
    }
}
```
输出
```java
put thread start
take thread start
take from putThread: 1
put thread end
take thread end
```

### 实现原理

公平模式：

公平模式下SynchronousQueue底层实现使用的是**TransferQueue这个内部队列**，它有一个head和tail指针，用于指向当前正在等待匹配的线程节点。 

等待配对的线程(如:put)将被添加至TransferQueue的队尾，当配对线程(如:take)来到时，队头线程出队并和配对线程交换数据。

非公平模式：

非公平模式下SynchronousQueue底层实现是**TransferStack栈**，等待配对的线程将逐个入栈，当配对线程来到时，会和栈顶线程尝试配对，如果成功则栈顶线程出栈。


### REFS

- https://blog.csdn.net/yanyan19880509/article/details/52562039