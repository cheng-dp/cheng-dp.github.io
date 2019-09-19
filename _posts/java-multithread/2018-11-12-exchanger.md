---
layout: post
title: Exchanger实现分析
categories: [Java, Java多线程]
description: Exchanger实现分析
keywords: Java, Java多线程
---


Exchanger用于进行线程间的数据交换，它提供一个同步点，在这个同步点，两个线程可以交换彼此的数据。这两个线程通过exchange 方法交换数据，如果第一个线程先执行exchange 方法，它会一直等待第二个线程也执行exchange 方法，当两个线程都到达同步点时，这两个线程就可以交换数据。

### 使用

```java
public class ExchangerDemo {

    static Exchanger<String>exchanger=new Exchanger<String>();
    static class Task implements Runnable{
        @Override
        public void run() {
            try {
                String result=exchanger.exchange(Thread.currentThread().getName());
                System.out.println("this is "+Thread.currentThread().getName()+" receive data:"+result);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }
    public static void main(String[] args)throws  Exception{

        Thread t1=new Thread(new Task(),"thread1");
        Thread t2=new Thread(new Task(),"thread2");
        t1.start();
        t2.start();
        t1.join();
        t2.join();
    }
}
```
输出：
```
this is thread1 receive data:thread2
this is thread2 receive data:thread1
```

### 实现分析

#### 基本构造

Exchanger算法的核心是通过一个slot交换数据，以及一个可以带有数据item的线程ThreadLocal参与者。
```java
//源码中的伪代码
for (;;) {
        if (slot is empty) { // offer
          place item in a Node;
          if (can CAS slot from empty to node) {
            wait for release;
            return matching item in node;
          }
        }
        else if (can CAS slot from node to empty) { // release
          get the item in node;
          set matching item in node;
          release waiting thread;
        }
        // else retry on CAS failure
      }
```

Exchanger中定义的重要成员变量：

```java
private final Participant participant;
private volatile Node[] arena;
private volatile Node slot;
```

Participant是ThreadLocal的，为线程保留其唯一的Node
```java
static final class Participant extends ThreadLocal<Node> {
    public Node initialValue() { return new Node(); }
}
```

Node是Exchanger的主要数据结构，记录了其对应的线程和交换的数据，以及在slot中的位置。
```java
@sun.misc.Contended static final class Node {
    int index;              //arena的下标(用于多槽位)
    int bound;              // 上一次记录的Exchanger.bound(用于多槽位)
    int collides;           // 在当前bound下CAS失败的次数(用于多槽位)
    int hash;               // 用于自旋
    Object item;            // 该线程需要交换的数据
    volatile Object match;  // 对方线程交换来的数据
    volatile Thread parked; // 线程
}
```

slot是Exchanger中的单个槽位，arena是Exchanger中的多个槽位数组，当没有竞争，Exchanger使用slot交换数据，当检测到竞争时，Exchanger会初始化并使用arena交换数据。

#### Exchange方法

1. 当arena为空时，调用slotExchange。
2. 当arena不为空或者slotExchange返回null，且Thread未被中断时，调用arenaExchange。
3. 返回交换的数据v。
```java
public V exchange(V x) throws InterruptedException {
    Object v;
    Object item = (x == null) ? NULL_ITEM : x; // translate null args
    if ((arena != null ||
         (v = slotExchange(item, false, 0L)) == null) &&
        ((Thread.interrupted() || // disambiguates null return
          (v = arenaExchange(item, false, 0L)) == null)))
        throw new InterruptedException();
    return (v == NULL_ITEM) ? null : (V)v;
}
```

#### slotExchange

1. participant中记录了线程对应的node。
2. 当slot不为null时，slot中的node属于对方线程，compareAndSwapObject尝试设置slot为null，如果成功则交换数据，并唤醒等待线程。
3. slot为null但arena不为null，表示使用多槽位模式，直接返回null，exchange会调用arenaExchange。
4. slot为null且arena为null，compareAndSwapObject设置slot为当前node，进入while循环等待，自旋若干时间后park阻塞。直至被唤醒且node中match得到交换的数据。

```java
private final Object slotExchange(Object item, boolean timed, long ns) {
    // 得到一个初始的Node
    Node p = participant.get();
    // 当前线程
    Thread t = Thread.currentThread();
    // 如果发生中断，返回null,会重设中断标志位，并没有直接抛异常
    if (t.isInterrupted()) // preserve interrupt status so caller can recheck
        return null;

    for (Node q;;) {
        // 槽位slot不为null,则说明已经有线程在这里等待交换数据了
        if ((q = slot) != null) {
            // 重置槽位
            if (U.compareAndSwapObject(this, SLOT, q, null)) {
                //获取交换的数据
                Object v = q.item;
                //将自身的数据交给slot中的等待线程。
                q.match = item;
                //等待线程
                Thread w = q.parked;
                //唤醒等待的线程
                if (w != null)
                    U.unpark(w);
                return v; // 返回拿到的数据，交换完成
            }
            // create arena on contention, but continue until slot null
            //存在竞争，其它线程抢先了一步该线程，因此需要采用多槽位模式，这个后面再分析
            if (NCPU > 1 && bound == 0 &&
                U.compareAndSwapInt(this, BOUND, 0, SEQ))
                arena = new Node[(FULL + 2) << ASHIFT];
        }
        else if (arena != null) //多槽位不为空，需要执行多槽位交换
            return null; // caller must reroute to arenaExchange
        else { //还没有其他线程来占据槽位
            p.item = item;
            // 设置槽位为p(也就是槽位被当前线程占据)
            if (U.compareAndSwapObject(this, SLOT, null, p))
                break; // 退出无限循环
            p.item = null; // 如果设置槽位失败，则有可能其他线程抢先了，重置item,重新循环
        }
    }

    //当前线程占据槽位，等待其它线程来交换数据
    int h = p.hash;
    long end = timed ? System.nanoTime() + ns : 0L;
    int spins = (NCPU > 1) ? SPINS : 1;
    Object v;
    // 直到成功交换到数据
    while ((v = p.match) == null) {
        if (spins > 0) { // 自旋
            h ^= h << 1; h ^= h >>> 3; h ^= h << 10;
            if (h == 0)
                h = SPINS | (int)t.getId();
            else if (h < 0 && (--spins & ((SPINS >>> 1) - 1)) == 0)
                // 主动让出cpu,这样可以提供cpu利用率（反正当前线程也自旋等待，还不如让其它任务占用cpu）
                Thread.yield(); 
        }
        else if (slot != p) //其它线程来交换数据了，修改了solt,但是还没有设置match,再稍等一会
            spins = SPINS;
        //需要阻塞等待其它线程来交换数据
        //没发生中断，并且是单槽交换，没有设置超时或者超时时间未到 则继续执行
        else if (!t.isInterrupted() && arena == null &&
                 (!timed || (ns = end - System.nanoTime()) > 0L)) {
            // cas 设置BLOCKER，可以参考Thread 中的parkBlocker
            U.putObject(t, BLOCKER, this);
            // 需要挂起当前线程
            p.parked = t;
            if (slot == p)
                U.park(false, ns); // 阻塞当前线程
            // 被唤醒后    
            p.parked = null;
            // 清空 BLOCKER
            U.putObject(t, BLOCKER, null);
        }
        // 不满足前面 else if 条件，交换失败，需要重置solt
        else if (U.compareAndSwapObject(this, SLOT, p, null)) {
            v = timed && ns <= 0L && !t.isInterrupted() ? TIMED_OUT : null;
            break;
        }
    }
    //清空match
    U.putOrderedObject(p, MATCH, null);
    p.item = null;
    p.hash = h;
    // 返回交换得到的数据（失败则为null）
    return v;
}
```

### arenaExchange

arenaExchange的原理和slotExchange的原理类似，只是在node数组中逐个寻找存在等待交换线程的slot，如果有则进行交换。如果交换失败则向后继续寻找，如果碰到空的slot，则占领该slot并等待一段时间，如果还没有交换线程来到，则继续向前遍历，直到回到第一个slot，还没有找到能够交换的其他线程，则阻塞等待。

```java
private final Object arenaExchange(Object item, boolean timed, long ns) {
    // 槽位数组
    Node[] a = arena;
    //代表当前线程的Node
    Node p = participant.get(); // p.index 初始值为 0
    for (int i = p.index;;) {                      // access slot at i
        int b, m, c; long j;                       // j is raw array offset
        //在槽位数组中根据"索引" i 取出数据 j相当于是 "第一个"槽位
        Node q = (Node)U.getObjectVolatile(a, j = (i << ASHIFT) + ABASE);
        // 该位置上有数据(即有线程在这里等待交换数据)
        if (q != null && U.compareAndSwapObject(a, j, q, null)) {
            // 进行数据交换，这里和单槽位的交换是一样的
            Object v = q.item;                     // release
            q.match = item;
            Thread w = q.parked;
            if (w != null)
                U.unpark(w);
            return v;
        }
        // bound 是最大的有效的 位置，和MMASK相与，得到真正的存储数据的索引最大值
        else if (i <= (m = (b = bound) & MMASK) && q == null) {
            // i 在这个范围内，该槽位也为空

            //将需要交换的数据 设置给p
            p.item = item;                         // offer
            //设置该槽位数据(在该槽位等待其它线程来交换数据)
            if (U.compareAndSwapObject(a, j, null, p)) {
                long end = (timed && m == 0) ? System.nanoTime() + ns : 0L;
                Thread t = Thread.currentThread(); // wait
                // 进行一定时间的自旋
                for (int h = p.hash, spins = SPINS;;) {
                    Object v = p.match;
                    //在自旋的过程中，有线程来和该线程交换数据
                    if (v != null) {
                        //交换数据后，清空部分设置，返回交换得到的数据，over
                        U.putOrderedObject(p, MATCH, null);
                        p.item = null;             // clear for next use
                        p.hash = h;
                        return v;
                    }
                    else if (spins > 0) {
                        h ^= h << 1; h ^= h >>> 3; h ^= h << 10; // xorshift
                        if (h == 0)                // initialize hash
                            h = SPINS | (int)t.getId();
                        else if (h < 0 &&          // approx 50% true
                                 (--spins & ((SPINS >>> 1) - 1)) == 0)
                            Thread.yield();        // two yields per wait
                    }
                    // 交换数据的线程到来，但是还没有设置好match，再稍等一会
                    else if (U.getObjectVolatile(a, j) != p)
                        spins = SPINS; 
                    //符合条件，特别注意m==0 这个说明已经到达area 中最小的存储数据槽位了
                    //没有其他线程在槽位等待了，所有当前线程需要阻塞在这里     
                    else if (!t.isInterrupted() && m == 0 &&
                             (!timed ||
                              (ns = end - System.nanoTime()) > 0L)) {
                        U.putObject(t, BLOCKER, this); // emulate LockSupport
                        p.parked = t;              // minimize window
                        // 再次检查槽位，看看在阻塞前，有没有线程来交换数据
                        if (U.getObjectVolatile(a, j) == p) 
                            U.park(false, ns); // 挂起
                        p.parked = null;
                        U.putObject(t, BLOCKER, null);
                    }
                    // 当前这个槽位一直没有线程来交换数据，准备换个槽位试试
                    else if (U.getObjectVolatile(a, j) == p &&
                             U.compareAndSwapObject(a, j, p, null)) {
                        //更新bound
                        if (m != 0)                // try to shrink
                            U.compareAndSwapInt(this, BOUND, b, b + SEQ - 1);
                        p.item = null;
                        p.hash = h;
                        // 减小索引值 往"第一个"槽位的方向挪动
                        i = p.index >>>= 1;        // descend
                        // 发送中断，返回null
                        if (Thread.interrupted())
                            return null;
                        // 超时
                        if (timed && m == 0 && ns <= 0L)
                            return TIMED_OUT;
                        break;                     // expired; restart 继续主循环
                    }
                }
            }
            else
                //占据槽位失败，先清空item,防止成功交换数据后，p.item还引用着item
                p.item = null;                     // clear offer
        }
        else { // i 不在有效范围，或者被其它线程抢先了
            //更新p.bound
            if (p.bound != b) {                    // stale; reset
                p.bound = b;
                //新bound ，重置collides
                p.collides = 0;
                //i如果达到了最大，那么就递减
                i = (i != m || m == 0) ? m : m - 1;
            }
            else if ((c = p.collides) < m || m == FULL ||
                     !U.compareAndSwapInt(this, BOUND, b, b + SEQ + 1)) {
                p.collides = c + 1; // 更新冲突
                // i=0 那么就从m开始，否则递减i
                i = (i == 0) ? m : i - 1;          // cyclically traverse
            }
            else
                //递增，往后挪动
                i = m + 1;                         // grow
            // 更新index
            p.index = i;
        }
    }
}
```

### 总结

其实就是"我"和"你"(可能有多个"我"，多个"你")在一个叫Slot的地方做交易(一手交钱，一手交货)，过程分以下步骤：

1. 我先到一个叫做Slot的交易场所交易，发现你已经到了，那我就尝试喊你交易，如果你回应了我，决定和我交易那么进入第2步；如果别人抢先一步把你喊走了，那我就进入第5步。
2. 我拿出钱交给你，你可能会接收我的钱，然后把货给我，交易结束；也可能嫌我掏钱太慢(超时)或者接个电话(中断)，TM的不卖了，走了，那我只能再找别人买货了(从头开始)。
3. 我到交易地点的时候，你不在，那我先尝试把这个交易点给占了(一屁股做凳子上...)，如果我成功抢占了单间(交易点)，那就坐这儿等着你拿货来交易，进入第4步；如果被别人抢座了，那我只能在找别的地方儿了，进入第5步。
4. 你拿着货来了，喊我交易，然后完成交易；也可能我等了好长时间你都没来，我不等了，继续找别人交易去，走的时候我看了一眼，一共没多少人，弄了这么多单间(交易地点Slot)，太TM浪费了，我喊来交易地点管理员：一共也没几个人，搞这么多单间儿干毛，给哥撤一个！。然后再找别人买货(从头开始)；或者我老大给我打了个电话，不让我买货了(中断)。
5. 我跑去喊管理员，尼玛，就一个坑交易个毛啊，然后管理在一个更加开阔的地方开辟了好多个单间，然后我就挨个来看每个单间是否有人。如果有人我就问他是否可以交易，如果回应了我，那我就进入第2步。如果我没有人，那我就占着这个单间等其他人来交易，进入第4步。
6. 如果我尝试了几次都没有成功，我就会认为，是不是我TM选的这个单间风水不好？不行，得换个地儿继续(从头开始)；如果我尝试了多次发现还没有成功，怒了，把管理员喊来：给哥再开一个单间(Slot)，加一个凳子，这么多人就这么几个破凳子够谁用！

通过CAS占据槽位和完成交易，通过自旋进行等待。

### REFS

- https://www.jianshu.com/p/c523826b2c94
- https://blog.csdn.net/u014634338/article/details/78385521
 
```
本文地址：https://cheng-dp.github.io/2018/11/12/exchanger/
```
 
