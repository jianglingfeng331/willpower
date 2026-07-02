const fs = require('fs');
const path = require('path');

const syncFile = path.join(__dirname, 'pk-sync.json');

console.log('=== 用户账号迁移脚本 ===');

if (!fs.existsSync(syncFile)) {
  console.error('错误：pk-sync.json 文件不存在');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
console.log('已加载数据，当前账号:', Object.keys(data.pk_users || {}));

data.pk_users = {
  '28895047': {
    password: '',
    isAdmin: true,
    role: 'husband',
    displayName: '28895047'
  },
  '13957156591': {
    password: '',
    isAdmin: false,
    role: 'wife',
    displayName: '13957156591'
  }
};

if (!data.accounts) {
  data.accounts = {};
}
if (!data.accounts.husband) {
  data.accounts.husband = { name: '28895047', icon: '', dailyCalorieBudget: 2000, initialWeight: 98, targetWeight: 90 };
} else {
  data.accounts.husband.name = '28895047';
}
if (!data.accounts.wife) {
  data.accounts.wife = { name: '13957156591', icon: '', dailyCalorieBudget: 1500, initialWeight: 60, targetWeight: 52 };
} else {
  data.accounts.wife.name = '13957156591';
}

const backupFile = path.join(__dirname, 'pk-sync.json.backup.' + Date.now());
fs.writeFileSync(backupFile, JSON.stringify(JSON.parse(fs.readFileSync(syncFile, 'utf8')), null, 2), 'utf8');
console.log('已备份到:', backupFile);

fs.writeFileSync(syncFile, JSON.stringify(data, null, 2), 'utf8');
console.log('迁移完成！新账号:', Object.keys(data.pk_users));
console.log('历史记录数:', Object.keys(data.records || {}).length, '天');
console.log('PK轮数:', (data.pkRounds || []).length, '轮');
