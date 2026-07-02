const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'data/users.json');
const destFile = path.join(__dirname, 'pk-sync.json');

console.log('=== 数据恢复脚本 ===');

if (!fs.existsSync(srcFile)) {
  console.error('错误：data/users.json 文件不存在');
  process.exit(1);
}

const srcData = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
console.log('源数据加载完成');

const backupFile = path.join(__dirname, 'pk-sync.json.backup.' + Date.now());
if (fs.existsSync(destFile)) {
  fs.writeFileSync(backupFile, fs.readFileSync(destFile, 'utf8'), 'utf8');
  console.log('已备份当前 pk-sync.json 到:', backupFile);
}

const newData = {
  pk_users: {
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
  },
  accounts: srcData.accounts || {},
  records: srcData.records || {},
  pkRounds: srcData.pkRounds || [],
  currentAccount: 'husband',
  custom_foods: srcData.custom_foods || {},
  custom_exercises: srcData.custom_exercises || {},
  nicknames: srcData.nicknames || {},
  setup_completed: srcData.setup_completed || {}
};

if (newData.accounts.husband) {
  newData.accounts.husband.name = '28895047';
}
if (newData.accounts.wife) {
  newData.accounts.wife.name = '13957156591';
}

fs.writeFileSync(destFile, JSON.stringify(newData, null, 2), 'utf8');

console.log('数据恢复完成！');
console.log('账号:', Object.keys(newData.pk_users));
console.log('历史记录数:', Object.keys(newData.records || {}).length, '天');
console.log('PK轮数:', (newData.pkRounds || []).length, '轮');
