# 燃脂PK 部署指南

## 架构

```
浏览器(手机/电脑)
  ├── /api/* → Nginx 反向代理 → localhost:3001 (server.js)
  └── / → 静态文件 (index.html + js/css/img)
```

## 1. 启动后端

```bash
cd output/diet-pk
bash start.sh
```

或手动：

```bash
cd output/diet-pk
npm install
node server.js   # 监听 3001 端口
```

## 2. Nginx 反向代理配置

将以下配置加入 Nginx server 块：

```nginx
# /api/ 反向代理到 Node.js 后端
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 60s;
}

# 静态文件直接由 Nginx 提供
location / {
    root /path/to/output/diet-pk;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```

## 3. 不使用 Nginx（开发/单机测试）

如果只是局域网内测试，可直接让 server.js 同时提供静态文件。在 server.js 末尾添加：

```javascript
app.use(express.static(__dirname));
```

然后访问 `http://你的电脑IP:3001/` 即可。

## 4. 数据存储

- 账号密码、运动记录：`data/users.json`
- 前端 localStorage 仍作为离线缓存，API 可用时自动同步

## 5. 降级机制

如果后端未启动或不可达（手机无法连接服务器），前端自动降级到纯 localStorage 模式，不影响独立使用。启动后端后，数据自动合并。

## 6. 安全注意事项

- 密码以明文存储在 `data/users.json`，仅适用于家庭内部局域网
- 不要将 `data/users.json` 提交到公开 Git 仓库
- 如需公网部署，建议添加 HTTPS + JWT 认证
