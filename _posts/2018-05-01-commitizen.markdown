---
layout: single
title:  "Commitizen + cz-customizable配置git commit message"
date:   2018-05-01 10:10:10 +0800
categories: Tools
tags: commit-message
---
### 起因
团队对提交的commit message格式有约定俗称的要求，但是没有一个统一的规范，导致大家提交的commit message或多或少不太一样。因此，需要一个工具来帮助大家统一commit message的格式，也方便后续的分析和拓展。
### commitizen
[commitizen](https://github.com/commitizen/cz-cli) 是一个帮助规范commit message的工具。安装后的效果如下图：

![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/BLOG/commitizen-gif.gif)

##### 安装commitizen
```shell
npm install -g commitizen
```
##### 安装adapter
commitizen根据不同的`adapter`配置commit message。例如，要使用Angular的commit message格式，可以安装`cz-conventional-changelog`。
```
npm install -g cz-conventional-changelog
```
```
echo '{ "path": "cz-conventional-changelog" }' > ~/.czrc
```
现在，进入任何git repository, 使用git cz代替git commit提交commit。

### cz-customizable
[**cz-customizable**](https://github.com/leonardoanalista/cz-customizable)和`cz-conventional-changelog`一样，也是commitizen的adapter，不过支持一定程度上的自定义。
```
npm install -g cz-customizable
```
```
echo '{ "path": "cz-customizable" }' > ~/.czrc
```
接着，在home目录下创建 **.cz-config.js** 文件,根据`node_modules/cz-customizable/cz-config-EXAMPLE.js`配置git cz时弹出的message和对应的输入或者选项。

如果想要进一步进行配置，直接修改`node_modules/cz-customizable`下的**questions.js**和**buildCommit.js**。

buildCommit.js中生成最终commit message：
![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/BLOG/buildCommit.png)

questions.js中message配置部分：
![image](https://pictures-1255802956.cos.ap-chengdu.myqcloud.com/BLOG/questions.png)



