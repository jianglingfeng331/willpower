#!/bin/bash
kill $(lsof -t -i:8765) 2>/dev/null || echo "服务未运行"
