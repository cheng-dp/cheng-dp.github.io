---
layout: post
title: NIO、AIO和Reactor、Proactor模式
categories: [Java]
description: NIO、AIO和Reactor、Proactor模式
keywords: Java, Java多线程
---
### 同步与异步/阻塞与非阻塞

BIO --> Blocking IO: 同步阻塞  
NIO --> Non-Blocking IO: 同步非阻塞  
AIO --> Async IO: 异步非阻塞  


阻塞和非阻塞关注的是**程序在等待调用结果(消息，返回值)时的状态**。  
阻塞调用是指在调用结果返回之前，当前线程会被挂起，调用线程只有在得到结果之后才会继续执行。  
非阻塞调用是指在不能立刻得到结果之前，调用线程不会被挂起，还是可以执行其他事情。

同步和异步关注的是**消息通信机制**。  
同步就是调用者进行调用后，在没有得到结果之前，该调用一直不会返回，但是一旦调用返回，就得到了返回值，**同步就是指调用者主动等待调用结果**。  
异步则相反，执行调用之后直接返回，所以可能没有返回值，等到有返回值时，由被调用者通过状态，通知来通知调用者。**异步就是指被调用者来通知调用者调用结果就绪**。  
二者在消息通信机制上有所不同，**一个是调用者检查调用结果是否就绪，一个是被调用者通知调用者结果就绪**

- 同步阻塞：你到饭馆点餐，然后在那等着，还要一边喊：好了没啊！  
- 同步非阻塞：在饭馆点完餐，就去遛狗了。不过溜一会儿，就回饭馆喊一声：好了没啊！  
- 异步阻塞：遛狗的时候，接到饭馆电话，说饭做好了，让您亲自去拿。  
- 异步非阻塞：饭馆打电话说，我们知道您的位置，一会给你送过来，安心遛狗就可以了。  

异步io是在数据读取或者写入调用已经完成的时候，再通知调用者，而非阻塞多路复用io则是在有数据就绪，可以读写的时候通知调用者，读写仍然是由调用者执行并且是阻塞的(这意味着如果要同时进行其他工作，要控制读写操作不能阻塞太长时间或者需要将其放去单独的io线程执行)。

### NIO

Java NIO（New IO/Non-Blocking IO）是从Java 1.4版本开始引入的一个新的IO API，可以替代标准的Java IO API。

Java NIO 由以下几个核心部分组成： 

1. Channels
2. Buffers
3. Selectors

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/nio_channel_buffer.png)

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/nio_channel_selector.png)


### IO和NIO的区别

#### 基本区别

IO | NIO
---|---
Stream Oriented | Buffer Oriented
Blocking IO | Non blocking IO
   -- | Selectors

1. 面向流与面向缓冲

Java NIO和IO之间第一个最大的区别是，IO是面向流的，NIO是面向缓冲区的。  
Java IO面向流意味着每次从流中读一个或多个字节，直至读取所有字节，它们没有被缓存在任何地方，并且无法前后移动流中的数据。  
Java NIO数据读取到一个它稍后处理的缓冲区，需要时可在缓冲区中前后移动。  

2. 阻塞与非阻塞IO

Java IO的流是阻塞的，当一个线程调用read() 或 write()时，该线程被阻塞，直到有一些数据被读取，或数据完全写入。  

Java NIO是非阻塞的，读取数据时，立即从通道读出目前可用的数据，没数据时也立即返回。写数据时，立即向通道写入能写入的数据，无法写入时立即返回。

3. NIO通过通道Channel读写

通道是双向的，可读也可写，而流的读写是单向的。无论读写，通道只能和Buffer交互。

3. 选择器(Selector多路复用)

NIO支持通过操作系统epoll方法实现的线程多路复用。及通过Selector，实现单线程同时监测多个通道。

4. 使用情况

有大量连接，每次连接发送少量数据，使用NIO。[如聊天服务器、P2P网络等]。少量连接，每次连接发送大量数据，使用IO。

#### 示例

需要读取的文件数据： 
```
Name: Anna  
Age: 25  
Email: anna@mailserver.com  
Phone: 1234567890  
```

Java IO的实现： 
```java
InputStream input = … ; // get the InputStream from the client socket  
BufferedReader reader = new BufferedReader(new InputStreamReader(input));  
  
String nameLine   = reader.readLine();  
String ageLine    = reader.readLine();  
String emailLine  = reader.readLine();  
String phoneLine  = reader.readLine();  
```

Java NIO的实现：
```java
ByteBuffer buffer = ByteBuffer.allocate(48);  
int bytesRead = inChannel.read(buffer);  
while(! bufferFull(bytesRead) ) {  
bytesRead = inChannel.read(buffer);  
}  
```

关于NIO的具体介绍请查看：  
[http://www.iteye.com/magazines/132-Java-NIO](http://www.iteye.com/magazines/132-Java-NIO)


#### NIO的底层实现

Java NIO底层基于Linux的epoll实现。见Linux/《IO多路复用Select，poll和epoll》。

### AIO

NIO的同步非阻塞，指的是当通道没有准备好时，无需阻塞等到，但是当通道已准备好读写时，数据传输的过程仍然是同步的，仍需要等到数据传输完成。

AIO是异步非阻塞的，将数据传输的部分也交由内核完成，线程无需等到数据传输。

#### AIO代码

因为AIO的实施需充分调用OS参与，IO需要操作系统支持、并发也同样需要操作系统的支持，所以性能方面不同操作系统差异会比较明显。

jdk7主要增加了三个新的异步通道:

**AsynchronousFileChannel**: 用于文件异步读写。  
**AsynchronousSocketChannel**: 客户端异步socket。  
**AsynchronousServerSocketChannel**: 服务器异步socket。  

AIO的异步有Future和Callback两种方式。

Future：  
当你希望主线程发起异步调用，并轮询等待结果的时候使用将来式。  

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/AIO_future.png)

```java
Path path = Paths.get("log4j.properties");
    AsynchronousFileChannel channel = AsynchronousFileChannel.open(path);
    ByteBuffer buffer = ByteBuffer.allocate(1024);
    Future<Integer> future = channel.read(buffer,0);//AIO异步调用。
//        while (!future.isDone()){
//            System.out.println("I'm idle");
//        }
    Integer readNumber = future.get();//主线程在需要的时候轮询等待结果。

    buffer.flip();
    CharBuffer charBuffer = CharBuffer.allocate(1024);
    CharsetDecoder decoder = Charset.defaultCharset().newDecoder();
    decoder.decode(buffer,charBuffer,false);
    charBuffer.flip();
    String data = new String(charBuffer.array(),0, charBuffer.limit());
    System.out.println("read number:" + readNumber);
    System.out.println(data);
```

Callback:  
异步回调  

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/AIO_callback.png)

```java
//回调通过传入CompletionHandler，实现completed和failed方法。
Path path = Paths.get("/data/code/github/java_practice/src/main/resources/1log4j.properties");
    AsynchronousFileChannel channel = AsynchronousFileChannel.open(path);
    ByteBuffer buffer = ByteBuffer.allocate(1024);
    channel.read(buffer, 0, buffer, new CompletionHandler<Integer, ByteBuffer>() {
        @Override
        public void completed(Integer result, ByteBuffer attachment) {
            System.out.println(Thread.currentThread().getName() + " read success!");
        }

        @Override
        public void failed(Throwable exc, ByteBuffer attachment) {
            System.out.println("read error");
        }
    });

    while (true){
        System.out.println(Thread.currentThread().getName() + " sleep");
        Thread.sleep(1000);
    }
```

#### AIO与NIO比较

AIO将IO就绪事件监听和IO数据读取全部交由操作系统完成，也就不需要多路复用器去监听IO就绪事件、也不需要分配线程读取。

用户完全不需要关注IO过程，只需要关注拿到数据后的处理。

#### AIO的底层实现

Windows上是使用完成接口(IOCP)实现。

Linux上使用aio调用UnixAsynchronousServerSocketChannelImpl, UnixAsynchronousSocketChannelImpl, SolarisAsynchronousChannelProvider。

```
Linux内核的AIO实现有很多问题（不在本文讨论范畴），性能在某些场景下还不如NIO，连Linux上的Java都是用epoll来模拟AIO，所以Linux上使用Java的AIO API，只是能体验到异步IO的编程风格，但并不会比NIO高效。
```
由于Linux上实现的缺陷，Linux平台上的Java服务端编程，目前主流依然采用NIO模型。


### Reactor模式和Proactor模式

Reactor和Proactor都是**IO复用**下的事件驱动设计模式，主要的关注点是同步还是异步。异步情况下(Proactor)，当回调handler时，表示IO操作已经完成；同步情况下(Reactor)，回调handler时，表示IO设备可以进行某个操作(can read or can write)。

一般地,I/O多路复用机制都依赖于一个**事件多路分离器(Event Demultiplexer)**。分离器对象可将来自事件源的I/O事件分离出来，并分发到对应的read/write事件处理器(Event Handler)。开发人员预先注册需要处理的事件及其**事件处理器（或回调函数）**。事件分离器负责将请求事件传递给事件处理器。

#### Reactor

```
The reactor design pattern is an event handling pattern for handling service requests delivered concurrently by one or more inputs. The service handler then demultiplexes the incoming requests and dispatches them synchronously to associated request handlers.
```

要求主线程（I/O处理单元）只负责监听文件描述上是否有事件发生，有的话就立即将该事件通知工作线程（逻辑单元）。除此之外，主线程不做任何其他实质性的工作。读写数据，接受新的连接，以及处理客户请求均在工作线程中完成。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/reactor.jpeg)


- Handle句柄，用来标识socket连接或是打开文件。  
- Synchronous Event Demultiplexer：同步事件多路分解器，由操作系统内核实现的一个函数，用于阻塞等待发生在句柄集合上的一个或多个事件。（如select/epoll）
- Event Handler：事件处理接口。
- Concrete Event HandlerA：实现应用程序所提供的特定事件处理逻辑。
- Reactor：反应器，定义一个接口，实现以下功能：
    - 供应用程序注册和删除关注的事件句柄。
    - 运行事件循环。
    - 有就绪事件到来时，分发事件到之前注册的回调函数上处理。

#### Reactor和NIO

NIO的出现，使得当IO未就绪时，线程可以不挂起，继续处理其他事情。一个线程也不必局限于只为一个IO连接服务。

Reactor模式提供了在NIO下，使用多路复用(Selector)监管多IO的模型。

在生产环境中，一般使用一个Boss线程专门监控IO就绪事件，一个Work线程池负责具体IO读写。Boss线程检测到新的IO就绪事件后，根据事件类型，完成IO操作任务分配，并交给Work线程处理。这就是Reactor模式的核心思想。

#### Proactor

与Reactor模式不同，Proactor模式将所有I/O操作都交给主线程和内核来处理，工作线程仅仅负责业务逻辑。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/proactor.jpeg)

- Handle句柄；用来标识socket连接或是打开文件。
- Asynchronous Operation Processor：异步操作处理器，负责执行异步操作，一般由操作系统内核实现。
- Asynchronous Operation：异步操作。
- Completion Event Queue：完成事件队列，异步操作完成的结果放到队列中等待后续使用。
- Proactor：主动器，为应用程序进程提供事件循环，从完成事件队列中取出异步操作的结果，分发调用相应的后续处理逻辑。
- Completion Handler：完成事件接口，一般是由回调函数组成的接口。
- Concrete Completion Handler：完成事件处理逻辑，实现接口定义特定的应用处理逻辑。

#### Proactor和AIO

Java的AIO API其实就是Proactor模式的应用。

也Reactor模式类似，Proactor模式也可以抽象出三类角色：

- Acceptor。用户处理客户端连接请求。Acceptor角色映射到Java代码中，即为AsynchronousServerSocketChannel。

- Proactor。用于分派IO完成事件的处理任务。Proactor角色映射到Java代码中，即为API方法中添加回调参数。

- Handler。用于处理具体的IO完成事件。（比如处理读取到的数据等）。Handler角色映射到Java代码中，即为AsynchronousChannelGroup 中的每个线程。

### refs
NIO和AIO  
- http://www.iteye.com/magazines/132-Java-NIO
- https://tech.meituan.com/nio.html
- http://www.importnew.com/21341.html
- https://blog.csdn.net/anxpp/article/details/51512200
- https://www.jianshu.com/p/8c368129c658
- https://juejin.im/entry/583ec2e3128fe1006bfa6c83
- https://colobu.com/2014/11/13/java-aio-introduction/

直接内存  
- https://blog.csdn.net/towads/article/details/78763421

Reactor和Proactor  
- https://www.cnblogs.com/doit8791/p/7461479.html
- https://www.jianshu.com/p/96c0b04941e2
- https://www.zhihu.com/question/26943938
- http://blog.jobbole.com/59676/
- https://segmentfault.com/a/1190000002715832

Reactor和NIO, Proactor和AIO
- https://www.cnblogs.com/itZhy/p/7727569.html
