---
layout: post
title: Java Collection类
categories: [Java]
description: Java Collection类
keywords: Java
---
![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/JavaCollection.jpeg)


1. Arraylist与LinkedList区别:  
ArrayList基于数组实现，LinkedList基于双向链表，并且表头指向表尾。
2. ArrayList与Vector区别：
1. Vector的方法都是同步的(Synchronized),是线程安全的(thread-safe)，而ArrayList的方法不是，由于线程的同步必然要影响性能，因此,ArrayList的性能比Vector好。 
2. 当Vector或ArrayList中的元素超过它的初始大小时,Vector会将它的容量翻倍,而ArrayList只增加50%的大小，这样,ArrayList就有利于节约内存空间。
3. HashSet和HashMap区别：  
HashSet是直接基于HashMap实现的，只使用了HashMap的key。
4. List、Set、Map是否都继承自Collection接口？  
List, Set是继承自Collection, Map不是。


### ListIterator接口

```java
public interface ListIterator<AnyType> extends Iterator<AnyType> {
boolean hasPrevious();
AnyType previous();

void add(AnyType x);
void set(AnyType newVal);
}
```
