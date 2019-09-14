---
layout: post
title: BeanPostProcessor和BeanFactoryPostProcessor
categories: [Spring]
description: BeanPostProcessor和BeanFactoryPostProcessor
keywords: Spring
---

## BeanPostProcessor

### 代码和注释

```java
/**
 * Factory hook that allows for custom modification of new bean instances,
 * e.g. checking for marker interfaces or wrapping them with proxies.
 *
 * <p>ApplicationContexts can autodetect BeanPostProcessor beans in their
 * bean definitions and apply them to any beans subsequently created.
 * Plain bean factories allow for programmatic registration of post-processors,
 * applying to all beans created through this factory.
 *
 * <p>Typically, post-processors that populate beans via marker interfaces
 * or the like will implement {@link #postProcessBeforeInitialization},
 * while post-processors that wrap beans with proxies will normally
 * implement {@link #postProcessAfterInitialization}.
 *
 * @author Juergen Hoeller
 * @since 10.10.2003
 * @see InstantiationAwareBeanPostProcessor
 * @see DestructionAwareBeanPostProcessor
 * @see ConfigurableBeanFactory#addBeanPostProcessor
 * @see BeanFactoryPostProcessor
 */
public interface BeanPostProcessor {
	/**
	 * Apply this BeanPostProcessor to the given new bean instance <i>before</i> any bean
	 * initialization callbacks (like InitializingBean's {@code afterPropertiesSet}
	 * or a custom init-method). The bean will already be populated with property values.
	 * The returned bean instance may be a wrapper around the original.
	 * <p>The default implementation returns the given {@code bean} as-is.
	 * @param bean the new bean instance
	 * @param beanName the name of the bean
	 * @return the bean instance to use, either the original or a wrapped one;
	 * if {@code null}, no subsequent BeanPostProcessors will be invoked
	 * @throws org.springframework.beans.BeansException in case of errors
	 * @see org.springframework.beans.factory.InitializingBean#afterPropertiesSet
	 */
	@Nullable
	default Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {
		return bean;
	}

	/**
	 * Apply this BeanPostProcessor to the given new bean instance <i>after</i> any bean
	 * initialization callbacks (like InitializingBean's {@code afterPropertiesSet}
	 * or a custom init-method). The bean will already be populated with property values.
	 * The returned bean instance may be a wrapper around the original.
	 * <p>In case of a FactoryBean, this callback will be invoked for both the FactoryBean
	 * instance and the objects created by the FactoryBean (as of Spring 2.0). The
	 * post-processor can decide whether to apply to either the FactoryBean or created
	 * objects or both through corresponding {@code bean instanceof FactoryBean} checks.
	 * <p>This callback will also be invoked after a short-circuiting triggered by a
	 * {@link InstantiationAwareBeanPostProcessor#postProcessBeforeInstantiation} method,
	 * in contrast to all other BeanPostProcessor callbacks.
	 * <p>The default implementation returns the given {@code bean} as-is.
	 * @param bean the new bean instance
	 * @param beanName the name of the bean
	 * @return the bean instance to use, either the original or a wrapped one;
	 * if {@code null}, no subsequent BeanPostProcessors will be invoked
	 * @throws org.springframework.beans.BeansException in case of errors
	 * @see org.springframework.beans.factory.InitializingBean#afterPropertiesSet
	 * @see org.springframework.beans.factory.FactoryBean
	 */
	@Nullable
	default Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
		return bean;
	}
}
```


BeanPostProcessor是Spring提供的一个扩展点，在对象创建后对对象进行处理。

1. BeanPostProcessor也是一个Bean，并且在其余Bean创建前被创建(参考ApplicationContext基本实现)。
2. BeanPostProcessor在对象创建后对对象进行处理。此时Bean对象已根据定义被创建并且给属性赋值。
3. ==postProcessBeforeInitialization和postProcessAfterInitialization的Initialization指的是Spring提供的初始化相关的回调。==
    - @PostConstruction / @PreDestroy
    - InitializatingBean.afterPropertiesSet() / @DisposableBean.destroy()
    - @Bean(initMethod = "...") / @Bean(destroyMethod = "...")


### Spring中的例子

- AutowiredAnnotationBeanPostProcessor: scans bean looking for @Autowire annotation in order to perform dependency injection.
- RequiredAnnotationBeanPostProcessor: checks if all dependencies marked as @Required has been injected.
- ApplicationContextAwareProcessor: injects ApplicationContext to beans implementing ApplicationContextAware interface.


## BeanFactoryPostProcessor

### 代码和注释

```java
/**
 * Allows for custom modification of an application context's bean definitions,
 * adapting the bean property values of the context's underlying bean factory.
 *
 * <p>Application contexts can auto-detect BeanFactoryPostProcessor beans in
 * their bean definitions and apply them before any other beans get created.
 *
 * <p>Useful for custom config files targeted at system administrators that
 * override bean properties configured in the application context.
 *
 * <p>See PropertyResourceConfigurer and its concrete implementations
 * for out-of-the-box solutions that address such configuration needs.
 *
 * <p>A BeanFactoryPostProcessor may interact with and modify bean
 * definitions, but never bean instances. Doing so may cause premature bean
 * instantiation, violating the container and causing unintended side-effects.
 * If bean instance interaction is required, consider implementing
 * {@link BeanPostProcessor} instead.
 *
 * @author Juergen Hoeller
 * @since 06.07.2003
 * @see BeanPostProcessor
 * @see PropertyResourceConfigurer
 */
@FunctionalInterface
public interface BeanFactoryPostProcessor {

	/**
	 * Modify the application context's internal bean factory after its standard
	 * initialization. All bean definitions will have been loaded, but no beans
	 * will have been instantiated yet. This allows for overriding or adding
	 * properties even to eager-initializing beans.
	 * @param beanFactory the bean factory used by the application context
	 * @throws org.springframework.beans.BeansException in case of errors
	 */
	void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException;

}
```

BeanFactoryPostProcessor是Spring提供的，==在加载完所有BeanDefinition后，能对BeanDefinition进行检查、修改的一个扩展点==。Spring允许BeanFactoryPostProcessor在容器实例化任何其它bean之前读取配置元数据，并可以根据需要进行修改，例如可以把bean的scope从singleton改为prototype，也可以把property的值给修改掉。可以同时配置多个BeanFactoryPostProcessor，并通过设置'order'属性来控制各个BeanFactoryPostProcessor的执行次序。



### 例子

```java
public class MyBeanFactoryPostProcessor implements BeanFactoryPostProcessor {
 
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        BeanDefinition bd = beanFactory.getBeanDefinition("myBean");
        System.out.println("Property values:" + bd.getPropertyValues().toString());
        MutablePropertyValues pv = bd.getPropertyValues(); 
        //修改属性值
        if (pv.contains("name")) {
            pv.addPropertyValue("name", "modified name");
        }
        //修改scope
        bd.setScope(BeanDefinition.SCOPE_PROTOTYPE);
    }
}
```

### Spring中的应用

Spring中提供三个BeanFactoryPostProcessor帮助读取bean xml配置文件。

#### PropertyPlaceholderConfigurer

`org.springframework.beans.factory.config.PropertyPlaceholderConfigurer`

使用PropertyPlaceholderConfigurer可以在XML配置文件中加入外部配置文件。

PropertyPlaceholderConfigurer可以将上下文(配置文 件)中的属性值放在另一个单独的标准java Properties文件中去。在XML文件中用${key}替换指定的properties文件中的值。

这样的话，只需要对properties文件进行修改，而不用对xml配置文件进行修改。
    
#### PropertyOverrideConfigurer

`org.springframework.beans.factory.config.PropertyOverrideConfigurer`

PropertyOverrideConfigurer利用属性文件的相关信息，覆盖XML配置文件中定义的值。

使用PropertyOverrideConfigurer属性文件的格式如下: `beanName.property=value`，beanName是属性占位符企图覆盖的bean名， property 是企图覆盖的属性名。

#### CustomEditorConfigurer

`org.springframework.beans.factory.config.CustomEditorConfigurer`

CustomEditorConfigurer用来向Spring中添加自定义的属性编辑器PropertyEditor。

**属性编辑器 PropertyEditor**

Aspect的xml配置中，所有的value只能是string格式，Spring通过继承`java.beans.PropertyEditorSupport`创建各种属性编辑器将配置文件中的String转换成对应类型。例如：TimeZoneEditor, UUIDEditor, LocaleEditor等等。这些Editor只需要继承PropertyEditorSupport并重写setAsText(String text)和getAsText()方法：
```java
public class UUIDEditor extends PropertyEditorSupport {
	@Override
	public void setAsText(String text) throws IllegalArgumentException {
		if (StringUtils.hasText(text)) {
			setValue(UUID.fromString(text));
		}
		else {
			setValue(null);
		}
	}
	@Override
	public String getAsText() {
		UUID value = (UUID) getValue();
		return (value != null ? value.toString() : "");
	}
}
```

**CustomEditorConfigurer**

对于一些自定义的新类型，显然Spring没有提供从String转化成对应类型的方法，因此需要：
- 自定义对应的属性编辑器。
- 向Spring中注册该属性编辑器。
CustomEditorConfigurer就用来向Spring中注册自定义的属性编辑器，支持将xml中读取的String值转换为对应的类型值。

**举例**


```
// MyBean中的Date是自定义的新类，需要从xml中直接读取string值创建。
public class MyBean {  
     private Date dateValue;  
     public void setDateValue(Date dateValue) {  
        this.dateValue = dateValue;  
    }  
}  
```

自定义的属性编辑器

```
// 自定义的属性编辑器
 
public class UtilDatePropertyEditor extends PropertyEditorSupport {  
  
    private String format="yyyy-MM-dd";  
      
    @Override  
    public void setAsText(String text) throws IllegalArgumentException {  
        System.out.println("UtilDatePropertyEditor.saveAsText() -- text=" + text);  
          
        SimpleDateFormat sdf = new SimpleDateFormat(format);  
        try {  
            Date d = sdf.parse(text);  
            this.setValue(d);  
        } catch (ParseException e) {  
            e.printStackTrace();  
        }  
    }  
  
    public void setFormat(String format) {  
        this.format = format;  
    }  
  
}  
```

创建CustomEditorConfigurer bean, 并注册UtilDatePropertyEditor属性编辑器

```
<bean id="myBean" class="com.bjsxt.spring.MyBean">  
      <property name="dateValue">  
         <value>2008-08-15</value>  
    </property>  
</bean>  

<!-- 创建CustomEditorConfigurer bean, 并注册UtilDatePropertyEditor属性编辑器 -->        
<bean id="customEditorConfigurer" class="org.springframework.beans.factory.config.CustomEditorConfigurer">  
    <property name="customEditors">  
        <map>  
            <entry key="java.util.Date">  
                <bean class="com.bjsxt.spring.UtilDatePropertyEditor">  
                    <property name="format" value="yyyy-MM-dd"/>  
                </bean>  
            </entry>  
        </map>  
    </property>  
</bean>   
```
如上，dateValue提供的值将通过`UtilDatePropertyEditor.setAsText(String text)`方法直接转换为Date。

### REFS

- https://stackoverflow.com/questions/9862127/what-is-the-difference-between-beanpostprocessor-and-init-destroy-method-in-spri
- https://stackoverflow.com/questions/13409332/difference-between-call-back-method-and-bean-post-processor-in-spring-framework
- https://stackoverflow.com/questions/9761839/beanpostprocessor-confusion
- https://blog.csdn.net/caihaijiang/article/details/35552859