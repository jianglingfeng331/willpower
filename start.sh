#!/bin/bash
# 燃脂PK 服务器启动脚本
# 用法: bash start.sh

cd "$(dirname "$0")"

echo "[diet-pk] 检查依赖..."
if [ ! -d "node_modules" ]; then
  echo "[diet-pk] 安装依赖..."
  npm install
fi

echo "[diet-pk] 启动服务器 (端口 3001)..."
node server.js
