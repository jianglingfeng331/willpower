#!/bin/bash
# 燃脂PK 服务器启动脚本
# 用法: bash start.sh

cd "$(dirname "$0")"

# 加载环境变量（如果有 .env 文件）
if [ -f ".env" ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

echo "[diet-pk] 检查依赖..."
if [ ! -d "node_modules" ]; then
  echo "[diet-pk] 安装依赖..."
  npm install
fi

echo "[diet-pk] 启动服务器 (端口 3001)..."
if [ -n "$ZHIPU_API_KEY" ]; then
  echo "[diet-pk] 智谱 AI 已启用"
else
  echo "[diet-pk] 智谱 AI 未配置 (使用本地数据)"
fi
node server.js
