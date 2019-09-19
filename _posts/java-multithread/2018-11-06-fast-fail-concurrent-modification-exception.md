---
layout: post
title: fail-fast机制和ConcurrentModificationException
categories: [Java, Java多线程]
description: fail-fast机制和ConcurrentModificationException
keywords: Java, Java多线程
---

### 迭代器的fail-fast机制

fail-fast机制是JavaCollection和Map上的一种错误检测机制，由于迭代器的正常运行依赖于集合结构固定，因此，Java中设计了fail-fast机制防止在迭代器遍历时对集合结构的改变。

### modCount

modCount是fail-fast机制的实现。

集合(list, set, map)中含有一个modCount变量表示集合结构被修改的次数，add、remove等操作会对modCount增加一。

iterator中含有一个expectedModCount变量，该变量在iterator创建时初始化为集合modCount的值。

```
private class Itr implements Iterator<E> {
        
        //...
        int expectedModCount = ArrayList.this.modCount;
        //...
}
```

### ConcurrentModificationException

iterator.next()方法每次都会检查expectedModCount == modCount，如果不等，抛出ConcurrentModificationException.

```
private class Itr implements Iterator<E> {
        int cursor;
        int lastRet = -1;
        int expectedModCount = ArrayList.this.modCount;
 
        public boolean hasNext() {
            return (this.cursor != ArrayList.this.size);
        }
 
        public E next() {
            checkForComodification();
            /** 省略此处代码 */
        }
 
        public void remove() {
            if (this.lastRet < 0)
                throw new IllegalStateException();
            checkForComodification();
            /** 省略此处代码 */
        }
 
        final void checkForComodification() {
            if (ArrayList.this.modCount == this.expectedModCount)
                return;
            throw new ConcurrentModificationException();
        }
    }
}
```

### 单线程及多线程解决方案

#### 单线程环境

```java
public class Test {
    public static void main(String[] args)  {
        ArrayList<Integer> list = new ArrayList<Integer>();
        list.add(2);
        Iterator<Integer> iterator = list.iterator();
        while(iterator.hasNext()){
            Integer integer = iterator.next();
            if(integer==2)
                list.remove(integer);
        }
    }
}
//结果:
/*
Exception in thread "main" java.util.ConcurrentModificationException
	at java.util.ArrayList$Itr.checkForComodification(ArrayList.java:901)
	at java.util.ArrayList$Itr.next(ArrayList.java:851)
*/
```

#### 单线程环境解决方法

单线程环境中，在iterator遍历中，不能调用集合本身的add、remove方法。

iterator本身提供了一个remove方法删除上一个访问的元素，该方法会**首先设置expectedModCount = modCount**。

```java
public class Test {
    public static void main(String[] args)  {
        ArrayList<Integer> list = new ArrayList<Integer>();
        list.add(2);
        Iterator<Integer> iterator = list.iterator();
        while(iterator.hasNext()){
            Integer integer = iterator.next();
            if(integer==2)
                iterator.remove();   //注意这个地方
        }
    }
}
```

#### 多线程环境

```java
public class Test {
    static ArrayList<Integer> list = new ArrayList<Integer>();
    public static void main(String[] args)  {
        list.add(1);
        list.add(2);
        list.add(3);
        list.add(4);
        list.add(5);
        Thread thread1 = new Thread(){
            public void run() {
                Iterator<Integer> iterator = list.iterator();
                while(iterator.hasNext()){
                    Integer integer = iterator.next();
                    System.out.println(integer);
                    try {
                        Thread.sleep(100);
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                    }
                }
            };
        };
        Thread thread2 = new Thread(){
            public void run() {
                Iterator<Integer> iterator = list.iterator();
                while(iterator.hasNext()){
                    Integer integer = iterator.next();
                    if(integer==2)
                        iterator.remove(); 
                }
            };
        };
        thread1.start();
        thread2.start();
    }
}

//依然抛出ConcurrentModificationException
```

除了非线程安全的容器(ArrayList)，即使是线程安全的容器(同步容器类vector/HashTable)也会出这个问题。因为，**虽然Vector的方法采用了synchronized进行了同步，但是实际上通过Iterator访问的情况下，每个线程里面返回的是不同的iterator**，也即是说expectedModCount是每个线程私有。假若此时有2个线程，线程1在进行遍历，线程2在进行修改，那么很有可能导致线程2修改后导致Vector中的modCount自增了，线程2的expectedModCount也自增了，但是线程1的expectedModCount没有自增，此时线程1遍历时就会出现expectedModCount不等于modCount的情况了。

#### 多线程环境解决方法：
1. 每次使用iterator迭代时使用synchronized进行同步。
2. 使用并发容器CopyOnWriteArrayList代替ArrayList和Vector。

#### 为什么单线程下iterator.remove()是安全的 ?

Iterator是一个接口，其实现类只是在内部维护了一些状态变量，使得Iterator实现类能够通过Iterator的方式(如next(), hasNext())对容器进行遍历。

为了效率考量，直接对容器的操作并不会更新Iterator中维护的状态变量，会导致Iterator失效。

如，AbstractList中提供了ListIterator的实现类Iter，该类内部维护了cursor(当前遍历位置)及lastRet(上一个返回值的位置)，如果在Iterator遍历时调用list.remove()，此时iterator并不会对应调整其cursor，可能导致遍历的数据错误或丢失。

而单线程下通过iterator.remove()删除上一个遍历的数据，iterator对结构的改动是有感知的，会对应调整cursor的值，不会造成数据丢失。

```
//AbstractList中的Iter.remove()实现：

public void remove() {
    if (lastRet < 0)
        throw new IllegalStateException();
    checkForComodification();

    try {
        AbstractList.this.remove(lastRet);
        if (lastRet < cursor)
            cursor--; // 对应调整cursor值。
        lastRet = -1;
        expectedModCount = modCount;
    } catch (IndexOutOfBoundsException e) {
        throw new ConcurrentModificationException();
    }
}
```

#### 为什么iterator只提供remove方法没有add方法

因为iterator遍历的容器并不一定是有序的，如Set、Map.Entry就不是有序的，无法在特定位置进行add操作。

对于一些有序的容器，如List，在ListIterator接口中，是提供了add()方法的。



### REFS

- https://www.cnblogs.com/dolphin0520/p/3933551.html
 
```
本文地址：https://cheng-dp.github.io/2018/11/06/fast-fail-concurrent-modification-exception/
```
 
