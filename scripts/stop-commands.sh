#!/usr/bin/env bash
set -e

# 引数のコマンドを実行し、ファイル名を含む出力が Actions コマンドとして解釈されないようにする
marker=$(openssl rand -hex 16)
echo "::stop-commands::$marker"

result=0
"$@" || result=$?

printf '\n::%s::\n' "$marker"
exit "$result"
