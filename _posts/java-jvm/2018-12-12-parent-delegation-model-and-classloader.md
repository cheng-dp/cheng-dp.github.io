---
layout: post
title: 双亲委派模型和自定义类加载器
categories: [Java, JVM]
description: 双亲委派模型和自定义类加载器
keywords: Java, JVM
---


### 加载类的开放性

在类加载的第一个阶段“加载”中，需要通过一个类的全限定名来获取定义此类的二进制字节流，完成这个动作的代码块就是**类加载器**。这一动作是放在虚拟机外部实现的，应用程序可以自己决定如何获取所需的类，可以从ZIP包中读取(JAR,EAR,WAR)、从网络中获取(Applet)、运行时计算生成(动态代理)、其他文件生成(JSP)。

### 类加载器与类的唯一性

对于任意一个类，都需要由加载它的类加载器和这个类本身共同确立其在Java虚拟机中的唯一性。

### 双亲委派模型(Parents Delegation Model)

从开发者的角度，类加载器分为：
1. 启动类加载器(Bootstrap):
    使用C++语言实现(HotSpot虚拟机中)，是虚拟机自身的一部分。
    负责将 Java_Home/lib下面的类库加载到内存中(比如rt.jar)。
    开发者无法直接获取到启动类加载器的引用，不允许直接通过引用进行操作。

2. 扩展类加载器(Extension):。
    负责将Java_Home /lib/ext或者由系统变量java.ext.dir指定位置中的类库加载到内存中。
    开发者可以直接使用扩展类加载器。

3. 应用程序类加载器(Application):
    负责将系统类路径（CLASSPATH）中指定的类库加载到内存中。
    开发者可以直接使用应用程序类加载器。
    由于这个类加载器是ClassLoader中的getSystemClassLoader()方法的返回值，因此一般称为系统（System）加载器。

除此之外，还有自定义的类加载器，它们之间的层次关系被称为类加载器的双亲委派模型。该模型要求除了顶层的启动类加载器外，其余的类加载器都应该有自己的父类加载器，而这种父子关系**一般通过组合（Composition）关系来实现**，而不是通过继承（Inheritance）。

注意，双亲委派模型是Java设计者推荐的类加载器实现方式，**并不是强制的**。如JDK中线程上下文类加载器就破坏了双亲委派模型。

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/%E5%8F%8C%E4%BA%B2%E5%A7%94%E6%B4%BE%E6%A8%A1%E5%9E%8B)

#### 过程

某个特定的类加载器在接到加载类的请求时，首先将加载任务委托给父类加载器，依次递归，如果父类加载器可以完成类加载任务，就成功返回；只有父类加载器无法完成此加载任务时，才自己去加载。

#### 好处

1. Java类随着它的类加载器一起具备了一种带有优先级的层次关系。
2. 防止内存中出现多份同样的字节码。
    例如：java.lang.System由bootstrap加载器加载，如果类A也要加载System，也会从bootstrap加载器开始，此时发现bootstrap已经加载过了java.lang.System，那么直接返回内存中的java.lang.System。
3. 确保Java核心类库的安全。防止出现多个版本不兼容的同名类。


### 自定义类加载器

#### loadClass实现
```java
public Class<?> loadClass(String name) throws ClassNotFoundException {
        return loadClass(name, false);
}

protected Class<?> loadClass(String name, boolean resolve)
    throws ClassNotFoundException
{
    synchronized (getClassLoadingLock(name)) {
        // First, check if the class has already been loaded
        Class c = findLoadedClass(name);
        if (c == null) {
            long t0 = System.nanoTime();
            try {
                if (parent != null) {
                    c = parent.loadClass(name, false);
                } else {
                    c = findBootstrapClassOrNull(name);
                }
            } catch (ClassNotFoundException e) {
                // ClassNotFoundException thrown if class not found
                // from the non-null parent class loader
            }

            if (c == null) {
                // If still not found, then invoke findClass in order
                // to find the class.
                long t1 = System.nanoTime();
                c = findClass(name);

                // this is the defining class loader; record the stats
                sun.misc.PerfCounter.getParentDelegationTime().addTime(t1 - t0);
                sun.misc.PerfCounter.getFindClassTime().addElapsedTimeFrom(t1);
                sun.misc.PerfCounter.getFindClasses().increment();
            }
        }
        if (resolve) {
            resolveClass(c);
        }
        return c;
    }
}
```
1. 检查制定名称的类是否已经加载。
2. 判断是否有父加载器，如果有则有父加载器加载(parent.loadClass(name,false))，或者调用bootstrap类加载器加载。
    由于bootstrap类加载器不是一个类，而是虚拟机的一部分，由C++实现，因此即使某加载器的父类加载器为bootstrap，parent也是null。  
    由bootstrap加载器加载的类，调用getClassLoader()返回值也是null。
3. 如果父加载器和bootstrap加载器都没有找到该类，则调用当前类加载器的findClass方法完成类加载。
    **自定义类加载器，重写findClass方法**

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/youdao_JavaFundation/%E8%87%AA%E5%AE%9A%E4%B9%89%E7%B1%BB%E5%8A%A0%E8%BD%BD%E5%99%A8)

#### 实现

1. 创建被load的实例类
```java
public class TestCase {

    public void hello(){
        System.out.println("I am loaded by " + getClass().getClassLoader().getClass());
    }
}
```
2. 编译得到class文件
`javac TestCase.java`

3. 实现自定义类加载器MyClassLoader
```java
import sun.tools.java.ClassNotFound;

import java.io.FileInputStream;
import java.lang.reflect.Method;

/**
 * Created by cdp on 2018/8/18.
 */
public class Main {
    static class MyClassLoader extends ClassLoader {
        private String classPath;

        public MyClassLoader(String classPath) {
            this.classPath = classPath;
        }

        private byte[] loadByte(String name) throws Exception {
            FileInputStream fis = new FileInputStream(classPath + "/" + name
                    + ".class");
            int len = fis.available();
            byte[] data = new byte[len];
            fis.read(data);
            fis.close();
            return data;

        }

        protected Class<?> findClass(String name) throws ClassNotFoundException {
            try {
                byte[] data = loadByte(name);
                return defineClass(name, data, 0, data.length);
            } catch (Exception e) {
                e.printStackTrace();
                throw new ClassNotFoundException();
            }
        }
    }

    public static void main(String args[]) throws Exception{
        MyClassLoader classLoader = new MyClassLoader("/Users/cdp/Desktop");
        Class clazz = classLoader.loadClass("TestCase");
        Object obj = clazz.newInstance();
        Method helloMethod = clazz.getDeclaredMethod("hello", null);
        helloMethod.invoke(obj, null);
    }
}

```

4. 运行输出结果
`I am loaded by class Main$MyClassLoader`

#### 破坏双亲委派模型

双亲委派很好地解决了各个类加载器的基础类的同一问题（越基础的类由越上层的加载器进行加载），基础类之所以称为“基础”，是因为它们总是作为被用户代码调用的API，但世事往往没有绝对的完美。

如果基础类又要调用回用户的代码，那该么办？

一个典型的例子就是==JNDI(Java Naming and Directory Interface)服务==，JNDI现在已经是Java的标准服务，
它的代码由启动类加载器去加载（在JDK1.3时放进去的rt.jar），但JNDI的目的就是对资源进行集中管理和查找，它需要调用由独立厂商实现并部署在应用程序的ClassPath下的JNDI接口提供者的代码，但启动类加载器不可能“认识”这些代码。

为了解决这个问题，Java设计团队只好引入了一个不太优雅的设计：**==线程上下文类加载器(Thread ContextClassLoader)==**。这个类加载器可以通过java.lang.Thread类的setContextClassLoader()方法进行设置，如果创建线程时还未设置，他将会从父线程中继承一个，如果在应用程序的全局范围内都没有设置过的话，那这个类加载器默认就是应用程序类加载器。

有了线程上下文加载器，JNDI服务就可以使用它去加载所需要的SPI代码，也就是父类加载器请求子类加载器去完成类加载的动作，这种行为实际上就是打通了双亲委派模型层次结构来逆向使用类加载器，实际上已经违背了双亲委派模型的一般性原则，但这也是无可奈何的事情。Java中所有涉及SPI的加载动作基本上都采用这种方式，例如JNDI、JDBC、JCE、JAXB和JBI等。


### REFS
- https://blog.csdn.net/moakun/article/details/80563804