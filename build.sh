#!/bin/sh
# CSS / JS / データを 1 枚の HTML に埋め込み、dist/dashboard.html を作ります。
# メール添付や共有フォルダに置くなど、ファイル 1 つで配りたいときに使います。
#   sh build.sh
set -e
cd "$(dirname "$0")"
mkdir -p dist
awk '
  function inline(file,   l) { while ((getline l < file) > 0) print l; close(file) }
  /<link rel="stylesheet" href="assets\/styles.css" \/>/ { print "  <style>";  inline("assets/styles.css"); print "  <" "/style>";  next }
  /<script src="data\/data.js">/                          { print "  <script>"; inline("data/data.js");      print "  <" "/script>"; next }
  /<script src="assets\/app.js">/                         { print "  <script>"; inline("assets/app.js");     print "  <" "/script>"; next }
  { print }
' index.html > dist/dashboard.html
echo "dist/dashboard.html を作成しました"
