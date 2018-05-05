var store = [{
        "title": "Github pages + Minimal-Mistakes + Disqus建立个人博客记录",
        "excerpt":"本文详细记录了利用Github pages建立个人博客的步骤。 github pages官方推荐使用Jekyll生成静态网页，jekyll支持各种不同的主题，Minimal-Mistakes是一个功能比较齐全的主题，除了外观设置外，还支持文章评论、文章搜索、文章标签、文章分类。 安装Github pages + Jekyll 参考github pages主页在github建立名为{username}.github.io的repository clone {username}.github.io到本地 本地安装jekyll并建立博客 //安装jekyll gem install jekyll bundler //建立myblog并复制内容到根目录后删除myblog //如果直接在根目录建立，github在编译时可能会软连接错误，暂不知原因 cd {username}.github.io jekyll new myblog cd myblog cp -r * ../ cd .. rm -rf myblog 使用Minimal-Mistakes主题 修改Gemfile: 替换gem \"jekyll\"为gem \"github-pages\"， group: :jekyll_plugins 修改_config.yml: 中替换theme为remote_theme: \"mmistakes/minimal-mistakes\"。 运行bundle update更新主题 更改about.md和 _posts/0000-00-00-welcome-to-jekyll.markdown...","categories": ["github-pages"],
        "tags": [],
        "url": "http://localhost:4000/github-pages/build-github-pages/",
        "teaser":null}]
