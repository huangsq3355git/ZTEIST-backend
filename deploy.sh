#!/usr/bin/env bash
# ZTEIST 部署：拉最新 → 装依赖 → build → reload → 盯 pm2 list → 冒烟
# 铁律：build 失败 set -e 会立刻停，不会执行 reload。
set -euo pipefail
cd /opt/zteist

echo "==> git pull"
git pull

echo "==> npm install"
npm install

echo "==> build（有 error 会在此停下，不会 reload）"
npm run build

echo "==> pm2 reload"
pm2 reload zteist-web-api

echo "==> 盯 5 秒 pm2 list（↺ 列不应涨）"
sleep 5
pm2 list

echo "==> 冒烟测试（5/5 全绿才算成功）"
bash scripts/smoke-test.sh
