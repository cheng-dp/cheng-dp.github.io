---
layout: post
title: AOP的实现原理(JDK动态代理和Cglib动态代理)
categories: [Spring]
description: AOP的实现原理(JDK动态代理和Cglib动态代理)
keywords: Spring
---


AOP实现的关键在于AOP框架自动创建的AOP代理。

## 代理原理

Spring AOP中的动态代理主要有两种方式，`JDK动态代理`和`CGLIB动态代理`。

CGLIB（Code Generation Library），是一个代码生成的类库，可以在运行时动态的生成某个类的子类，注意，CGLIB是通过继承的方式做的动态代理，因此如果某个类被标记为final，那么它是无法使用CGLIB做动态代理的。

### JDK动态代理

JDK动态代理在运行时由JDK动态实现，通过反射来接收被代理的类，并且要求被代理的类必须实现一个接口。JDK动态代理的核心是InvocationHandler接口和Proxy类。如果目标类没有实现接口，那么Spring AOP会选择使用CGLIB来动态代理目标类。==Java动态代理类位于java.lang.reflect包下==，InvocationHandler和Proxy是JDK动态代理机制中最重要的类和接口。

#### InvocationHandler

```java
public interface InvocationHandler {
    //proxy: 由动态代理动态生成的代理实例($proxy0)
    //method: 调用的方法
    //args: 方法的参数
    public Object invoke(Object proxy, Method method, Object[] args)
        throws Throwable;
}
```

InvocationHandler是一个接口，创建动态代理类时必须提供InvocationHandler的实现类，并实现invoke方法。

#### Proxy

Proxy提供了创建动态代理类和实例的静态方法，同时也是创建的代理类的父类。

```java
public class Proxy implements java.io.Serializable {
    //...
    //...
    public static Object newProxyInstance(ClassLoader loader, Class<?>[] interfaces, InvocationHandler h) throws IllegalArgumentException
    {
        //...
    }
    
    public static boolean isProxyClass(Class<?> cl) {
        return Proxy.class.isAssignableFrom(cl) && proxyClassCache.containsValue(cl);
    }
    
    public static InvocationHandler getInvocationHandler(Object proxy)
        throws IllegalArgumentException
    {
        //...
    }
    //...
    //...
}
```

#### 使用实例

接口：
```java
public interface Subject
{

    public String SayHello(String name);

    public String SayGoodBye();
}
```

被代理的实例的类：
```java
public class RealSubject implements Subject
{

    public String SayHello(String name)
    {
        return "hello";
    }
 
    public String SayGoodBye()
    {
        return " good bye";
    }
}
```

InvocationHandler实现代理逻辑：
```java
/**
 * 每次生成动态代理类对象时都需要指定一个实现了该接口的调用处理器对象
 */
public class InvocationHandlerImpl implements InvocationHandler
{

    /**
     * 代理的真实对象
     */
    private Object subject;

    public InvocationHandlerImpl(Object subject)
    {
        this.subject = subject;
    }

    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable
    {
        //在代理真实对象前我们可以添加一些自己的操作
        System.out.println("Do something before method call...");

        System.out.println("Method:" + method);

        //当代理对象调用真实对象的方法时，其会自动的跳转到代理对象关联的handler对象的invoke方法来进行调用
        Object returnValue = method.invoke(subject, args);

        //在代理真实对象后我们也可以添加一些自己的操作
        System.out.println("Do something after method call...");

        return returnValue;
    }
}
```

Main方法：
```java
public class DynamicProxyDemonstration
{
    public static void main(String[] args)
    {
        //真实对象
        Subject realSubject = new RealSubject();
        
        /**
         * InvocationHandlerImpl 实现了 InvocationHandler 接口，并能实现方法调用从代理类到委托类的分派转发
         * 其内部通常包含指向委托类实例的引用，用于真正执行分派转发过来的方法调用.
         * 即：要代理哪个真实对象，就将该对象传进去，最后是通过该真实对象来调用其方法
         */
        InvocationHandler handler = new InvocationHandlerImpl(realSubject);
 
 
        ClassLoader loader = realSubject.getClass().getClassLoader();
        Class[] interfaces = realSubject.getClass().getInterfaces();//[Subject]
        /**
         * 该方法用于为指定类装载器、一组接口及调用处理器生成动态代理类实例
         */
        Subject subject = (Subject) ==Proxy.newProxyInstance(loader, interfaces, handler);==å
 
        System.out.println("动态代理对象的类型："+subject.getClass().getName());
 
        String hello = subject.sayHello("hello");
        System.out.println(hello);
        String goodbye = subject.SayGoodBye();
        System.out.println(goodbye);
    }
}
```

输出：
```
动态代理对象的类型：com.sun.proxy.$Proxy0
Do something before method call...
Method:public abstract java.lang.String test.Subject.SayHello(java.lang.String)
Do something after method call...
hello
Do something before method call...
Method:public abstract java.lang.String test.Subject.SayGoodbye()
Do something after method call...
goodbye
```

实例动态代理的实现：
1. 生成的动态代理对象subject的类型为com.sun.proxy.$Proxy0

Proxy.newProxyInstance在jvm运行时动态生成代理对象，该对象的类型也是动态生成的，该类型继承我们定义的接口、父类为Proxy，命名方式为：`$ + Proxy + 对象标号`。

2. 动态代理如何实现？

```
Subject subject = (Subject) Proxy.newProxyInstance(loader, interfaces, handler);
```

在newProxyInstance中，根据传入的ClassLoader, interfaces, InvocationHandler动态生成代理类字节码，创建代理类`com.sun.proxy.$Proxy0`。

1. 代理类继承Proxy，并实现给定接口(Subject)。
2. 代理类方法的调用最终会调用this.h.invoke(...)，也就是InvocationHandler的invoke方法。

```java
//由Proxy.newProxyInstance动态创建的字节码
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.lang.reflect.UndeclaredThrowableException;
import jiankunking.Subject;

public final class ProxySubject
  extends Proxy
  implements Subject
{
  private static Method m1;
  private static Method m3;
  private static Method m4;
  private static Method m2;
  private static Method m0;
  
  public ProxySubject(InvocationHandler paramInvocationHandler)
  {
    super(paramInvocationHandler);
  }
  
  public final boolean equals(Object paramObject)
  {
    try
    {
      return ((Boolean)this.h.invoke(this, m1, new Object[] { paramObject })).booleanValue();
    }
    catch (Error|RuntimeException localError)
    {
      throw localError;
    }
    catch (Throwable localThrowable)
    {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final String SayGoodBye()
  {
    try
    {
      return (String)this.h.invoke(this, m3, null);
    }
    catch (Error|RuntimeException localError)
    {
      throw localError;
    }
    catch (Throwable localThrowable)
    {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final String SayHello(String paramString)
  {
    try
    {
      return (String)this.h.invoke(this, m4, new Object[] { paramString });
    }
    catch (Error|RuntimeException localError)
    {
      throw localError;
    }
    catch (Throwable localThrowable)
    {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final String toString()
  {
    try
    {
      return (String)this.h.invoke(this, m2, null);
    }
    catch (Error|RuntimeException localError)
    {
      throw localError;
    }
    catch (Throwable localThrowable)
    {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final int hashCode()
  {
    try
    {
      return ((Integer)this.h.invoke(this, m0, null)).intValue();
    }
    catch (Error|RuntimeException localError)
    {
      throw localError;
    }
    catch (Throwable localThrowable)
    {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  static
  {
    try
    {
      m1 = Class.forName("java.lang.Object").getMethod("equals", new Class[] { Class.forName("java.lang.Object") });
      m3 = Class.forName("jiankunking.Subject").getMethod("SayGoodBye", new Class[0]);
      m4 = Class.forName("jiankunking.Subject").getMethod("SayHello", new Class[] { Class.forName("java.lang.String") });
      m2 = Class.forName("java.lang.Object").getMethod("toString", new Class[0]);
      m0 = Class.forName("java.lang.Object").getMethod("hashCode", new Class[0]);
      return;
    }
    catch (NoSuchMethodException localNoSuchMethodException)
    {
      throw new NoSuchMethodError(localNoSuchMethodException.getMessage());
    }
    catch (ClassNotFoundException localClassNotFoundException)
    {
      throw new NoClassDefFoundError(localClassNotFoundException.getMessage());
    }
  }
}
```

总结：

**因为JDK生成的最终真正的代理类，它继承自Proxy并实现了我们定义的Subject接口，在实现Subject接口方法的内部，通过反射调用了InvocationHandlerImpl的invoke方法。**

### CgLib动态代理

cglib是一个基于ASM的第三方字节码生成库，当要代理的对象没有实现任何接口时，Spring会改为使用cglib动态生成代理。

#### 实例

被代理类：
```java
public class HelloConcrete {
    public String sayHello(String str) {
        return "HelloConcrete: " + str;
    }
}
```

代理实现：

Enhancer属于cglib包。CGLIG中MethodInterceptor的作用跟JDK代理中的InvocationHandler很类似，都是方法调用的中转站。

```java
// CGLIB动态代理
// 1. 首先实现一个MethodInterceptor，方法调用会被转发到该类的intercept()方法。
class MyMethodInterceptor implements MethodInterceptor{
  ...
    @Override
    public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
        logger.info("You said: " + Arrays.toString(args));
        return proxy.invokeSuper(obj, args);
    }
}
// 2. 然后在需要使用HelloConcrete的时候，通过CGLIB动态代理获取代理对象。
Enhancer enhancer = new Enhancer();
enhancer.setSuperclass(HelloConcrete.class);
enhancer.setCallback(new MyMethodInterceptor());
 
HelloConcrete hello = (HelloConcrete)enhancer.create();
System.out.println(hello.sayHello("I love you!"));
```

输出：
```
You said: [I love you!]
HelloConcrete: I love you!
```

#### 实现分析

代理对象的类型信息：
```
class=class cglib.HelloConcrete$$EnhancerByCGLIB$$e3734e52
superClass=class HelloConcrete
interfaces: 
interface net.sf.cglib.proxy.Factory
```

代理对象的类型：`cglib.HelloConcrete$$EnhancerByCGLIB$$e3734e52`，表明被代理类为HelloConcrete，是有CGLIB进行增强代理，后接编号。

父类：HelloConcrete，代理类继承了被代理类。

接口：net.sf.cflib.proxy.Factory，CGLIB自己加入的接口，包含一些工具方法。

因为CGLIB通过子类继承的方式实现动态创建代理类，因此只能对非final类创建代理，且只能代理非final方法。

## Spring AOP的实现

### Spring AOP的代理机制

当类实现了接口时，Spring默认使用JDK动态代理，只有当类没有实现接口时，才使用cglib动态代理。原因：
1. cglib是第三方类库，不属于jdk本身。 (JDK Proxy中InvocationHandler和Proxy都属于java.lang.reflect)
2. 大多数java面向对象实现都是接口+Impl。

### ProxyFactory织入器

Spring中，使用ProxyFactory作为织入器。

1. 基于接口的代理

通过setInterfaces()方法明确告知ProxyFactory，我们对接口类型进行代理。当然，如果不使用setInterfaces()，ProxyFactory默认只要检测到目标类实现了相应的接口，就会进行基于接口的代理。

```java
MockTask task = new MockTask();
ProxyFactory weaver = new ProxyFactory(task);
weaver.setInterfaces(new Class[]{ITask.class});
NameMatchMethodPointcutAdvisor advisor = new NameMatchMethodPointcutAdevisor();
advisor.setMappedName("execute");
advisor.setAdvice(new PerformanceMethodInterceptor());
weaver.addAdvisor(advisor);
ITask proxyObject = (ITask)weaver.getProxy();
proxyObject.execute(null);
```

`Itask proxyObject`的实际类型:
```java
class $Proxy0
```

2. 基于类的代理

如果目标类没有实现任何接口，ProxyFactory默认进行基于类的代理，即CGLib。
```java
public class Executable{
    public void execute(){
        log.info("execute without any interface");
    }
}
```
```java
ProxyFactory weaver = new ProxyFactory(new Executable());
NameMatchMethodPointcutAdvisor advisor = new NameMatchMethodPointcutAdvisor();
advisor.setMappedName("execute");
advisor.setAdvice(new PerformanceMethodInterceptor());
weaver.addAdvisor(advisor);
Executable proxyObject = (Executable)weaver.getProxy();
proxyObject.execute();
```

`Executable proxyObject`的class：
```java
class ...Executable$$EnhancerByCGLIB$$9e62fc83
```

如果满足以下任意一种情况，ProxyFactory将进行基于类的代理：
1. 目标类没有实现任何接口。
2. ProxyFactory的proxyTargetClass设置为true。
3. ProxyFactory的optimize属性设置为true。

### ProxyFactory织入过程

`proxyFactory.getProxy()`最终得到代理对象：
```java
//ProxyFactory#getProxy
public Object getProxy() {
    return createAopProxy().getProxy();
}
```
createAopProxy()在ProxyCreatorSupport中：
```java
//ProxyCreatorSupport#createAopProxy
protected final synchronized AopProxy createAopProxy() {
    if (!this.active) {
        activate();
    }
    return getAopProxyFactory().createAopProxy(this);
}

//ProxyCreatorSupport#getAopPRoxyFactory
public AopProxyFactory getAopProxyFactory() {
    return this.aopProxyFactory;
}

//aopProxyFactory其实是在构造函数里创建的
public ProxyCreatorSupport() {
    this.aopProxyFactory = new DefaultAopProxyFactory();
}
```
也就是ProxyFactory的createAopProxy()通过父类ProxyCreatorSupport中的aopProxyFactory去创建AopProxy，父类构造函数中默认创建DefaultAopProxyFactory。

再看DefaultAopProxyFactory的createAopProxyFactory方法：
```java
public AopProxy createAopProxy(AdvisedSupport config) throws AopConfigException {
    if (config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config)) {
        Class targetClass = config.getTargetClass();
        if (targetClass == null) {
            throw new AopConfigException("TargetSource cannot determine target class: " +
                    "Either an interface or a target is required for proxy creation.");
        }
        if (targetClass.isInterface()) {
            return new JdkDynamicAopProxy(config);
        }
        return CglibProxyFactory.createCglibProxy(config);
    }
    else {
        return new JdkDynamicAopProxy(config);
    }
}
```
根据传入的AdvisedSupport判断生成CglibProxy还是JdkDynamicAopProxy。因为ProxyCreatorSupport也继承了AdvisedSupport，这里传入它本身。

在CglibProxyFactory和JdkDynamicAopProxy中就分别根据上面介绍的实现原理创建对应的Proxy。


### ProxyFactory实现分析

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/ProxyFactoryImplUML.png)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/AopProxyUML.png)

1. ProxyCreatorSupport继承AdvisedSupport，包含AopProxyFactory。
2. ProxyFactory继承ProxyCreatorSupport。构造函数中传入的Interfaces和Interceptor用于设置祖父类AdvisedSupport中的Advised部分。getProxy()方法通过父类包含的AopProxyFactory创建AopProxy。
3. AopProxyFactory根据AdvisedSupport部分包含的信息决定创建CgLibAopProxy还是JdkDynamicProxy。
4. 通过创建的CgLibAopProxy或者JdkDynamicProxy的getProxy方法得到最终proxy。


**ProxyFactory = AdvisedSupport(设置生成代理对象的相关信息) + AopProxyFactory(取得最终生成的代理对象)**

### ProxyFactory相关接口和类

#### ProxyCreatorSupport

```
Base class for proxy factories. Provides convenient access to a configurable AopProxyFactory.

```
继承AdvisedSupport，包含AopProxyFactory。

#### AopProxyFactory接口

AopProxyFactory包含在ProxyCreatorSupport中，如果在ProxyCreatorSupport的构造函数中没有指明AopProxyFactory，默认创建DefaultAopProxyFactory类。

**AopProxyFactory根据传入的AdvisedSupport实例提供的信息，决定生成什么类型的AopProxy实现**(ObjenesisCglibAopProxy/JdkDynamicAopProxy)。

```java
if(config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config)) {
    //创建并返回ObjenesisCglibAopProxy
} else {
    //创建并返回JdkDynamicAopProxy
}
```

#### AopProxy接口

Spring AOP框架针对不同的代理实现机制提供相应的AopProxy子类实现，如JdkDynamicAopProxy和CgLibAopProxy。

```java
public interface AopProxy{
    Object getProxy();
    Object getProxy(ClassLoader classLoader);
}
```

#### AdvisedSupport

AdvisedSupport承载着生成代理对象所需要的信息。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/AdvisedSupportUML.png)

1. ProxyConfig

记载生成代理对象的控制信息，如proxyTargetClass, optimize...

2. Advised

记载生成代理对象的具体信息，比如，针对哪些目标类生成代理对象、加入何种横切逻辑。`Spring AOP框架返回的代理对象都可以强制转型为Advised`。

可以直接使用Advised接口访问相应的代理对象所持有的Advisor，进行添加Advisor、移除Advisor等动作。


### ProxyFactoryBean(IoC和AOP的结合)

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/ProxyBeanAndProxyFactoryBean.png)

ProxyFactoryBean是IoC容器中的织入器，将AOP和IoC结合起来，在继承ProxyCreatorSupport的同时还实现了FactoryBean，使得ProxyFactoryBean能够被容器管理。

ProxyFactoryBean是一个FactoryBean(Proxy + FactoryBean)，因此，根据FactoryBean的定义，如果容器中某个对象依赖ProxyFactoryBean，那么它将会使用到ProxyFactoryBean的getObject()方法所返回的代理对象。

```java
//ProxyFactoryBean的getObject()方法逻辑
public Object getObject() throws BeansException {
    initializeAdvisorChain();
    if(isSingleton()) {
        return getSingletonInstance();
    } else {
        if(this.targetName == null) {
            logger.warn("Using non-singeton proxies with singleton targets is often undesirable,
            Enable prototype proxies by setting the 'targetName' property");
        }
        return newPrototypeInstance();
    }
}
```

### REFS
AOP
- https://blog.csdn.net/luanlouis/article/details/51155821
- https://www.cnblogs.com/5207/p/6055152.html
- https://juejin.im/post/5af3bd6f518825673954bf22

JDK动态代理
- http://www.cnblogs.com/xiaoluo501395377/p/3383130.html
- http://blog.jobbole.com/104433/

Spring中动态代理的创建(AOP创建)
- https://my.oschina.net/guangshan/blog/1797461
- 《Spring揭秘》学习笔记