#!/bin/bash
# author: dpchengx@gmail.com
# 向git page博客中添加原文url信息。

target_dir="_posts";
prefix_sentence="本文地址：";
host_url="https://cheng-dp.github.io"
target_line_num=8

for file_path in `find $target_dir -name "*.md"`
do
    if ! grep "$prefix_sentence" $file_path; then
      echo "Insert into: $file_path"
      date=`echo $file_path | grep -o "[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}"`
      echo date=$date
      date_pos=`echo $file_path | grep -b -o "[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}" | grep -oE "[0-9]+" | head -1`
      echo date_pos=$date_pos
      filename=${file_path:`expr $date_pos+11`}
      echo filename=$filename
      name=${filename:0:`expr ${#filename} - 3`}
      echo name=$name
      date=`echo $date | tr - /`
      echo date=$date
      final_url=$host_url/$date/$name/
      echo finalUrl=$final_url
      final_sentence=$prefix_sentence$final_url
      echo finalSentence=$final_sentence
      sed -i "${target_line_num}i \ " $file_path
      sed -i "${target_line_num}i $final_sentence" $file_path
      sed -i "${target_line_num}i \ " $file_path
      echo "Inserted sentence: $final_sentence"
    fi
done
