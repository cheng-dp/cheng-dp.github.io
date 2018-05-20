var store = [{
        "title": "Commitizen + cz-customizable配置git commit message",
        "excerpt":"起因 团队对提交的commit message格式有约定俗称的要求，但是没有一个统一的规范，导致大家提交的commit message或多或少不太一样。因此，需要一个工具来帮助大家统一commit message的格式，也方便后续的分析和拓展。 commitizen commitizen 是一个帮助规范commit message的工具。安装后的效果如下图： 安装commitizen npm install -g commitizen安装adapter commitizen根据不同的adapter配置commit message。例如，要使用Angular的commit message格式，可以安装cz-conventional-changelog。 npm install -g cz-conventional-changelogecho '{ \"path\": \"cz-conventional-changelog\" }' &gt; ~/.czrc现在，进入任何git repository, 使用git cz代替git commit提交commit。 cz-customizable cz-customizable和cz-conventional-changelog一样，也是commitizen的adapter，不过支持一定程度上的自定义。 npm install -g cz-customizableecho '{ \"path\": \"cz-customizable\" }' &gt; ~/.czrc接着，在home目录下创建 .cz-config.js 文件,根据node_modules/cz-customizable/cz-config-EXAMPLE.js配置git cz时弹出的message和对应的输入或者选项。 如果想要进一步进行配置，直接修改node_modules/cz-customizable下的questions.js和buildCommit.js。 buildCommit.js中生成最终commit message： questions.js中message配置部分：...","categories": ["Tools"],
        "tags": ["commit-message"],
        "url": "http://localhost:4000/tools/commitizen/",
        "teaser":null},{
        "title": "Github pages + Minimal-Mistakes + Disqus建立个人博客",
        "excerpt":"本文详细记录了利用Github pages建立个人博客的步骤。 github pages官方推荐使用Jekyll生成静态网页，jekyll支持各种不同的主题，Minimal-Mistakes是一个功能比较齐全的主题，除了外观设置外，还支持文章评论、文章搜索、文章标签、文章分类。 安装Github pages + Jekyll 参考github pages主页在github建立名为{username}.github.io的repository clone {username}.github.io到本地 本地安装jekyll并建立博客 //安装jekyll gem install jekyll bundler //建立myblog并复制内容到根目录后删除myblog //如果直接在根目录建立，github在编译时可能会软连接错误，暂不知原因 cd {username}.github.io jekyll new myblog cd myblog cp -r * ../ cd .. rm -rf myblog 使用Minimal-Mistakes主题 修改Gemfile: 替换gem \"jekyll\"为gem \"github-pages\"， group: :jekyll_plugins 修改_config.yml: 中替换theme为remote_theme: \"mmistakes/minimal-mistakes\"。 运行bundle update更新主题 更改about.md和 _posts/0000-00-00-welcome-to-jekyll.markdown...","categories": ["Tools"],
        "tags": ["github-pages"],
        "url": "http://localhost:4000/tools/build-github-pages/",
        "teaser":null},{
        "title": "Java内存区域及内存溢出",
        "excerpt":"堆溢出 Java堆用于存储对象实例，只要不断地创建对象，并且保证GC Roots到对象之间有可达路径避免垃圾回收，当到达最大堆的容量限制后就会产生Java.lang.OutOfMemoryError. /** * VM Options: * -Xms20M * -Xmx20M * -XX:+HeapDumpOnOutOfMemoryError */public class HeapOOM{ static class OOMObject{} public static void main(String[] args){ List&lt;OOMObject&gt; list = new ArrayList&lt;OOMObject&gt;(); while(true){ list.add(new OOMObject()); } }}结果：GC多次执行后触发OutOfMemoryError. 栈溢出 关于虚拟机栈，在Java规范中描述了两种异常： 如果线程请求的栈深度大于虚拟机所允许的最大深度，将抛出StackOverflowError异常。 如果虚拟机在扩展栈时无法申请到足够的内存空间，则抛出OutOfMemoryError异常。然而，在单线程下，虚拟机在栈空间不足时会尝试扩展栈空间，因此，当无法继续分配时，到底是内存太小，还是已使用的栈空间太大，其实是一回事。在实验中，单线程环境下，只会抛出StackOverflowError异常。 /** * VM Option: * -Xss160K */public class JavaVMStackSOF{ private int stackLength...","categories": ["Java"],
        "tags": ["java"],
        "url": "http://localhost:4000/java/java-memory-exception/",
        "teaser":null},{
        "title": "Java堆内存分配与回收策略",
        "excerpt":"java主要在堆上分配内存，而Java堆又分为新生代(YoungGen)和老年代(OldGen)两个部分，新生代又再分为Eden区和Survivor区两部分，本文根据java堆的划分，描述hotspot的内存分配策略。 GC垃圾收集分类 Minor GC: 发生在新生代中的垃圾收集，采用复制算法。 Major GC/Full GC: 发生在老年代的垃圾收集动作，所采用的是标记-清除或者标记-整理算法。Eden区和Survivor区 对于采用复制算法的虚拟机，新生代通常有一个Eden区和两个Survivor区。对象优先在Eden区分配，当Eden区没有足够的空间进行分配时，虚拟机讲发起一次Minor GC，Eden中存活的对象将被移动到第一块Survivor区S1，Eden被清空。当Eden区再次填满，再次触发Minor GC，Eden区和S1中的存活对象被复制送入第二块Survivor区S2中，S1和Eden被清空，下一轮交换S1和S2的角色。使用两个Survivor区能够简化复制算法的过程，并且避免复制过程中内存碎片的产生。 当对象的复制次数达到-XX:MaxTenuringThreshold设置的值(默认-XX:MaxTenuringThreshold=15)时，将被移至老年代。 实验 /** * VM Options: * -Xmx20M 堆最大20M * -Xms20M 堆最小20M * -Xmn10M 新生代为10M * -XX:SurvivorRatio=8 Eden区和Survivor区的比值为8:1 * -XX:+PrintGCDetails 输出回收日志及退出时内存各区域情况 */private static final int _1MB = 1024 * 1024;public static void testAllocation(){ byte[] allocation1,allocation2,allocation3,allocation4; allocation1 = new...","categories": ["Java"],
        "tags": ["Java"],
        "url": "http://localhost:4000/java/java-memory-allocate/",
        "teaser":null}]
