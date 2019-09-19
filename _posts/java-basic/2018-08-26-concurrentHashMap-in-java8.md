---
layout: post
title: Java8中的ConcurrentHashMap
categories: [Java]
description: Java8中的ConcurrentHashMap
keywords: Java
---

在Java8中，ConcurrentHashMap做了较大的调整。

JDK1.8的实现已经摒弃了Segment的概念，而是直接用**Node数组+链表+红黑树**的数据结构来实现，并发控制使用**Synchronized和CAS**来操作，整个看起来就像是优化过且线程安全的HashMap，虽然在JDK1.8中还能看到Segment的数据结构，但是已经简化了属性，只是为了兼容旧版本。

![ConcurrentHashMap_Java8](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/concurrenthashmap_java8.png)


#### 基本定义
1. 增加了两个hash值MOVED和TREEBIN，table中某index上的hash=MOVED表示该位置上元素正在resize迁移。hash=TREEBIN表示该位置是一个红黑树。
2. MAX_RESIZERS，能够帮助resize迁移的最大线程数。
3. sizeCtl
1. 当sizeCtl=-1时，table正在被某个线程初始化或者扩容。
2. sizeCtl=-N时，有N-1个线程正在对table进行扩容。
3. sizeCtl=0时，table还没有被初始化。
4. sizeCtl=正整数时，表示初始化或者下一次进行扩容的大小。
4. baseCount和counterCells[]共同记录Map的元素数目，更新Map的操作会首先尝试更新baseCount，如果存在竞争更新失败，会转而更新counterCells对应的index。

```java
// node数组最大容量：2^30=1073741824
private static final int MAXIMUM_CAPACITY = 1 << 30;
// 默认初始值，必须是2的幕数
private static final int DEFAULT_CAPACITY = 16;
//数组可能最大值，需要与toArray（）相关方法关联
static final int MAX_ARRAY_SIZE = Integer.MAX_VALUE - 8;
//并发级别，遗留下来的，为兼容以前的版本
private static final int DEFAULT_CONCURRENCY_LEVEL = 16;
// 负载因子
private static final float LOAD_FACTOR = 0.75f;
// 链表转红黑树阀值,> 8 链表转换为红黑树
static final int TREEIFY_THRESHOLD = 8;
//树转链表阀值，小于等于6（tranfer时，lc、hc=0两个计数器分别++记录原bin、新binTreeNode数量，<=UNTREEIFY_THRESHOLD 则untreeify(lo)）
static final int UNTREEIFY_THRESHOLD = 6;
static final int MIN_TREEIFY_CAPACITY = 64;
private static final int MIN_TRANSFER_STRIDE = 16;
private static int RESIZE_STAMP_BITS = 16;
// 2^15-1，help resize的最大线程数
private static final int MAX_RESIZERS = (1 << (32 - RESIZE_STAMP_BITS)) - 1;
// 32-16=16，sizeCtl中记录size大小的偏移量
private static final int RESIZE_STAMP_SHIFT = 32 - RESIZE_STAMP_BITS;
// forwarding nodes的hash值
static final int MOVED     = -1;
// 树根节点的hash值
static final int TREEBIN   = -2;
// ReservationNode的hash值
static final int RESERVED  = -3;
// 可用处理器数量
static final int NCPU = Runtime.getRuntime().availableProcessors();
//存放node的数组
transient volatile Node<K,V>[] table;
//记录元素数目，当没有竞争时，更新Map的操作会更新Map的baseCount。
private transient volatile long baseCount;
//当更新Map的操作在更新baseCount时存在竞争，更新失败时，会去更新对应table index的counterCells。
private transient volatile CounterCell[] counterCells;


/*控制标识符，用来控制table的初始化和扩容的操作，不同的值有不同的含义
*当为负数时：-1代表正在初始化，-N代表有N-1个线程正在 进行扩容
*当为0时：代表当时的table还没有被初始化
*当为正数时：表示初始化或者下一次进行扩容的大小
private transient volatile int sizeCtl;
```


#### Node
==Node是ConcurrentHashMap存储结构的基本单元，继承于HashMap中的Entry，用于存储数据。==
1. Java8中，Node中的value和next都是volatile的。
2. setValue方法抛出UnsupportedException且是final，即不允许更新value，只允许查找。
```java
static class Node<K,V> implements Map.Entry<K,V> {
//链表的数据结构
final int hash;
final K key;
//val和next都会在扩容时发生变化，所以加上volatile来保持可见性和禁止重排序
volatile V val;
volatile Node<K,V> next;
Node(int hash, K key, V val, Node<K,V> next) {
this.hash = hash;
this.key = key;
this.val = val;
this.next = next;
}
public final K getKey()       { return key; }
public final V getValue()     { return val; }
public final int hashCode()   { return key.hashCode() ^ val.hashCode(); }
public final String toString(){ return key + "=" + val; }
//不允许更新value 
public final V setValue(V value) {
throw new UnsupportedOperationException();
}
public final boolean equals(Object o) {
Object k, v, u; Map.Entry<?,?> e;
return ((o instanceof Map.Entry) &&
(k = (e = (Map.Entry<?,?>)o).getKey()) != null &&
(v = e.getValue()) != null &&
(k == key || k.equals(key)) &&
(v == (u = val) || v.equals(u)));
}
//用于map中的get（）方法，子类重写
Node<K,V> find(int h, Object k) {
Node<K,V> e = this;
if (k != null) {
do {
K ek;
if (e.hash == h &&
((ek = e.key) == k || (ek != null && k.equals(ek))))
return e;
} while ((e = e.next) != null);
}
return null;
}
}
```

#### TreeNode
TreeNode继承至Node，在ConcurrentHashMap中用于红黑树中存储数据。
```java
static final class TreeNode<K,V> extends Node<K,V> {
//树形结构的属性定义
TreeNode<K,V> parent;  // red-black tree links
TreeNode<K,V> left;
TreeNode<K,V> right;
TreeNode<K,V> prev;    // needed to unlink next upon deletion
boolean red; //标志红黑树的红节点
TreeNode(int hash, K key, V val, Node<K,V> next,
TreeNode<K,V> parent) {
super(hash, key, val, next);
this.parent = parent;
}
Node<K,V> find(int h, Object k) {
return findTreeNode(h, k, null);
}

//......
}
```

#### TreeBin
封装TreeNode的容器，它提供转换黑红树的一些条件和锁的控制。从table中访问index得到TreeBin。
```java
static final class TreeBin<K,V> extends Node<K,V> {
//指向TreeNode列表和根节点
TreeNode<K,V> root;
volatile TreeNode<K,V> first;
volatile Thread waiter;
volatile int lockState;
// 读写锁状态
static final int WRITER = 1; // 获取写锁的状态
static final int WAITER = 2; // 等待写锁的状态
static final int READER = 4; // 增加数据时读锁的状态

//......
}

```

#### put操作
1. 如果没有初始化就先调用initTable()方法来进行初始化过程。
2. ==如果没有hash冲突就直接CAS插入。==
3. 如果还在进行扩容操作就先进行扩容，helperTransfer能够将该线程加入帮助进行扩容操作。
4. ==如果存在hash冲突，就加锁synchronized后插入元素==，这里有两种情况，一种是链表形式就直接遍历到尾端插入，一种是红黑树就按照红黑树结构插入，
5. 最后一个如果该链表的数量大于阈值8，就要先转换成黑红树的结构，break再一次进入循环。
6. 如果添加成功就调用addCount（）方法统计size，并且检查是否需要扩容。

```java
public V put(K key, V value) {
return putVal(key, value, false);
}

final V putVal(K key, V value, boolean onlyIfAbsent) {
if (key == null || value == null) throw new NullPointerException();
// 得到 hash 值
int hash = spread(key.hashCode());
// 用于记录相应链表的长度
int binCount = 0;
//在循环中不断尝试，因为在table的初始化和casTabAt用到了compareAndSwapInt、compareAndSwapObject
//如果其他线程正在修改tab，尝试就会失败。
for (Node<K,V>[] tab = table;;) {
Node<K,V> f; int n, i, fh;
// 如果数组"空"，进行数组初始化
if (tab == null || (n = tab.length) == 0)
// 初始化数组，后面会详细介绍
tab = initTable();

// 找该 hash 值对应的数组下标，得到第一个节点 f
else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
// 如果数组该位置为空，
//    用一次 CAS 操作将这个新值放入其中即可，这个 put 操作差不多就结束了，可以拉到最后面了
//          如果 CAS 失败，那就是有并发操作，进到下一个循环就好了
if (casTabAt(tab, i, null,
new Node<K,V>(hash, key, value, null)))
break;                   // no lock when adding to empty bin
}
// hash 居然可以等于 MOVED，这个需要到后面才能看明白，不过从名字上也能猜到，肯定是因为在扩容
else if ((fh = f.hash) == MOVED)
// 帮助数据迁移，这个等到看完数据迁移部分的介绍后，再理解这个就很简单了
tab = helpTransfer(tab, f);

else { // 到这里就是说，f 是该位置的头结点，而且不为空

V oldVal = null;
// 获取数组该位置的头结点的监视器锁
synchronized (f) {
if (tabAt(tab, i) == f) {
if (fh >= 0) { // 头结点的 hash 值大于 0，说明是链表
// 用于累加，记录链表的长度
binCount = 1;
// 遍历链表
for (Node<K,V> e = f;; ++binCount) {
K ek;
// 如果发现了"相等"的 key，判断是否要进行值覆盖，然后也就可以 break 了
if (e.hash == hash &&
((ek = e.key) == key ||
(ek != null && key.equals(ek)))) {
oldVal = e.val;
if (!onlyIfAbsent)
e.val = value;
break;
}
// 到了链表的最末端，将这个新值放到链表的最后面
Node<K,V> pred = e;
if ((e = e.next) == null) {
pred.next = new Node<K,V>(hash, key,
value, null);
break;
}
}
}
else if (f instanceof TreeBin) { // 红黑树
Node<K,V> p;
binCount = 2;
// 调用红黑树的插值方法插入新节点
if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
value)) != null) {
oldVal = p.val;
if (!onlyIfAbsent)
p.val = value;
}
}
}
}
// binCount != 0 说明上面在做链表操作
if (binCount != 0) {
// 判断是否要将链表转换为红黑树，临界值和 HashMap 一样，也是 8
if (binCount >= TREEIFY_THRESHOLD)
// 这个方法和 HashMap 中稍微有一点点不同，那就是它不是一定会进行红黑树转换，
// 如果当前数组的长度小于 64，那么会选择进行数组扩容，而不是转换为红黑树
//    具体源码我们就不看了，扩容部分后面说
treeifyBin(tab, i);
if (oldVal != null)
return oldVal;
break;
}
}
}
// 
addCount(1L, binCount);
return null;
}
```
#### initTable初始化
```java
private final Node<K,V>[] initTable() {
Node<K,V>[] tab; int sc;
while ((tab = table) == null || tab.length == 0) {//空的table才能进入初始化操作
if ((sc = sizeCtl) < 0) //sizeCtl<0表示其他线程已经在初始化了或者扩容了，挂起当前线程
Thread.yield(); // lost initialization race; just spin
else if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {//CAS操作SIZECTL为-1，表示初始化状态
try {
if ((tab = table) == null || tab.length == 0) {
int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
@SuppressWarnings("unchecked")
Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];//初始化
table = tab = nt;
sc = n - (n >>> 2);//记录下次扩容的大小
}
} finally {
sizeCtl = sc;
}
break;
}
}
return tab;
}
```

#### 链表转红黑树
```java
private final void treeifyBin(Node<K,V>[] tab, int index) {
Node<K,V> b; int n, sc;
if (tab != null) {
// MIN_TREEIFY_CAPACITY 为 64
// 所以，如果数组长度小于 64 的时候，其实也就是 32 或者 16 或者更小的时候，会进行数组扩容
if ((n = tab.length) < MIN_TREEIFY_CAPACITY)
// 后面我们再详细分析这个方法
tryPresize(n << 1);
// b 是头结点
else if ((b = tabAt(tab, index)) != null && b.hash >= 0) {
// 加锁
synchronized (b) {

if (tabAt(tab, index) == b) {
// 下面就是遍历链表，建立一颗红黑树
TreeNode<K,V> hd = null, tl = null;
for (Node<K,V> e = b; e != null; e = e.next) {
TreeNode<K,V> p =
new TreeNode<K,V>(e.hash, e.key, e.val,
null, null);
if ((p.prev = tl) == null)
hd = p;
else
tl.next = p;
tl = p;
}
// 将红黑树设置到数组相应位置中
setTabAt(tab, index, new TreeBin<K,V>(hd));
}
}
}
}
}
```

#### 扩容操作
扩容操作是Java8最复杂的操作。扩容后容量为原来的2倍。

原数组长度为 n，所以我们有 n 个迁移任务，让每个线程每次负责一个小任务是最简单的，每做完一个任务再检测是否有其他没做完的任务，帮助迁移就可以了，而 Doug Lea 使用了一个 stride，简单理解就是**步长**，每个线程每次负责迁移其中的一部分，如每次迁移16个小任务。所以，我们就需要一个全局的调度者来安排哪个线程执行哪几个任务，这个就是属性 transferIndex 的作用。

第一个发起数据迁移的线程会将 transferIndex 指向原数组最后的位置，**然后从后往前的 stride 个任务属于第一个线程，然后将 transferIndex 指向新的位置，再往前的 stride 个任务属于第二个线程，依此类推**。当然，这里说的第二个线程不是真的一定指代了第二个线程，也可以是同一个线程，这个读者应该能理解吧。其实就是将一个大的迁移任务分为了一个个任务包。

```java
// 首先要说明的是，方法参数 size 传进来的时候就已经翻了倍了
private final void tryPresize(int size) {
// c：size 的 1.5 倍，再加 1，再往上取最近的 2 的 n 次方。
int c = (size >= (MAXIMUM_CAPACITY >>> 1)) ? MAXIMUM_CAPACITY :
tableSizeFor(size + (size >>> 1) + 1);
int sc;
while ((sc = sizeCtl) >= 0) {
Node<K,V>[] tab = table; int n;

// 这个 if 分支和之前说的初始化数组的代码基本上是一样的，在这里，我们可以不用管这块代码
if (tab == null || (n = tab.length) == 0) {
n = (sc > c) ? sc : c;
if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
try {
if (table == tab) {
@SuppressWarnings("unchecked")
Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
table = nt;
sc = n - (n >>> 2); // 0.75 * n
}
} finally {
sizeCtl = sc;
}
}
}
else if (c <= sc || n >= MAXIMUM_CAPACITY)
break;
else if (tab == table) {
int rs = resizeStamp(n);

if (sc < 0) {
Node<K,V>[] nt;
if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
transferIndex <= 0)
break;
// 2. 用 CAS 将 sizeCtl 加 1，然后执行 transfer 方法
//    此时 nextTab 不为 null
if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
transfer(tab, nt);
}
// 1. 将 sizeCtl 设置为 (rs << RESIZE_STAMP_SHIFT) + 2)
//  调用 transfer 方法，此时 nextTab 参数为 null
else if (U.compareAndSwapInt(this, SIZECTL, sc,
(rs << RESIZE_STAMP_SHIFT) + 2))
transfer(tab, null);
}
}
}
```

```java
private final void transfer(Node<K,V>[] tab, Node<K,V>[] nextTab) {
int n = tab.length, stride;

// stride 在单核下直接等于 n，多核模式下为 (n>>>3)/NCPU，最小值是 16
// stride 可以理解为”步长“，有 n 个位置是需要进行迁移的，
//   将这 n 个任务分为多个任务包，每个任务包有 stride 个任务
if ((stride = (NCPU > 1) ? (n >>> 3) / NCPU : n) < MIN_TRANSFER_STRIDE)
stride = MIN_TRANSFER_STRIDE; // subdivide range

// 如果 nextTab 为 null，先进行一次初始化
//    前面我们说了，外围会保证第一个发起迁移的线程调用此方法时，参数 nextTab 为 null
//       之后参与迁移的线程调用此方法时，nextTab 不会为 null
if (nextTab == null) {
try {
// 容量翻倍
Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n << 1];
nextTab = nt;
} catch (Throwable ex) {      // try to cope with OOME
sizeCtl = Integer.MAX_VALUE;
return;
}
// nextTable 是 ConcurrentHashMap 中的属性
nextTable = nextTab;
// transferIndex 也是 ConcurrentHashMap 的属性，用于控制迁移的位置
transferIndex = n;
}

int nextn = nextTab.length;

// ForwardingNode 翻译过来就是正在被迁移的 Node
// 这个构造方法会生成一个Node，key、value 和 next 都为 null，关键是 hash 为 MOVED
// 后面我们会看到，原数组中位置 i 处的节点完成迁移工作后，
//    就会将位置 i 处设置为这个 ForwardingNode，用来告诉其他线程该位置已经处理过了
//    所以它其实相当于是一个标志。
ForwardingNode<K,V> fwd = new ForwardingNode<K,V>(nextTab);


// advance 指的是做完了一个位置的迁移工作，可以准备做下一个位置的了
boolean advance = true;
boolean finishing = false; // to ensure sweep before committing nextTab

/*
* 下面这个 for 循环，最难理解的在前面，而要看懂它们，应该先看懂后面的，然后再倒回来看
* 
*/

// i 是位置索引，bound 是边界，注意是从后往前
for (int i = 0, bound = 0;;) {
Node<K,V> f; int fh;

// 下面这个 while 真的是不好理解
// advance 为 true 表示可以进行下一个位置的迁移了
//   简单理解结局：i 指向了 transferIndex，bound 指向了 transferIndex-stride
while (advance) {
int nextIndex, nextBound;
if (--i >= bound || finishing)
advance = false;

// 将 transferIndex 值赋给 nextIndex
// 这里 transferIndex 一旦小于等于 0，说明原数组的所有位置都有相应的线程去处理了
else if ((nextIndex = transferIndex) <= 0) {
i = -1;
advance = false;
}
else if (U.compareAndSwapInt
(this, TRANSFERINDEX, nextIndex,
nextBound = (nextIndex > stride ?
nextIndex - stride : 0))) {
// 看括号中的代码，nextBound 是这次迁移任务的边界，注意，是从后往前
bound = nextBound;
i = nextIndex - 1;
advance = false;
}
}
if (i < 0 || i >= n || i + n >= nextn) {
int sc;
if (finishing) {
// 所有的迁移操作已经完成
nextTable = null;
// 将新的 nextTab 赋值给 table 属性，完成迁移
table = nextTab;
// 重新计算 sizeCtl：n 是原数组长度，所以 sizeCtl 得出的值将是新数组长度的 0.75 倍
sizeCtl = (n << 1) - (n >>> 1);
return;
}

// 之前我们说过，sizeCtl 在迁移前会设置为 (rs << RESIZE_STAMP_SHIFT) + 2
// 然后，每有一个线程参与迁移就会将 sizeCtl 加 1，
// 这里使用 CAS 操作对 sizeCtl 进行减 1，代表做完了属于自己的任务
if (U.compareAndSwapInt(this, SIZECTL, sc = sizeCtl, sc - 1)) {
// 任务结束，方法退出
if ((sc - 2) != resizeStamp(n) << RESIZE_STAMP_SHIFT)
return;

// 到这里，说明 (sc - 2) == resizeStamp(n) << RESIZE_STAMP_SHIFT，
// 也就是说，所有的迁移任务都做完了，也就会进入到上面的 if(finishing){} 分支了
finishing = advance = true;
i = n; // recheck before commit
}
}
// 如果位置 i 处是空的，没有任何节点，那么放入刚刚初始化的 ForwardingNode ”空节点“
else if ((f = tabAt(tab, i)) == null)
advance = casTabAt(tab, i, null, fwd);
// 该位置处是一个 ForwardingNode，代表该位置已经迁移过了
else if ((fh = f.hash) == MOVED)
advance = true; // already processed
else {
// 对数组该位置处的结点加锁，开始处理数组该位置处的迁移工作
synchronized (f) {
if (tabAt(tab, i) == f) {
Node<K,V> ln, hn;
// 头结点的 hash 大于 0，说明是链表的 Node 节点
if (fh >= 0) {
// 下面这一块和 Java7 中的 ConcurrentHashMap 迁移是差不多的，
// 需要将链表一分为二，
//   找到原链表中的 lastRun，然后 lastRun 及其之后的节点是一起进行迁移的
//   lastRun 之前的节点需要进行克隆，然后分到两个链表中
int runBit = fh & n;
Node<K,V> lastRun = f;
for (Node<K,V> p = f.next; p != null; p = p.next) {
int b = p.hash & n;
if (b != runBit) {
runBit = b;
lastRun = p;
}
}
if (runBit == 0) {
ln = lastRun;
hn = null;
}
else {
hn = lastRun;
ln = null;
}
for (Node<K,V> p = f; p != lastRun; p = p.next) {
int ph = p.hash; K pk = p.key; V pv = p.val;
if ((ph & n) == 0)
ln = new Node<K,V>(ph, pk, pv, ln);
else
hn = new Node<K,V>(ph, pk, pv, hn);
}
// 其中的一个链表放在新数组的位置 i
setTabAt(nextTab, i, ln);
// 另一个链表放在新数组的位置 i+n
setTabAt(nextTab, i + n, hn);
// 将原数组该位置处设置为 fwd，代表该位置已经处理完毕，
//    其他线程一旦看到该位置的 hash 值为 MOVED，就不会进行迁移了
setTabAt(tab, i, fwd);
// advance 设置为 true，代表该位置已经迁移完毕
advance = true;
}
else if (f instanceof TreeBin) {
// 红黑树的迁移
TreeBin<K,V> t = (TreeBin<K,V>)f;
TreeNode<K,V> lo = null, loTail = null;
TreeNode<K,V> hi = null, hiTail = null;
int lc = 0, hc = 0;
for (Node<K,V> e = t.first; e != null; e = e.next) {
int h = e.hash;
TreeNode<K,V> p = new TreeNode<K,V>
(h, e.key, e.val, null, null);
if ((h & n) == 0) {
if ((p.prev = loTail) == null)
lo = p;
else
loTail.next = p;
loTail = p;
++lc;
}
else {
if ((p.prev = hiTail) == null)
hi = p;
else
hiTail.next = p;
hiTail = p;
++hc;
}
}
// 如果一分为二后，节点数少于 8，那么将红黑树转换回链表
ln = (lc <= UNTREEIFY_THRESHOLD) ? untreeify(lo) :
(hc != 0) ? new TreeBin<K,V>(lo) : t;
hn = (hc <= UNTREEIFY_THRESHOLD) ? untreeify(hi) :
(lc != 0) ? new TreeBin<K,V>(hi) : t;

// 将 ln 放置在新数组的位置 i
setTabAt(nextTab, i, ln);
// 将 hn 放置在新数组的位置 i+n
setTabAt(nextTab, i + n, hn);
// 将原数组该位置处设置为 fwd，代表该位置已经处理完毕，
//    其他线程一旦看到该位置的 hash 值为 MOVED，就不会进行迁移了
setTabAt(tab, i, fwd);
// advance 设置为 true，代表该位置已经迁移完毕
advance = true;
}
}
}
}
}
}
```
#### addCount方法
```java
private final void addCount(long x, int check) {
CounterCell[] as; long b, s;

if ((as = counterCells) != null ||
!U.compareAndSwapLong(this, BASECOUNT, b = baseCount, s = b + x)) {//每次进来都baseCount都加1因为x=1
CounterCell a; long v; int m;
boolean uncontended = true;
if (as == null || (m = as.length - 1) < 0 ||
(a = as[ThreadLocalRandom.getProbe() & m]) == null ||
!(uncontended =
U.compareAndSwapLong(a, CELLVALUE, v = a.value, v + x))) {
//多线程CAS发生失败的时候执行
fullAddCount(x, uncontended);
return;
}
if (check <= 1)
return;
s = sumCount();
}
if (check >= 0) {
Node<K,V>[] tab, nt; int n, sc;
//当条件满足开始扩容
while (s >= (long)(sc = sizeCtl) && (tab = table) != null &&
(n = tab.length) < MAXIMUM_CAPACITY) {
int rs = resizeStamp(n);
if (sc < 0) {//如果小于0说明已经有线程在进行扩容操作了
//一下的情况说明已经有在扩容或者多线程进行了扩容，其他线程直接break不要进入扩容操作
if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
transferIndex <= 0)
break;
if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))//如果相等说明扩容已经完成，可以继续扩容
transfer(tab, nt);
}
//这个时候sizeCtl已经等于(rs << RESIZE_STAMP_SHIFT) + 2等于一个大的负数，这边加上2很巧妙,因为transfer后面对sizeCtl--操作的时候，最多只能减两次就结束
else if (U.compareAndSwapInt(this, SIZECTL, sc,
(rs << RESIZE_STAMP_SHIFT) + 2))
transfer(tab, null);
s = sumCount();
}
}
}
```
#### size操作
size函数就是把baseCount和counterCells的数值全部相加。
```java
public int size() {
long n = sumCount();
return ((n < 0L) ? 0 :
(n > (long)Integer.MAX_VALUE) ? Integer.MAX_VALUE : (int)n);
}

final long sumCount() {
CounterCell[] as = counterCells; CounterCell a;
long sum = baseCount;
if (as != null) {
for (int i = 0; i < as.length; ++i) {
if ((a = as[i]) != null)
sum += a.value;
}
}
return sum;
}
```

#### get操作
1. 计算 hash 值 
2. 根据 hash 值找到数组对应位置: (n - 1) & h 
3. 根据该位置处结点性质进行相应查找
1. 如果该位置为 null，那么直接返回 null 就可以了。
2. 如果该位置处的节点刚好就是我们需要的，返回该节点的值即可。
3. 如果该位置节点的 hash 值小于 0，说明正在扩容，或者是红黑树，调用对应ForwardingNode或TreeBin的find方法。
4. 如果以上 3 条都不满足，那就是链表，进行遍历比对即可

```java
public V get(Object key) {
Node<K,V>[] tab; Node<K,V> e, p; int n, eh; K ek;
int h = spread(key.hashCode()); //计算两次hash
if ((tab = table) != null && (n = tab.length) > 0 &&
(e = tabAt(tab, (n - 1) & h)) != null) {//读取首节点的Node元素
if ((eh = e.hash) == h) { //如果该节点就是首节点就返回
if ((ek = e.key) == key || (ek != null && key.equals(ek)))
return e.val;
}
//hash值为负值表示正在扩容或者是红黑树，调用对应ForwardingNode或者TreeBin的find方法。
else if (eh < 0)
return (p = e.find(h, key)) != null ? p.val : null;
while ((e = e.next) != null) {//既不是首节点也不是ForwardingNode，那就往下遍历
if (e.hash == h &&
((ek = e.key) == key || (ek != null && key.equals(ek))))
return e.val;
}
}
return null;
}
```


refs  
https://www.cnblogs.com/study-everyday/p/6430462.html
https://www.cnblogs.com/huaizuo/p/5413069.html  
https://blog.csdn.net/sihai12345/article/details/79383766  
http://www.importnew.com/22007.html  
https://www.cnblogs.com/huaizuo/p/5413069.html

//TODO
2. CAS算法
 
```
本文地址：https://cheng-dp.github.io/2018/08/26/concurrentHashMap-in-java8/
```
 
