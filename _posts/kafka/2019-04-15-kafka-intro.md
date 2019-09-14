---
layout: post
title: Kafka的基本概念
categories: [Kafka]
description: Kafka的基本概念
keywords: Kafka
---

### Kafka登场

1. 消息(Message)和批次(Batch)

消息：Kafka的数据单元。

键：一个字节数组，是消息的一个可选的元数据。

批次：一组消息，属于同一个主题，消息被分批写入Kafka。

2. 模式(Schema)

Kafka默认使用Apache Avro作为序列化框架。

3. 主题(Topic)和分区(Partition)

Kafka的消息通过主题进行分类。==主题被分为若干个分区，一个分区就是一个提交日志。==

消息以追加的方式写入分区，以先入先出的顺序读取，由于一个主题一般包含几个分区，因此无法在整个主题范围内保证消息的顺序，但可以保证消息在单个分区内的顺序。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_topic_patition_message_write_sample.png)

4. 生产者(Producer)

生产者在默认情况下把消息均衡地分布到主题的所有分区上，并不关心特定消息会被写入到哪个分区。

在某些情况下，生产者会把消息直接写到指定的分区，这通常是通过消息键(Key)和分区器实现的，分区器为键生成一个散列值，并将其映射到指定的分区上。这样可以保证包含同一个键的消息会被写到同一个分区上。

生产者也可以使用自定义的分区器，根据不同的业务规则将消息映射到分区。

5. 消费者(Consumer)

消费者订阅一个或多个**主题**，并按照消息生成的顺序读取它们。消费者通过检查消息的**偏移量**来区分已经读取过的消息。

偏移量：是一个不断递增的整数值，在创建消息时，Kafka会把它添加到消息里。在给定的分区里，每个消息的偏移量都是唯一的。

6. 消费者群组(Consumer Group)

消费者是消费者群组的一部分，也就是说，会有一个或多个消费者共同读取一个主题。

群组保证 **每个分区只能被一个消费者使用。** 消费者与分区之间的映射通常被称为消费者对分区的所有权关系。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_consumer_group.png)

7. broker

一个独立的Kafka服务器被称为broker。

8. 集群(Cluster)

broker是集群的组成部分，每个集群都由一个broker同时充当了**集群控制器**的角色。

在集群中，一个分区从属于一个broker，该broker被称为分区的**首领**，一个分区可以分配给多个broker，这个时候会发生**分区复制**，这种复制机制为分区提供了消息冗余，如果有一个broker失效，其他broker可以接管领导权。不过，相关的消费者和生产者都要重新连接到新的首领。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/kafka_partition_copy.png)


