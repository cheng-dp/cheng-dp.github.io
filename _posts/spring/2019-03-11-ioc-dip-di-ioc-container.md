---
layout: post
title: IoC、DIP、Dependency Injection和IoC Container概念解析
categories: [Spring]
description: IoC、DIP、Dependency Injection和IoC Container概念解析
keywords: Spring
---


![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/IoCDIPDIAndIoCContainer.png)

如上图所示，IoC和DIP是指导性的设计原则，Dependency Injection是一种模式、是IoC的实现方式，IoC Container是实现框架。

### 控制反转原则 (Inversion of Control, IoC)

```
inversion of control (IoC) is a design principle in which custom-written portions of a computer program receive the flow of control from a generic framework. 
A software architecture with this design inverts control as compared to traditional procedural programming: 
in traditional programming, the custom code that expresses the purpose of the program calls into reusable libraries to take care of generic tasks, 
but with inversion of control, it is the framework that calls into the custom, or task-specific, code.
```

IoC是面向对象编程中的一种设计原则，目标是降低代码的耦合度(loose coupling)。

没有IoC的程序中，客户代码需要主动创建并管理依赖的对象，而在IoC程序中，客户代码依赖的对象由框架(第三方)注入给调用者，具体生成什么对象和什么时候生成都由框架(第三方)决定。

1. 什么是控制？

依赖对象的创建和绑定。

2. 如何反转？

从调用者自己主动创建、管理依赖对象转为第三方管理，由第三方提供给调用者。

#### 例子一

反转用户输入的流程控制，从客户代码自定义流程反转至GUI框架(第三方)接收输入并调用客户代码。

```C#
//C# code
static void Main(string[] args)
{
   bool continueExecution = true;
    do
    {
        Console.Write("Enter First Name:");
        var firstName = Console.ReadLine();

        Console.Write("Enter Last Name:");
        var lastName = Console.ReadLine();

        Console.Write("Do you want to save it? Y/N: ");

        var wantToSave = Console.ReadLine();

        if (wantToSave.ToUpper() == "Y")
            SaveToDB(firstName, lastName);

        Console.Write("Do you want to exit? Y/N: ");

        var wantToExit = Console.ReadLine();

        if (wantToExit.ToUpper() == "Y")
            continueExecution = false;

    }while (continueExecution);
 
}

private static void SaveToDB(string firstName, string lastName)
{
    //save firstName and lastName to the database here..
}
```

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/IoCExampleOne.png)

#### 例子二

BusinessLogic 依赖 DataAccess，将对DataAccess的创建绑定反转至交由第三方工厂方法。

```C#
//before
public class CustomerBusinessLogic
{
    DataAccess _dataAccess;

    public CustomerBusinessLogic()
    {
        _dataAccess = new DataAccess();
    }

    public string GetCustomerName(int id)
    {
        return _dataAccess.GetCustomerName(id);
    }
}

public class DataAccess
{
    public DataAccess()
    {
    }

    public string GetCustomerName(int id) {
        return "Dummy Customer Name"; // get it from DB in real app
    }
}
```
```C#
//after
public class DataAccessFactory
{
    public static DataAccess GetDataAccessObj() 
    {
        return new DataAccess();
    }
}

public class CustomerBusinessLogic
{

    public CustomerBusinessLogic()
    {
    }

    public string GetCustomerName(int id)
    {
        DataAccess _dataAccess =  DataAccessFactory.GetDataAccessObj();

        return _dataAccess.GetCustomerName(id);
    }
}
```


#### IoC的优点和缺点

**优点**

IoC进一步降低了代码的耦合度，IoC带来的好处也就是对代码进行解耦带来的好处：

1. 更加明确的分工，只需关注自身任务，无需关注依赖对象的功能。
2. 更容易进行测试，测试时只需提供依赖对象的Mock，TDD必须提供IoC才能实现。
3. 代码更加灵活、可配置、可复用。

**缺点**

代码不够直观，增加了复杂度。


#### IoC的实现方式

在OOP中，有多种实现IoC的方法：
1. Service Locator Pattern.
2. Dependency Injection.(Constructor/Parameter/Setter).
3. Strategy Design Pattern.

### 依赖倒置原则 (Dependency Inversion Principle, DIP)

1. 高层次的模块不应该依赖于低层次的模块，两者都应该依赖于抽象接口。
2. 抽象接口不应该依赖于具体实现。而具体实现则应该依赖于抽象接口。


*依赖倒置原则的目的是把高层次组件从对低层次组件的依赖中解耦出来，这样使得重用不同层级的组件实现变得可能。把高层组件和低层组件划分到不同的包/库（在这些包/库中拥有定义了高层组件所必须的行为和服务的接口，并且存在高层组件的包）中的方式促进了这种解耦。由于低层组件是对高层组件接口的具体实现，因此低层组件包的编译是依赖于高层组件的，这颠倒了传统的依赖关系。众多的设计模式，比如插件，服务定位器或者依赖反转，则被用来在运行时把指定的低层组件实现提供给高层组件。*

依赖倒置原则是**面向接口编程**的精髓。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/DependencyInversion.png)

#### 例子

对IoC中BusinessLogic依赖DataAccess的情况进一步解耦：

1. 高层(BusinessLogic)和低层(DataAccess)都依赖抽象接口(ICustomerDataAccess)。
2. BisunessLogic、DataAccess和DataAccessFactory实现中都只调用ICustomerDataAccess的方法。

```C#
public interface ICustomerDataAccess
{
    string GetCustomerName(int id);
}

public class CustomerDataAccess: ICustomerDataAccess
{
    public CustomerDataAccess() {
    }

    public string GetCustomerName(int id) {
        return "Dummy Customer Name";        
    }
}

public class DataAccessFactory
{
    public static ICustomerDataAccess GetCustomerDataAccessObj() 
    {
        return new CustomerDataAccess();
    }
}

public class CustomerBusinessLogic
{
    ICustomerDataAccess _custDataAccess;

    public CustomerBusinessLogic()
    {
        _custDataAccess = DataAccessFactory.GetCustomerDataAccessObj();
    }

    public string GetCustomerName(int id)
    {
        return _custDataAccess.GetCustomerName(id);
    }
}
```

#### DIP的优点

可以减少类之间的耦合性。提高系统的稳定性，提高可读性和可维护性。

### Dependency Injection

IoC和DIP都是软件实现的原则，而 Dependency Injection是实现IoC和DIP的一种具体模式。通过外部创建、管理依赖对象并注入依赖。

![image](https://raw.githubusercontent.com/cheng-dp/ImageHostInGithub/master/DependencyInjection.png)

在上图中，Injector(外部)创建和管理Service并注入Client中。注入的方法有：
1. Constructor Injection
2. Property Injection
3. Method Injection

继续用上文中的CustomBusinessLogic和DataAccess举例：
```C#
//上面的例子并没有实现CustomBusinessLogic和DataAccess的真正解耦合，因为CustomBusinessLogic还依赖于DataAccessFactory。
//因此，这里我们使用Dependency Injection Pattern，引入Injector -> CustomerService来为CustomBusinessLogic注入DataAccess。

//Constructor Injection
public class CustomerBusinessLogic
{
    ICustomerDataAccess _dataAccess;

    public CustomerBusinessLogic(ICustomerDataAccess custDataAccess)
    {
        _dataAccess = custDataAccess;
    }

    public CustomerBusinessLogic()
    {
        _dataAccess = new CustomerDataAccess();
    }

    public string ProcessCustomerData(int id)
    {
        return _dataAccess.GetCustomerName(id);
    }
}

public class CustomerService
{
    CustomerBusinessLogic _customerBL;

    public CustomerService()
    {
        _customerBL = new CustomerBusinessLogic(new CustomerDataAccess());
    }

    public string GetCustomerName(int id) {
        return _customerBL.GetCustomerName(id);
    }
}


//Property Injection
public class CustomerBusinessLogic
{
    public CustomerBusinessLogic()
    {
    }

    public string GetCustomerName(int id)
    {
        return DataAccess.GetCustomerName(id);
    }

    public ICustomerDataAccess DataAccess { get; set; }
}

public class CustomerService
{
    CustomerBusinessLogic _customerBL;

    public CustomerService()
    {
        _customerBL = new CustomerBusinessLogic();
        _customerBL.DataAccess = new CustomerDataAccess();
    }

    public string GetCustomerName(int id) {
        return _customerBL.GetCustomerName(id);
    }
}



//Method Injection
interface IDataAccessDependency
{
    void SetDependency(ICustomerDataAccess customerDataAccess);
}

public class CustomerBusinessLogic : IDataAccessDependency
{
    ICustomerDataAccess _dataAccess;

    public CustomerBusinessLogic()
    {
    }

    public string GetCustomerName(int id)
    {
        return _dataAccess.GetCustomerName(id);
    }
        
    public void SetDependency(ICustomerDataAccess customerDataAccess)
    {
        _dataAccess = customerDataAccess;
    }
}

public class CustomerService
{
    CustomerBusinessLogic _customerBL;

    public CustomerService()
    {
        _customerBL = new CustomerBusinessLogic();
        ((IDataAccessDependency)_customerBL).SetDependency(new CustomerDataAccess());
    }

    public string GetCustomerName(int id) {
        return _customerBL.GetCustomerName(id);
    }
}
```

### IoC Container

IoC Container是能够管理并自动进行依赖注入(Dependency Injection)的框架。


### REFS

**IoC**

- http://www.tutorialsteacher.com/ioc/inversion-of-control
- https://en.wikipedia.org/wiki/Inversion_of_control
- https://segmentfault.com/a/1190000015490472
- https://stackoverflow.com/questions/2394752/utility-of-ioc-and-dependency-injection
- https://zh.wikipedia.org/wiki/%E6%8E%A7%E5%88%B6%E5%8F%8D%E8%BD%AC

**DIP**

- http://www.tutorialsteacher.com/ioc/dependency-inversion-principle
- https://flylib.com/books/en/4.444.1.71/1/

**Dependency Injection**

- https://en.wikipedia.org/wiki/Dependency_injection
- http://www.tutorialsteacher.com/ioc/dependency-injection
 
```
本文地址：https://cheng-dp.github.io/2019/03/11/ioc-dip-di-ioc-container/
```
 
