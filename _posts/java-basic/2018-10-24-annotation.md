---
layout: post
title: Java自定义注解
categories: [Java]
description: Java自定义注解
keywords: Java
---

### 什么是注解

注解是一种描述源代码的元数据。

### 为什么引入注解

1. 代码元数据和代码紧耦合

使用Annotation之前(甚至在使用之后)，XML被广泛的应用于描述元数据。不知何时开始一些应用开发人员和架构师发现XML的维护越来越糟糕了。他们希望使用一些和代码紧耦合的东西，而不是像XML那样和代码是松耦合的(在某些情况下甚至是完全分离的)代码描述。


2. 形成标准

另一个很重要的因素是Annotation定义了一种标准的描述元数据的方式。在这之前，开发人员通常使用他们自己的方式定义元数据。例如，使用标记interfaces，注释，transient关键字等等。每个程序员按照自己的方式定义元数据，而不像Annotation这种标准的方式。

目前，许多框架将XML和Annotation两种方式结合使用，平衡两者之间的利弊。

### 如何定义注解

java.lang.annotation提供了四种元注解，专门注解其他的注解：

**@Documented**: 是否将注解信息添加在java文档中。

**@Retention**: 定义注解的生命周期，什么时候使用该注解。

- RetentionPolicy.SOURCE

只存在于源代码中，编译后被丢弃，不会写入Class文件。  
@Override, @SuppressWarnings都属于这类注解。

- RetentionPolicy.CLASS

存在于Class文件中，在类加载的时候丢弃，不会写入JVM中。  
如未标注@Retention，默认为RetentionPolicy.CLASS。

RetentionPolicy.CLASS在日常开发中不常用，主要用于需要处理Class字节码的程序中，如`Bytecode Engineering Library`或`Google Guava`。

- RetentionPolicy.RUNTIME

始终不会丢弃，运行期也保留该注解，因此可以**使用反射机制**读取该注解的信息。  
自定义的注解通常使用这种方式。

**@Target?**: 注解用于什么地方，如果不明确指出，该注解可以放在任何地方。

- ElementType.TYPE:用于描述类、接口或enum声明
- ElementType.FIELD:用于描述实例变量
- ElementType.METHOD
- ElementType.PARAMETER
- ElementType.CONSTRUCTOR
- ElementType.LOCAL_VARIABLE
- ElementType.ANNOTATION_TYPE 另一个注解
- ElementType.PACKAGE 用于记录java文件的package信息

**@Inherited**: 是否允许子类继承该注解。

标注了@Inherited的注解的类，其所有子类都被视作标注了该注解。



### 注解处理器(AnnotationProcessor)

注解处理器是一个在javac中的，用来编译时扫描和处理的注解的工具。你可以为特定的注解，注册你自己的注解处理器。


一个注解的注解处理器，以Java代码（或者编译过的字节码）作为输入，生成文件（通常是.java文件）作为输出。

**AbstarctProcessor**是注解处理器的基类，每一个注解处理器都需要继承该类。继承AbstractProcessor并实现注解处理器后，将新处理器注册到javac中，就能在编译时利用该处理器处理特定注解。

详情参阅REFS。


### REFS
- http://www.importnew.com/10294.html
- https://stackoverflow.com/questions/3849593/java-annotations-looking-for-an-example-of-retentionpolicy-class
注解处理器
- https://blog.csdn.net/HaveFerrair/article/details/52182927
- https://blog.csdn.net/xfxyy_sxfancy/article/details/44275549
 
```
本文地址：https://cheng-dp.github.io/2018/10/24/annotation/
```
 
