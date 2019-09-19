---
layout: post
title: Bean的生命周期管理及扩展点
categories: [Spring]
description: Bean的生命周期管理及扩展点
keywords: Spring
---

### Bean生命周期(Bean LifeCycle)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanLifeCycleOfBeanFactory.png)


下图中有一个错误：  

ApplicationContextAware的setApplicationContext()是通过BeanPostProcessor的方式调用的，而不是init-bean时直接调用。

在ApplicationContext的refresh()中会调用prepareBeanFactory(beanFactory)，其中会插入ApplicationContextAwarePostProcessor。详见《ApplicationContext基本实现》。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanLifeCycleTwo.jpg)

##### Bean生命周期流程

1. ApplicationContext实例化所有Singleton且非lazy-init的Bean。
2. 根据配置填充属性。
3. 根据Aware接口，填充BeanName, BeanFactory (其实也属于填充属性) 『ApplicationContextAware是通过ApplicationContextAwarePostProcessor填充』。
4. BeanPostProcess.postProcessBeforeInitialization()。
5. @PostConstructor
5. InitializingBean.afterPropertiesSet()。
6. init-method。
7. BeanPostProcess.postProcessAfterInitialization()。
8. READY
9. @PreDestroy
9. DisposableBean.destroy()。
10. destroy-method。
(Aware接口，InitializingBean/DisposableBean，init-method/destroy-method/BeanPostProcess)。

Spring只管理Singleton的Bean的完整生命周期，==对于prototype的bean，Spring创建好交给使用者后不再继续管理。==

除了BeanPostProcessor外，Spring提供的Bean生命周期扩展点，按调用顺序：
1. @PostConstructor/@PreDestroy.
2. InitializingBean/DisposableBean.
3. @Bean(initMethod = "myInit", destroyMethod = "myDestroy")

BeanPostProcessor针对的是所有的Bean，在Spring创建Bean后提供定制化的逻辑(初始化、依赖解析等)。

##### 代码演示

Bean:
```java
public class Person implements BeanFactoryAware, BeanNameAware, InitializingBean, DisposableBean, ApplicationContextAware {

    private String name;

    private BeanFactory beanFactory;

    private ApplicationContext applicationContext;

    private String beanName;

    public Person() {
        log("call Person Constructor");
    }

    public String getName() {
        return name;
    }

    public void setName(String n) {
        this.name = n;
        log("call Person.setName");
    }

    @Override
    public String toString() {
        return "Person name=" + this.name;
    }

    public void setBeanFactory(BeanFactory beanFactory) throws BeansException {
        this.beanFactory = beanFactory;
        log("call BeanFactoryAware.setBeanFactory");
    }

    public void setBeanName(String s) {
        this.beanName = s;
        log("call BeanNameWare.setBeanName");
    }

    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        this.applicationContext = applicationContext;
        log("call ApplicationContextAware.setApplicationContext");
    }

    public void destroy() throws Exception {
        log("Call DisposibleBean.destroy");
    }

    public void afterPropertiesSet() throws Exception {
        log("call InitializingBean.afterPropertiesSet");
    }

    public void myInit() {
        log("Call init-method myInit");
    }

    public void myDestroy() {
        log("Call destroy-method myDestroy");
    }

    @PostConstruct
    public void postConstructor() {
        log("Call postConstructor");
    }

    @PreDestroy
    public void preDestroy() {
        log("Call preDestroy");
    }

    private void log(String s) {
        System.out.println(s);
    }
}
```

BeanPostProcessor:
```java
public class MyBeanPostProcessorOne implements BeanPostProcessor {
    public MyBeanPostProcessorOne() {
        super();
        log("BeanPostProcessorOne Constructor");
    }

    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
        log("call BeanPostProcessorOne.postProcessAfterInitialization");
        return bean;
    }

    public Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {
        log("call BeanPostProcessorOne.postProcessBeforeInitialization");
        return bean;
    }

    private void log(String str) {
        System.out.println(str);
    }
}

public class MyBeanPostProcessorTwo implements BeanPostProcessor {
    public MyBeanPostProcessorTwo() {
        super();
        log("BeanPostProcessorTwo Constructor");
    }

    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
        log("call BeanPostProcessorTwo.postProcessAfterInitialization");
        return bean;
    }

    public Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {
        log("call BeanPostProcessorTwo.postProcessBeforeInitialization");
        return bean;
    }

    private void log(String str) {
        System.out.println(str);
    }
}
```

BeanFactoryPostProcessor:
```java
public class MyBeanFactoryPostProcessor implements BeanFactoryPostProcessor {

    public MyBeanFactoryPostProcessor() {
        super();
        log("call BeanFactoryPostProcessor Constructor");
    }

    public void postProcessBeanFactory(ConfigurableListableBeanFactory configurableListableBeanFactory) throws BeansException {
        log("call BeanFactoryPostProcessor.postProcessBeanFactory");
    }

    private void log(String str) {
        System.out.println(str);
    }
}
```

Config:
```java
@Configuration
public class Config {

    @Bean(initMethod = "myInit", destroyMethod = "myDestroy]",name="person")
    @Scope("singleton")
    public Person person() {
        Person person = new Person();
        person.setName("person");
        return person;
    }

    @Bean
    public MyBeanPostProcessorOne myBeanPostProcessorOne() {
        return new MyBeanPostProcessorOne();
    }

    @Bean
    public MyBeanPostProcessorTwo myBeanPostProcessorTwo() {
        return new MyBeanPostProcessorTwo();
    }

    @Bean
    public MyBeanFactoryPostProcessor myBeanFactoryPostProcessor() {
        return new MyBeanFactoryPostProcessor();
    }
}
```

Main:
```java
public class Main {

    public static void main(String[] args) {
        log("init container now");
        ApplicationContext factory = new AnnotationConfigApplicationContext(Config.class);
        log("init container success");
        Person person = factory.getBean("person",Person.class);
        log(person.toString());
        log("close container now");
        ((AnnotationConfigApplicationContext)factory).registerShutdownHook();
    }

    private static void log(String str) {
        System.out.println(str);
    }
}
```

输出：
```java
init container now
call BeanFactoryPostProcessor Constructor
call BeanFactoryPostProcessor.postProcessBeanFactory
BeanPostProcessorOne Constructor
BeanPostProcessorTwo Constructor
call Person Constructor
call Person.setName
call BeanNameWare.setBeanName
call BeanFactoryAware.setBeanFactory
call ApplicationContextAware.setApplicationContext
call BeanPostProcessorOne.postProcessBeforeInitialization
call BeanPostProcessorTwo.postProcessBeforeInitialization
Call postConstructor
call InitializingBean.afterPropertiesSet
Call init-method myInit
call BeanPostProcessorOne.postProcessAfterInitialization
call BeanPostProcessorTwo.postProcessAfterInitialization
init container success
Person name=person
close container now
Call preDestroy
Call DisposibleBean.destroy
Call destroy-method myDestroy
```

### REFS

- https://docs.spring.io/spring/docs/3.1.x/spring-framework-reference/htmlsingle/spring-framework-reference.html#beans-factory-lifecycle-combined-effects
- https://www.cnblogs.com/zrtqsk/p/3735273.html
- https://www.jianshu.com/p/3944792a5fff
- http://bridgeforyou.cn/2018/06/16/BeanPostProcessor/
 
```
本文地址：https://cheng-dp.github.io/2019/03/01/bean-life-cycle/
```
 
