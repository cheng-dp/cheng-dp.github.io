---
layout: post
title: Kafka的消费者创建及配置
categories: [Kafka]
description: Kafka的消费者创建及配置
keywords: Kafka
---

## 分区分配

Kafka消费者从属于**消费者群组**，一个群组里的消费者订阅的是同一个主题，每个消费者接受主题**一部分分区**的消息。

每个消费者群组为内部的消费者自动分配主题的分区。

如果群组G1中只有一个消费者C1，C1将收到主题T1的全部4个分区。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_consumer_partition_assign_1.png)

如果群组G1中有两个消费者C1、C2，两个消费者将分别接收两个分区的消息。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_consumer_partition_assign_2.png)

如果群组G1有4个消费者，每个消费者分配一个分区。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_consumer_partition_assign_3.png)

如果群组G1有大于4个消费者，只有4个分区，==**多余的消费者将被闲置**==，不会接收到任何消息。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_consumer_partition_assign_4.png)

## 分区再均衡

分区所有权从一个消费者转移到另一个消费者，称为分区再均衡。

==消费者群组中消费者的加入、退出、崩溃等，都会造成分区再均衡，再均衡期间整个群组将不可用。==

## 群组协调器(GroupCoordinator)

在 kafka-0.10 版本，Kafka 在服务端引入了组协调器(GroupCoordinator)，每个Kafka Server启动时都会创建一个GroupCoordinator实例，用于管理部分消费者组和该消费者组下的每个消费者的消费偏移量。

同时在客户端引入了消费者协调器(ConsumerCoordinator)，每个消费者都会实例化一个ConsumerCoordinator，只是负责与该消费者对应的broker上的GroupCoordinator进行通信。

消费者通过向broker GroupCoordinator发送心跳维持它们和群组的从属关系以及它们对分区的所有权关系。

如果消费者心跳过期，群组协调器认为它已经死亡，就会触发一次再均衡。

## 分区分配的过程

消费者要加入群组时，它会向**群组协调器**发送一个JoinGroup请求，第一个加入群组的消费者将成为“群主”。

==群主从协调器那里获得群组的成员列表，并且负责给每一个消费者分配分区。==

分配完毕后，群组把分配情况列表发给群组协调器，协调器再发送给所有消费者。

每个消费者只能看到自己的分配信息，只有群主知道群组里所有消费者的分配信息。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_consumer_join_group.jpeg)

## 创建Kafka消费者

### 对象属性

1. bootstrap.servers

配置Kafka broker位置

2. key.deserializer

3. value.deserializer

4. group.id

```
Properties props = new Properties();
pros.put("bootstrap.servers", "broker1:9092,broker2:9092");
props.put("group.id","CountryCounter");
props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");

KafkaConsumer<String, String> consumer = new KafkaConsumer<String, String>(props);
```

### 订阅主题

```
consumer.subscribe(Collections.singletionList("customerCountries"));
consumer.subscribe("test.*");
```

### 轮询消息

```
try {
    while(true) { // 无线循环轮询
        ConsumerRecords<String, String> records = consumer.poll(100); // 读取一批数据。
        for(ConsumerRecord<String, String> record : records) {
            log.info(
                "topic={}, partition = {}, offset = {}, customer = {}, contry = {}", 
                record.topic(), record.partition(), record.offset(), record.key(), record.value()
            );
        }
    }
} finally {
    consumer.close(); // 推出前关闭消费者
}
```

1. ==消费者必须持续调用`poll`方法进行轮询，否则会被认为已经死亡，分区会被移交给群组里的其他消费者。==
2. `poll()`方法参数为超时时间，返回值为一个记录列表，包含主题、分区、偏移量、键值对信息。
3. 第一次查找群组协调器(GroupCoordinator)、加入群组、接收分区、接收分区再均衡、发送心跳包都是在`poll()`方法中完成的。
3. `close()`方法关闭消费者。关闭网络连接和socket，并立即触发一次**分区再均衡**，而不是等待群组协调器发现它不再发送心跳并认定它已经死亡。

## Kafka消费者配置

1. client.id 

表示消费者客户端

2. session.timeout.ms

指定消费者被认为死亡前与服务器断开连接的时间，默认为3s。

3. hearbeat.interval.ms

指定poll()方法向协调器发送心跳的时间间隔。

必须设置比session.timeout.ms小，通常为session.timeout.ms的三分之一。

2. fetch.min.bytes

指定消费者从服务器获取记录的最小字节数。

消费者向broker发送poll请求时，如果可用的数据量小于fetch.min.bytes，将等待。

3. fetch.max.wait.ms

设定2中可用数据量小于fetch.min.bytes时最大等待时间，默认是500ms。

4. max.partition.fetch.bytes

设定服务器从每个分区里返回给消费者的最大字节数，默认为1MB。

5. max.poll.records

控制消费者单词调用poll方法能够返回的最大记录数量。

6. receive.buffer.bytes和send.buffer.bytes

设置socket在读写数据时用到的TCP缓冲区大小，-1为使用系统默认值。

如果生产者或消费者与broker不在同一个数据中心，可以适当增大该值。

7. auto.offset.reset

指定消费者在读取一个没有偏移量的分区或者偏移量无效的情况(由于消费者长时间失效，包含偏移量的记录被删除)下如何处理。

latest：即从目前的最新记录开始读取。默认为latest。

earliest：从分区起始位置读取。

8. enable.auto.commit

指定消费者是否自动提交偏移量。默认为true。

9. auto.commit.interval.ms

自动提交偏移量的频率。

10. partition.assiginment.strategy

设置消费者分区分配策略，值为Range或RoundRobin。

### 消费者分区分配策略

#### Range Strategy

Range策略对 ==**每个主题**== 中的分区为消费者平均分配。

1. 对同一个主题的所有分区按照序号排序。

2. 对消费者按照字母序排序。

3. 将分区的个数除以消费者线程的总数决定每个消费者线程消费几个分区。

4. 如果除不尽，那么前面几个消费者线程将会多分配一个分区。

例子：

某个主题有11个分区，3个消费者C1, C2, C3.

C1将消费 0,1,2,3分区。

C2将消费 4,5,6,7分区。

c3将消费 8,9,10分区。

#### RoundRobin Strategy

RoundRobin对==所有主题的所有分区==按照HashCode的值排序，并按照RoundRobin风格为每个消费者线程逐个分配。

使用RoundRobin必须满足的条件：

1. 同一个消费者群组中所有消费者的num.streams必须相等。
2. 所有消费者订阅相同的主题。

例子：

有T1和T2两个主题，每个主题有3个分区，分区排序为T1-1, T1-2, T2-1, T2-2, T1-3, T2-3，消费者线程排序为C1-0, C1-1, C2-0，则分配结果为：

C1-0分配：T1-1, T1-3

C1-1分配：T1-2, T2-3

C2-0分配：T2-1

## 提交(Commit)和偏移量(Offset)

我们把更新分区当前位置的操作叫做**提交**。

消费者通过群组协调器(Group Coordinator)往Kafka中一个叫做`_consumer_offset`的特殊主题发送消息，消息里包含每个分区的偏移量。

当发生再均衡时，每个消费者可能分配到新的分区，为了能够继续之前的工作，消费者需要读取每个分区最后一次提交的偏移量，然后从偏移量指定的地方继续处理。
- 提交的偏移量 小于 客户端处理的最后一个消息的偏移量，消息会被重复处理。
- 提交的偏移量 大于 客户端处理的最后一个消息的偏移量，消息会被丢失。

因此，提交偏移量的方式非常重要。

### 自动提交偏移量(Auto Commit Offset)

- 设定enable.auto.commit = true。
- auto.commit.interval.ms = 5s，设置自动提交的时间间隔，单位为秒，默认为5秒。

自动提交虽然方便，当时无法进行精确控制，容易造成重复处理和丢失的情况。

### 同步提交当前偏移量(CommitSync)

`commitSync()`方法： 

提交由poll()方法返回的最新偏移量，提交成功后马上返回，提交失败抛出异常，只要没有发生不可恢复的错误，commitSync()方法会一直尝试直至成功。

```
while(true) {
    ConsumerRecords<String, String> records = comsumer.poll(100);
    for(ConsumerREcord<String, String> record : records) {
        // handle the records
    }
    try {
        consumer.commitSync(); // 提交最新偏移量
    } catch (CommitFailedException e) {
        log.error("commit fail", e);
    }
}
```

手动提交在处理records的循环中加入提交偏移量的请求，提交偏移量时需要阻塞等待broker返回，降低了程序的吞吐量。

### 异步提交当前偏移量

`commitAsync()`方法，异步发送偏移量提交请求，无需阻塞等到broker返回，支持回调。

```
while(true) {
    ComsumerRecords<String ,String> records = consumer.poll(100);
    for(ConsumerRecord<String, String> record : records) {
        // handle the record.
    }
    comsumer.commitAsync(new OffsetCommitCallback() { // 异步提交
        public void onComplete(Map<TopicPartition, OffsetAndMetadata> offsets, Exception e) {
            if (e != null) {
                log.error("Commit failed for offsets {}", offsets, e);
            }
        }
    });
}
```

==异步提交在失败后不会主动重试，因为此时可能有一个更大的偏移量已经完成提交。==

### 同步和异步组合提交

如果提交发生在关闭消费者时，或是再均衡时的最后一次提交，必须要保证提交成功，此时无法使用异步提交。

因此，通常会组合使用同步提交和异步提交，==对于正常处理循环中使用异步提交、在关闭和再均衡前使用同步提交。==

```
try {
    while (true) {
        ConsumerRecords<String ,String> records = consumer.poll(100);
        for(ConsumerRecord<String ,String> record : records) {
            // handle the records
        }
        consumer.commitAsync(); // 异步提交
    }
} catch (Exception e) {
    log.error("Exception", e);
} finally {
    try {
        consumer.commitSync(); // 在关闭前尝试同步提交。
    } finally {
        consumer.close();
    }
}
```

### 提交给定的偏移量

如果poll()方法返回一大批数据，需要处理很长时间，希望在处理每个数据时马上记录当前处理数据的偏移量，而不是处理完这批数据后再记录整批数据的偏移量。

commitSync()和commitAsync()允许添加`Map<TopicPartition, OffsetAndMetadata> map`作为参数，将分区的偏移量设置为给定的value值。

```
private Map<TopicPartion, OffsetAndMetadata> currentOffsets = new HashMap<>();

// 再均衡监听器，subscribe时注册，在发生再均衡时被回调。
private class HandleRebalance implements ConsumerRebalanceListener {
    
    // 在重新分配分区之后 和 消费者开始读取消息之前被调用。
    public void onPartitionsAssigned(Collection<TopicPartition> partitions) {}
    
    // 在再均衡开始之前和消费者停止读取消息之后被调用。
    public void onPartitionsRevoked(Collection<TopicPartion> partitions) {
        log.info("Lost partitions in rebalance, Committing current offsets:" + currentOffsets);
        consumer.commitSync(currentOffsets);
    }
}

int count = 0;

try {
    consumer.subscribe(topics, new HandleRebalance());
    while(true) {
        ConsumerRecords<String ,String> records = consumer.poll(100);
        for(ConsumerRecord<String ,String> record : records) {
            // handle the records
            
            currentOffsets.put(new TopicPartition(record.topic(), record.partition()), new OffsetAndMetadata(record.offset() + 1, "no metadata"));
            if(count % 1000 == 0) { // 每处理1000个records提交一次偏移量。
                consumer.commitAsync(currentOffsets, null);
                currentOffsets.clear();
            }
            count++;
            
        }
    }
} catch(WakeupException e) {
    
} catch (Exception e) {
    log.error("Unexcepted error", e);
} finally{
    try {
        consumer.commitSync(currentOffsets);
    } finally {
        consumer.close();
    }
}


```

### 从特定偏移量开始读取

```
KafkaConsumer:

public void seek(TopicPartition partition, long offset); // 为指定分区设置当前偏移量。
```

### 退出

==如果确定要退出循环，需要通过另一个线程调用consumer.wakeup()方法。== 如果循环运行在主线程里，可以在ShutdownHook里调用该方法。

```
consumer.wakeup()
```
方法是消费者唯一一个可以从其他线程里安全调用的方法，调用consumer.wakeup()可以使得主线程退出poll()并抛出WakeupException异常。

## 独立消费者 -- 没有群组的消费者

有时可能只需要一个消费者从一个主题的所有分区或者某个特定的分区读取数据，无需消费者群组和再均衡，只需要把主题或者分区分配给消费者，然后开始读取消息并提交偏移量。

==不需要订阅主题，而是为自己直接分配分区。==

```
List<PartitionInfo> partitionInfos = null;
partitionInfos = consumer.partitionsFor("TheTopic"); // 得到主题的所有分区。

if(partitionInfos != null) {
    for(PartitionInfo partition : partitionInfos) {
        partitions.add(new TopicPartition(partition.topic(), partition.partition()));
    }
    consumer.assign(partitions); // 将分区全部分配给消费者。
}
```
 
```
本文地址：https://cheng-dp.github.io/2019/04/20/Kafka-consumer/
```
 
