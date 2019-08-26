---
layout: post
title: 乐观锁和CAS算法
categories: [Java, Java多线程]
description: 乐观锁和CAS算法
keywords: Java, Java多线程, CAS
---
#### 乐观锁和悲观锁

**悲观锁：**  
假定会发生并发冲突，屏蔽一切可能违反数据完整性的操作。

**乐观锁：**  
假定不会发生冲突，每次不加锁而是假设没有冲突去完成某项操作，==只是在提交操作时检查是否违反数据完整性==。如果因为冲突失败就重试，直到成功为止。

乐观锁，大多是基于数据版本（ Version ）记录机制实现。何谓数据版本？即为数据增加一个版本标识，在基于数据库表的版本解决方案中，一般是通过为数据库表增加一个 “version” 字段来实现。读取出数据时，将此版本号一同读出，之后更新时，对此版本号加一。此时，将提交数据的版本数据与数据库表对应记录的当前版本信息进行比对，如果提交的数据版本号大于数据库表当前版本号，则予以更新，否则认为是过期数据。


**悲观锁的缺点：**
1. 产生竞争时，线程被阻塞等待，无法做到线程实时响应。 
2. 申请和释放锁的操作增加了很多访问共享资源的消耗。
3. 无法避免出现死锁或者活锁的可能。
4. 如果一个优先级高的线程等待一个优先级低的线程释放锁会导致优先级倒置，引起性能风险。

**乐观锁的缺点：**  
==无法解决脏读问题==, 需要对应数据库至少为Read Commited[读已提交]的Isolation级别, 对不存在数据回滚的内存操作CAS没有影响。

#### CAS算法

CAS 操作包含三个操作数：内存位置（V）、预期原值（A）和新值(B)。如果内存位置的值与预期原值相匹配，如果相等，则证明共享数据没有被修改，替换成新值后继续运行；如果不相等，则证明共享数据已经被修改，放弃已经做的操作，重新执行刚才的操作。

容易看出 CAS 操作是基于共享数据不会被修改的假设，采用了类似于数据库的 commit-retry 的模式。当同步冲突出现的机会很少时，这种假设能带来较大的性能提升。

CAS 有效地说明了**我认为位置 V 应该包含值A；如果包含该值，则将B放到这个位置；否则，不要更改该位置，只告诉我这个位置现在的值即可。**

在JDK1.5之后，Java程序中才可以使用CAS操作，该操作由sun.misc.Unsafe类里面的compareAndSwapInt()和compareAndSwapLong()等几个方法包装提供，虚拟机在内部对这些方法做了特殊处理，**即时编译出来的结果就是一条平台相关的处理器CAS指令，没有方法调用的过程，或者可以认为是无条件内联进去了**。


#### ABA问题
==CAS算法的一大缺点是可能导致ABA问题==。ABA问题是指：

如果另一个线程修改V值，假设原来是A，先修改成B后又修改回A，当前线程的CAS操作无法分辨V是否变化。

例如：
```
现有一个用单向链表实现的堆栈A->B，栈顶为A，这时线程T1已经知道A.next为B，然后希望用CAS将栈顶替换为B：

head.compareAndSet(A,B);

在T1执行上面这条指令之前，线程T2介入，将A、B出栈，再pushD、C、A，而对象B此时处于游离状态。

此时轮到线程T1执行CAS操作，检测发现栈顶仍为A，所以CAS成功，栈顶变为B，但实际上B.next为null。

其中堆栈中只有B一个元素，C和D组成的链表不再存在于堆栈中，平白无故就把C、D丢掉了。
```

解决方法：在CAS操作时，带上版本号，每修改一次，版本号+1，之后比较原值的时候还要比较版本号。

#### Java中的CAS
Java最初被设计为一种安全的受控环境.尽管如此,Java HotSpot还是包含了一个“后门”,它提供了一些可以直接操控内存和线程的低层次操作.这个后门类就是**sun.misc.Unsafe**,它被JDK广泛用于自己的包中,如java.nio和java.util.concurrent.但是丝毫不建议在生产环境中使用这个后门，因此被命名为Unsafe。  

**sun.misc.Unsafe**提供了如下几种功能：
1. 对变量和数组内容的原子访问，自定义内存屏障
2. 对序列化的支持
3. 自定义内存管理/高效的内存布局
4. 与原生代码和其他JVM进行互操作
5. 对高级锁的支持

对CAS的支持就被包装在Unsafe包中，但是用户并不能直接进行调用，而是使用经用Unsafe实现的各个其他组件。

java.util.concurrent.atomic中的**AtomicXXX**，都使用了这些底层的JVM支持为数字类型的引用类型提供一种高效的CAS操作，而在java.util.concurrent中的大多数类在实现时都直接或间接的使用了这些原子变量类，这些原子变量都调用了 sun.misc.Unsafe 类库里面的 CAS算法，用CPU指令来实现无锁自增。

```java
//举例AtomicInteger
public class AtomicInteger extends Number implements java.io.Serializable {

private volatile int value;

public final int get() {
return value;
}

public final int getAndIncrement() {
for (;;) {
int current = get();
int next = current + 1;
if (compareAndSet(current, next))
return current;
}
}

public final boolean compareAndSet(int expect, int update) {
return unsafe.compareAndSwapInt(this, valueOffset, expect, update);
}

//...
```



refs:
1. https://blog.csdn.net/HEYUTAO007/article/details/19975665
2. https://blog.csdn.net/Roy_70/article/details/69799845
3. http://www.infoq.com/cn/articles/A-Post-Apocalyptic-sun.misc.Unsafe-World
4. https://www.cnblogs.com/Mainz/p/3546347.html
5. https://leokongwq.github.io/2016/12/31/java-magic-unsafe.html
