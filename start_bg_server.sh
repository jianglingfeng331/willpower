#!/bin/bash
cd "$(dirname "$0")"
nohup python3 bg_remove_server.py > bg_server.log 2>&1 &
echo "抠图服务已启动 (PID: $!), 端口: 8765"
echo "等待模型加载..."
sleep 3
# 预热：发送一个空请求触发模型加载
curl -s http://127.0.0.1:8765/health > /dev/null 2>&1
echo "模型预加载完成"
