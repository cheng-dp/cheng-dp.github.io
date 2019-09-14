---
layout: post
title: GetBean过程及SingletonBean实现
categories: [Spring]
description: GetBean过程及SingletonBean实现
keywords: Spring
---

### Spring 的单例实现原理

Spring采用==单例注册表==的方式维护容器中的所有单例，单例注册表通过`ConcurrentHashMap`实现。
```java
/** Cache of singleton objects: bean name to bean instance. */
private final Map<String, Object> singletonObjects = new ConcurrentHashMap<>(256);
```

**GetBean**的过程：

AbstractBeanFactory.doGetBean(...)
```java
public abstract class AbstractBeanFactory extends FactoryBeanRegistrySupport implements ConfigurableBeanFactory {

    @SuppressWarnings("unchecked")
    protected <T> T doGetBean(
            final String name, final Class<T> requiredType, final Object[] args, boolean typeCheckOnly)
            throws BeansException {
        // 对 Bean 的 name 进行处理，防止非法字符
        final String beanName = transformedBeanName(name);
        Object bean;
        // 从单例注册表中检查是否存在单例缓存
        Object sharedInstance = getSingleton(beanName);
        if (sharedInstance != null && args == null) {
            // ...忽略代码
            // 返回缓存实例 
            bean = getObjectForBeanInstance(sharedInstance, name, beanName, null);
        }
        else {
            // ...忽略代码
            try {
                // ...忽略代码

                // 单例模式，处理分支
                if (mbd.isSingleton()) {
                    sharedInstance = getSingleton(beanName, new ObjectFactory<Object>() {
                        @Override
                        public Object getObject() throws BeansException {
                            try {
                                return createBean(beanName, mbd, args);
                            }
                            catch (BeansException ex) {
                                // ...忽略代码
                            }
                        }
                    });
                    bean = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
                }
                // 原型模式，处理分支
                else if (mbd.isPrototype()) {

                }
                // 其他
                else {

                }
            }
            catch (BeansException ex) {
                // ...忽略代码
            }
        }
        return (T) bean;
    }
}
```

DefaultSingletonBeanRegistry.getSingleton(...)

```java
public class DefaultSingletonBeanRegistry extends SimpleAliasRegistry implements SingletonBeanRegistry {

    // 通过 Map 实现单例注册表
    private final Map<String, Object> singletonObjects = new ConcurrentHashMap<String, Object>(64);

    public Object getSingleton(String beanName, ObjectFactory<?> singletonFactory) {
        Assert.notNull(beanName, "'beanName' must not be null");
        synchronized (this.singletonObjects) {
            // 检查缓存中是否存在实例  
            Object singletonObject = this.singletonObjects.get(beanName);
            if (singletonObject == null) {
                // ...忽略代码
                try {
                    singletonObject = singletonFactory.getObject();
                }
                catch (BeanCreationException ex) {
                    // ...忽略代码
                }
                finally {
                    // ...忽略代码
                }
                // 如果实例对象在不存在，我们注册到单例注册表中。
                addSingleton(beanName, singletonObject);
            }
            return (singletonObject != NULL_OBJECT ? singletonObject : null);
        }
    }

    protected void addSingleton(String beanName, Object singletonObject) {
        synchronized (this.singletonObjects) {
            this.singletonObjects.put(beanName, (singletonObject != null ? singletonObject : NULL_OBJECT));

        }
    }
}
```

- https://juejin.im/post/594084fd61ff4b006cb425f1


### Spring如何自定义注解实现功能

1. 在Aspect中利用@annotation join-point.
2. 使用反射获取注册method.getAnnotation()