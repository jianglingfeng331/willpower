# AI 食物识别功能说明

## 功能概述

无需背景移除服务，直接使用原图进行 AI 食物识别和营养估算。

- **食物识别**：自动识别食物品类
- **热量测算**：估算食物总热量（千卡 kcal）
- **营养分析**：输出碳水、蛋白质、脂肪、膳食纤维、糖分、钠 六项指标
- **可编辑**：所有文本内容支持手动修改
- **可重拍**：支持删除重新拍摄识别

## 当前状态

✅ 主服务器运行中 (端口 3001)
✅ 食物识别 API 可用
⚠️ 当前使用本地模拟数据（未配置智谱 API Key）

## 启用真实 AI 识别

### 步骤 1：获取智谱 AI API Key

1. 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
2. 注册账号并登录
3. 在控制台获取 API Key

### 步骤 2：配置环境变量

**方法 A：临时设置（当前会话有效）**
```bash
export ZHIPU_API_KEY="你的API Key"
node server.js
```

**方法 B：永久设置**
```bash
# 在 ~/.zshrc 或 ~/.bashrc 中添加
echo 'export ZHIPU_API_KEY="你的API Key"' >> ~/.zshrc
source ~/.zshrc
```

### 步骤 3：重启服务

```bash
# 停止当前服务
pkill -f "node server.js"

# 重新启动
node server.js
```

## 降级机制

- 当智谱 API 不可用时，自动使用本地食物数据库
- 本地数据库包含 6 种常见中式菜肴
- 即使 API 失败，也能保证基本功能可用

## API 端点

```
POST /api/food-recognize
Content-Type: application/json

{
  "image": "data:image/jpeg;base64,..."
}
```

响应示例：
```json
{
  "success": true,
  "mock": false,
  "data": {
    "foodName": "宫保鸡丁",
    "calories": 450,
    "carbs": 25,
    "protein": 30,
    "fat": 28,
    "fiber": 3,
    "sugar": 8,
    "sodium": 1200,
    "tip": "建议搭配蔬菜一起食用，控制油脂摄入"
  }
}
```
