---
layout: page
title: About
description: 东平的博客
keywords: Dongping, 东平
comments: true
menu: 关于
permalink: /about/
---

## *一个天真的程序员，没事喜欢瞎折腾*

{% for category in site.data.skills %}
### {{ category.name }}
<div class="btn-inline">
{% for keyword in category.keywords %}
<button class="btn btn-outline" type="button">{{ keyword }}</button>
{% endfor %}
</div>
{% endfor %}
