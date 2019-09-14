---
layout: post
title: BeanFactory基本实现
categories: [Spring]
description: BeanFactory基本实现
keywords: Spring
---


#### 依赖查找(DL)和依赖注入(DI)

IoC 主要由两种实现逻辑，依赖查找(Dependency Lookup,DL)和依赖注入(Dependency Injection,DI)。DL需要用户自己去是使用 API 进行查找资源和组装对象，已经被抛弃。Spring中使用的是DI。

### BeanDefinition

在Spring中，Bean对象在Spring的实现中是以BeanDefinition描述的。是Bean创建的药方。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanDefinitionUML.png)

```java
public interface BeanDefinition extends AttributeAccessor, BeanMetadataElement {
    String SCOPE_SINGLETON = "singleton";
    String SCOPE_PROTOTYPE = "prototype";
    int ROLE_APPLICATION = 0;
    int ROLE_SUPPORT = 1;
    int ROLE_INFRASTRUCTURE = 2;

    void setParentName(String var1);

    String getParentName();

    void setBeanClassName(String var1);

    String getBeanClassName();

    void setScope(String var1);

    String getScope();

    void setLazyInit(boolean var1);

    boolean isLazyInit();

    void setDependsOn(String... var1);

    String[] getDependsOn();

    void setAutowireCandidate(boolean var1);

    boolean isAutowireCandidate();

    void setPrimary(boolean var1);

    boolean isPrimary();

    void setFactoryBeanName(String var1);

    String getFactoryBeanName();

    void setFactoryMethodName(String var1);

    String getFactoryMethodName();

    ConstructorArgumentValues getConstructorArgumentValues();

    MutablePropertyValues getPropertyValues();

    boolean isSingleton();

    boolean isPrototype();

    boolean isAbstract();

    int getRole();

    String getDescription();

    String getResourceDescription();

    BeanDefinition getOriginatingBeanDefinition();
}
```

### BeanDefinitionReader

Bean的信息需要以流的形式从配置中读入内存，再解析为BeanDefinition。BeanDefinitionReader完成该读取和解析过程。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanDefinitionReaderUML.png)

```java
public interface BeanDefinitionReader {
    BeanDefinitionRegistry getRegistry();

    ResourceLoader getResourceLoader();

    ClassLoader getBeanClassLoader();

    BeanNameGenerator getBeanNameGenerator();

    int loadBeanDefinitions(Resource var1) throws BeanDefinitionStoreException;

    int loadBeanDefinitions(Resource... var1) throws BeanDefinitionStoreException;

    int loadBeanDefinitions(String var1) throws BeanDefinitionStoreException;

    int loadBeanDefinitions(String... var1) throws BeanDefinitionStoreException;
}
```

### Resource 

Resource接口是Spring中所有资源的抽象访问接口。最主要的实现类如`ClassPathResource`。

```java
public interface Resource extends InputStreamSource {
    boolean exists();

    boolean isReadable();

    boolean isOpen();

    URL getURL() throws IOException;

    URI getURI() throws IOException;

    File getFile() throws IOException;

    long contentLength() throws IOException;

    long lastModified() throws IOException;

    Resource createRelative(String var1) throws IOException;

    String getFilename();

    String getDescription();
}
```

### BeanFactory

#### 定义

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/BeanFactoryUML.png)

Spring Bean的创建是典型的工厂模式，这一系列的Bean工厂，也即IOC容器为开发者管理对象间的依赖关系提供了很多便利和基础服务，其接口的相互关系如下：

BeanFactory是Spring中IoC容器的最基本接口，定义了IoC容器的基本行为。

BeanFactory有三个子接口：
1. ListableBeanFactory，表示Bean是可列表的。
2. HierarchicalBeanFactory，表示Bean是有继承关系的。
3. AutowireCapableBeanFactory，定义Bean的自动装配规则。

```
// ListableBeanFactory
public interface ListableBeanFactory extends BeanFactory {
    boolean containsBeanDefinition(String var1);
    int getBeanDefinitionCount();
    String[] getBeanDefinitionNames();
    String[] getBeanNamesForType(ResolvableType var1);
    String[] getBeanNamesForType(Class<?> var1);
    String[] getBeanNamesForType(Class<?> var1, boolean var2, boolean var3);
    <T> Map<String, T> getBeansOfType(Class<T> var1) throws BeansException;
    <T> Map<String, T> getBeansOfType(Class<T> var1, boolean var2, boolean var3) throws BeansException;
    String[] getBeanNamesForAnnotation(Class<? extends Annotation> var1);
    Map<String, Object> getBeansWithAnnotation(Class<? extends Annotation> var1) throws BeansException;
    <A extends Annotation> A findAnnotationOnBean(String var1, Class<A> var2) throws NoSuchBeanDefinitionException;
}
// AutowireCapableBeanFactory
public interface AutowireCapableBeanFactory extends BeanFactory {
    int AUTOWIRE_NO = 0;
    int AUTOWIRE_BY_NAME = 1;
    int AUTOWIRE_BY_TYPE = 2;
    int AUTOWIRE_CONSTRUCTOR = 3;

    <T> T createBean(Class<T> var1) throws BeansException;
    void autowireBean(Object var1) throws BeansException;
    Object configureBean(Object var1, String var2) throws BeansException;
    Object createBean(Class<?> var1, int var2, boolean var3) throws BeansException;
    Object autowire(Class<?> var1, int var2, boolean var3) throws BeansException;
    void autowireBeanProperties(Object var1, int var2, boolean var3) throws BeansException;
    void applyBeanPropertyValues(Object var1, String var2) throws BeansException;
    Object initializeBean(Object var1, String var2) throws BeansException;
    Object applyBeanPostProcessorsBeforeInitialization(Object var1, String var2) throws BeansException;
    Object applyBeanPostProcessorsAfterInitialization(Object var1, String var2) throws BeansException;
    void destroyBean(Object var1);
    <T> NamedBeanHolder<T> resolveNamedBean(Class<T> var1) throws BeansException;
    Object resolveDependency(DependencyDescriptor var1, String var2) throws BeansException;
    Object resolveDependency(DependencyDescriptor var1, String var2, Set<String> var3, TypeConverter var4) throws BeansException;
}
// HierarchicalBeanFactory
public interface HierarchicalBeanFactory extends BeanFactory {
    BeanFactory getParentBeanFactory();
    boolean containsLocalBean(String var1);
}
```


==最终的默认实现类是 DefaultListableBeanFactory==，实现了所有的接口。

//描述BeanFactory的定义。

```java
//BeanFactory定义
public interface BeanFactory {
    String FACTORY_BEAN_PREFIX = "&";

    Object getBean(String var1) throws BeansException;

    <T> T getBean(String var1, Class<T> var2) throws BeansException;

    Object getBean(String var1, Object... var2) throws BeansException;

    <T> T getBean(Class<T> var1) throws BeansException;

    <T> T getBean(Class<T> var1, Object... var2) throws BeansException;

    boolean containsBean(String var1);

    boolean isSingleton(String var1) throws NoSuchBeanDefinitionException;

    boolean isPrototype(String var1) throws NoSuchBeanDefinitionException;

    boolean isTypeMatch(String var1, ResolvableType var2) throws NoSuchBeanDefinitionException;

    boolean isTypeMatch(String var1, Class<?> var2) throws NoSuchBeanDefinitionException;

    Class<?> getType(String var1) throws NoSuchBeanDefinitionException;

    String[] getAliases(String var1);
}
```

在BeanFactory接口的定义中，只定义了IoC容器的基本行为，具体的Bean加载行为由实现定义。

#### BeanFactory初始化及bean加载

IoC容器的初始化包括BeanDefinition的Resource定位、载入和注册这三个基本的过程。

以XmlBeanFactory为例：
```java
 public class XmlBeanFactory extends DefaultListableBeanFactory{
     
     private final XmlBeanDefinitionReader reader; 
 
     public XmlBeanFactory(Resource resource)throws BeansException{
         this(resource, null);
     }
     
     public XmlBeanFactory(Resource resource, BeanFactory parentBeanFactory)
          throws BeansException{
         super(parentBeanFactory);
         this.reader = new XmlBeanDefinitionReader(this);
         this.reader.loadBeanDefinitions(resource);
    }
 }
```

```java
//根据Xml配置文件创建Resource资源对象，该对象中包含了BeanDefinition的信息
 ClassPathResource resource =new ClassPathResource("application-context.xml");
//创建DefaultListableBeanFactory
 DefaultListableBeanFactory factory =new DefaultListableBeanFactory();
//创建XmlBeanDefinitionReader读取器，用于载入BeanDefinition。之所以需要BeanFactory作为参数，是因为会将读取的信息回调配置给factory
 XmlBeanDefinitionReader reader =new XmlBeanDefinitionReader(factory);
//XmlBeanDefinitionReader执行载入BeanDefinition的方法，最后会完成Bean的载入和注册。完成后Bean就成功的放置到IOC容器当中，以后我们就可以从中取得Bean来使用
 reader.loadBeanDefinitions(resource);
 Foo foo = factory.getBean("foo",Foo.class);
```

### getBean发生了什么？？？？？

### BeanFactory和ApplicationContext

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/ApplicationContextAndBeanFactory.png)

BeanFactory只定义了IoC容器的基本功能，是Spring框架的基础设施，面向Spring本身。

ApplicationContext继承了BeanFactory，也是IoC容器，此外还继承了MessageSource、ApplicationEventPublisher、ResourcePatternResolver等接口，具有信息源配置、资源获取、应用事件等等功能。ApplicationContext不只是Bean的工厂，而是“应用上下文”，代表着整个大容器的所有功能，面向使用Spring框架的开发者。

### REFS
- http://www.cnblogs.com/ITtangtang/p/3978349.html
- https://juejin.im/post/5abe75f351882577b45f2336
- https://www.jianshu.com/p/17b66e6390fd