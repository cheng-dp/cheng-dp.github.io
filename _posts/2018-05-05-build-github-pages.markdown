---
layout: single
title:  "Github pages + Minimal-Mistakes + Disqus建立个人博客"
date:   2018-05-05 10:10:10 +0800
categories: Tools
tags: github-pages
---
本文详细记录了利用Github pages建立个人博客的步骤。

github pages官方推荐使用Jekyll生成静态网页，jekyll支持各种不同的主题，Minimal-Mistakes是一个功能比较齐全的主题，除了外观设置外，还支持文章评论、文章搜索、文章标签、文章分类。

### 安装Github pages + Jekyll
1. 参考[github pages主页](https://pages.github.com/)在github建立名为{username}.github.io的repository    
2. clone `{username}.github.io`到本地
3. 本地安装jekyll并建立博客
	```shell
	//安装jekyll
	gem install jekyll bundler
	//建立myblog并复制内容到根目录后删除myblog
	//如果直接在根目录建立，github在编译时可能会软连接错误，暂不知原因
	cd {username}.github.io
	jekyll new myblog
	cd myblog
	cp -r * ../
	cd ..
	rm -rf myblog
	```

### 使用Minimal-Mistakes主题
1. 修改Gemfile:  
	替换`gem "jekyll"`为`gem "github-pages"， group: :jekyll_plugins`
2. 修改\_config.yml:  
	中替换`theme`为`remote_theme: "mmistakes/minimal-mistakes"`。
3. 运行`bundle update`更新主题
4. 更改`about.md`和 `_posts/0000-00-00-welcome-to-jekyll.markdown` 中 `layout`为` single`。
5. 在根目录下删除`index.md`，添加`index.html`，内容如下：
	```
	---
	layout: home
	author_profile: true
	---
	```
6. 运行`bundle exec jekyll serve`  
    如果碰到`No GitHub API authentication could be found.`的问题，参考[Resolve ERRORS](http://idratherbewriting.com/documentation-theme-jekyll/mydoc_install_jekyll_on_mac.html#githuberror)。
7. 访问`127.0.0.1:4000`查看页面
8. push到github，访问commits页面查看部署状态。
9. 访问`{username}.github.io`查看博客主页。

### 配置相关选项
在\_config.yml中可以对主题进行配置。参考[Configurations](https://mmistakes.github.io/minimal-mistakes/docs/configuration/):
1. minimal\_mistakes\_skin 配置主题皮肤
2. `locale: zh-CN` 配置语言
3. title， name， bio等个人信息
4. 添加tags和category页面，_config.yml中配置：
    ```
    category_archive:
      type: liquid
      path: /categories/
    tag_archive:
      type: liquid
      path: /tags/
    ```
    建立文件**tags/tag-archive.md**:
    ```
    ---
    title: "文章标签"
    permalink: /tags/
    layout: tags
    author_profile: true
    ---
    ```
    建立文件**categories/category-archive.md**:
    ```
    ---
    title: "文章分类"
    layout: categories
    permalink: /categories/
    author_profile: true
    ---
    ```
5. 打开搜索
    search : true
6. 建立导航栏  
a. 运行`bundle show jekyll`找到gem的安装位置，我本机在`/usr/local/lib/ruby/gems/2.4.0/gems/jekyll-3.7.3`。    
b. 进入`/usr/local/lib/ruby/gems/2.4.0/gems`，进入 **minimal-mistakes-jekyll-{version}** 文件夹，复制 **_data** 到博客根目录。  
c. 进入复制得到的\_data文件夹，修改navigation.yml文件。添加**分类**及**标签**导航栏。
    ```
    # main links
    main:
    - title: "分类"
        url: /categories/
    - title: "标签"
        url: /tags/
    ```
    
### 修改Markdown 高亮配色
Jekyll使用rough作为代码高亮工具，不同的皮肤设置(minimal\_mistakes\_skin)有不同的高亮配色，这里我使用**contrast**皮肤，但代码高亮希望将背景从深色改为白色。
1. 在gems目录`/usr/local/lib/ruby/gems/2.4.0/gems/minimal-mistakes-jekyll-{version}`下复制 **_sass** 到博客根目录。
2. 修改`_sass/minimal-mistakes/skins/_contrast.scss`，替换 **syntax highlighting (base16)** 设置，参考[Sylesheet/Color](https://mmistakes.github.io/minimal-mistakes/docs/stylesheets/#colors)。
    ```
    /* solarized light syntax highlighting (base16) */
    $base00: #fafafa !default;
    $base01: #073642 !default;
    $base02: #586e75 !default;
    $base03: #657b83 !default;
    $base04: #839496 !default;
    $base05: #586e75 !default;
    $base06: #eee8d5 !default;
    $base07: #fdf6e3 !default;
    $base08: #dc322f !default;
    $base09: #cb4b16 !default;
    $base0a: #b58900 !default;
    $base0b: #859900 !default;
    $base0c: #2aa198 !default;
    $base0d: #268bd2 !default;
    $base0e: #6c71c4 !default;
    $base0f: #d33682 !default;
    ```
3. 运行`bundle update`

### 添加Disqus评论支持

1. 参考[I want to install disqus on my site](https://disqus.com/profile/signup/intent/)注册，添加网站并得到shortname。
2. 设置\_config.yml
    ```
    comments:
    provider: "disqus"
    disqus:
        shortname: "your-disqus-shortname"
    //......
    default:
        comments: true
    ```

### 设置文字大小
修改 `_sass/minimal-mistakes/_variables.scss` 对应font-size。
    
### 参考 
- [Github Pages](https://pages.github.com/)
- [Jekyll](https://jekyllrb.com/docs/quickstart/)
- [Minimal-Mistakes](https://mmistakes.github.io/minimal-mistakes/docs/quick-start-guide/)
- [Disqus](https://disqus.com/profile/signup/intent/)



