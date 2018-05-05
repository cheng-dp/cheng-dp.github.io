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
        "teaser":null}]
