---
layout: post
title: 静态内部类private static Class
categories: [Java]
description: 静态内部类private static Class
keywords: Java
---

在类中定义的`private static Class`为静态内部类。

Java中普通的顶级类不能使用static关键字修饰，只有内部类可以使用static修饰。

静态内部类不保有对外部类的引用，只能访问外部类的静态属性或方法。

静态内部类在初始化的时候可以单独存在，而普通内部类初始化必须通过外部类的实例。
```
StaticInnerClass static = new StaticInnerClass(); // correct

Users.StaticInnerClass static = new Users.StaticInnerClass(); // also correct

Users.CommonInnerClass common = new Users().new CommonInnerClass(); // need outer class object.
```

在定义一些内部辅助类时，为了使用方便、结构清晰，可以定义为private static Class, 如LinkedList或Tree中的Node类。
 
```
本文地址：https://cheng-dp.github.io/2018/07/17/private-static-class/
```
 
