/**
 * 燃脂PK 跨设备同步后端
 * 端口 3001，用 JSON 文件 (data/users.json) 存储账号 + 运动记录
 * 前端通过 API 读写，API 不可用时自动降级到 localStorage
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'users.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// 直接提供静态文件，不需要 Nginx
app.use(express.static(__dirname));

// ========== 工具函数 ==========

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// 深度合并 records（按日期+账号+time 去重）
function mergeRecords(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return existing;
  const merged = JSON.parse(JSON.stringify(existing || {}));
  for (const [date, dayData] of Object.entries(incoming)) {
    if (!merged[date]) {
      merged[date] = JSON.parse(JSON.stringify(dayData));
      continue;
    }
    for (const [account, accountData] of Object.entries(dayData)) {
      if (!accountData) continue;
      if (!merged[date][account]) {
        merged[date][account] = JSON.parse(JSON.stringify(accountData));
        continue;
      }
      for (const [key, val] of Object.entries(accountData)) {
        if (Array.isArray(val) && val.length > 0) {
          const existingTimes = new Set((merged[date][account][key] || []).map(item => item.time));
          const newItems = val.filter(item => !existingTimes.has(item.time));
          merged[date][account][key] = (merged[date][account][key] || []).concat(newItems);
        } else if (val !== null && val !== undefined) {
          merged[date][account][key] = val;
        }
      }
    }
  }
  return merged;
}

// ========== API ==========

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 获取同步数据
app.get('/api/sync', (_req, res) => {
  const data = readData();
  res.json({
    pk_users: data.pk_users || null,
    accounts: data.accounts || null,
    records: data.records || {}
  });
});

// 上传同步数据（合并写入）
app.post('/api/sync', (req, res) => {
  const { pk_users, accounts, records } = req.body;
  const data = readData();

  // 合并 pk_users（以服务器为准，仅新增缺失账号）
  if (pk_users && typeof pk_users === 'object') {
    if (!data.pk_users) data.pk_users = {};
    for (const [name, info] of Object.entries(pk_users)) {
      if (!data.pk_users[name]) {
        data.pk_users[name] = info;
      }
    }
  }

  // 合并 accounts
  if (accounts && typeof accounts === 'object') {
    data.accounts = { ...(data.accounts || {}), ...accounts };
  }

  // 合并 records
  if (records && typeof records === 'object') {
    data.records = mergeRecords(data.records || {}, records);
  }

  writeData(data);
  res.json({ success: true, users: data.pk_users, accounts: data.accounts });
});

// 用户操作（注册/修改密码）
app.post('/api/users', (req, res) => {
  const { action, username, password, users } = req.body;

  if (action === 'register') {
    if (!users || typeof users !== 'object') {
      return res.status(400).json({ success: false, error: '缺少users参数' });
    }
    const data = readData();
    if (data.pk_users && Object.keys(data.pk_users).length > 0) {
      return res.json({ success: false, error: '服务器已有注册数据，请直接登录' });
    }
    data.pk_users = users;
    writeData(data);
    return res.json({ success: true });
  }

  if (action === 'changePassword') {
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '缺少参数' });
    }
    const data = readData();
    if (!data.pk_users || !data.pk_users[username]) {
      return res.json({ success: false, error: '账号不存在' });
    }
    data.pk_users[username].password = password;
    writeData(data);
    return res.json({ success: true });
  }

  res.status(400).json({ success: false, error: '未知操作' });
});

// 启动
app.listen(PORT, () => {
  console.log(`[diet-pk-server] 已启动，端口 ${PORT}`);
  console.log(`[diet-pk-server] 数据文件: ${DATA_FILE}`);
});
