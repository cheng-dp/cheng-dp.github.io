---
layout: post
title: Spring核心组件
categories: [Spring]
description: Spring核心组件
keywords: Spring
---

Core，Context和Beans是Spring的三大核心组件。

### Bean组件

Bean是Spring最核心的组件，实现了将对象通过配置文件的方式，由Spring来管理对象存储空间，生命周期的分配。通过依赖注入的方式，可以实现将对象注入到指定的业务逻辑类中。这些注入关系，由Ioc容器来管理。

Bean组件定义在Spring的org.springframework.beans包下，解决了Bean的定义、创建和解析。

#### Bean组件主要成员

1. BeanFactory

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanFactoryUML.png)

2. BeanDefinition

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanDefinitionUML.png)

3. BeanDefinitionReader

解析配置文件生成BeanDefinition。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanDefinitionReaderUML.png)

### Context组件

Context组件中包含ApplicationContext的定义和实现，是Spring IoC容器的最终实现，为Bean组件中定义的Bean数据及之间的关系提供生存、运行环境。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/ApplicationContextUML.png)

### Core组件

Core中是Spring 发现、建立和维护Bean之间关系的一揽子工具，实际上就是所需的Util。

Core的重要组成部分之一是Resource，Resource中定义了Spring对资源的包装和加载方式。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/ResourceUML.jpg)

### REFS

- https://segmentfault.com/a/1190000007356573