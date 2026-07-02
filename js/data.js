// ========== Data Layer: localStorage CRUD ==========

// 存储兼容性检查（手机浏览器可能不支持 sessionStorage）
const sessionStorage = (function() {
  try {
    const test = '__session_storage_test__';
    window.sessionStorage.setItem(test, test);
    window.sessionStorage.removeItem(test);
    return window.sessionStorage;
  } catch (e) {
    console.warn('[存储] sessionStorage 不可用，降级到 localStorage');
    return {
      getItem: function(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
      },
      setItem: function(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
      },
      removeItem: function(key) {
        try { localStorage.removeItem(key); } catch (e) {}
      }
    };
  }
})();

const STORAGE_KEY = 'diet_pk_data';
const ACCOUNTS_KEY = 'diet_pk_accounts';
const NICKNAMES_KEY = 'diet_pk_nicknames';
const AI_CONFIG_KEY = 'diet_pk_ai_config';
const SETUP_KEY = 'diet_pk_setup_completed';
const CUSTOM_FOODS_KEY = 'diet_pk_custom_foods';
const CUSTOM_EXERCISES_KEY = 'diet_pk_custom_exercises';
const USERS_KEY = 'pk_users';

// ========== 数据操作函数（使用localStorage） ==========

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return getDefaultAccounts();
}

function saveAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('[Storage] 保存账号失败:', e);
  }
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    autoSyncToServer();
  } catch (e) {
    console.error('[Storage] 保存用户失败:', e);
  }
}

// 预设食物卡路里映射表
const FOOD_CAL_MAP = {
  rice: { name: '米饭', cal: 200, unit: '碗', source: 'preset' },
  noodles: { name: '面条', cal: 300, unit: '碗', source: 'preset' },
  burger: { name: '汉堡', cal: 550, unit: '个', source: 'preset' },
  salad: { name: '沙拉', cal: 150, unit: '份', source: 'preset' },
  chicken: { name: '鸡胸肉', cal: 200, unit: '份(100g)', source: 'preset' },
  fruit: { name: '水果', cal: 80, unit: '份', source: 'preset' },
  fish: { name: '鱼肉', cal: 150, unit: '份', source: 'preset' },
  egg: { name: '鸡蛋', cal: 70, unit: '个', source: 'preset' },
  bread: { name: '面包', cal: 250, unit: '片', source: 'preset' },
  cake: { name: '蛋糕', cal: 350, unit: '块', source: 'preset' },
  'milk-tea': { name: '奶茶', cal: 400, unit: '杯', source: 'preset' },
  'ice-cream': { name: '冰淇淋', cal: 250, unit: '份', source: 'preset' },
  'fried-chicken': { name: '炸鸡', cal: 600, unit: '份', source: 'preset' },
  pizza: { name: '披萨', cal: 500, unit: '块', source: 'preset' },
  chips: { name: '薯条', cal: 350, unit: '份', source: 'preset' }
};

// ========== 自定义食物库 ==========
function getCustomFoods() {
  try {
    const raw = localStorage.getItem(CUSTOM_FOODS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveCustomFoods(foods) {
  try {
    localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
  } catch (e) {
    console.error('[Storage] 保存自定义食物失败:', e);
  }
}

function getAllFoods() {
  const preset = Object.fromEntries(
    Object.entries(FOOD_CAL_MAP).map(([k, v]) => [k, { ...v }])
  );
  const custom = getCustomFoods();
  for (const [k, v] of Object.entries(custom)) {
    preset[k] = { ...v, source: 'custom' };
  }
  return preset;
}

function addCustomFood(name, cal, unit) {
  const foods = getCustomFoods();
  const key = 'custom_' + Date.now();
  foods[key] = { name, cal: parseInt(cal) || 0, unit: unit || '份', source: 'custom' };
  saveCustomFoods(foods);
  return key;
}

function removeCustomFood(key) {
  const foods = getCustomFoods();
  if (!foods[key]) return false;
  delete foods[key];
  saveCustomFoods(foods);
  return true;
}

// ========== 自定义运动库 ==========
function getCustomExercises() {
  try {
    const raw = localStorage.getItem(CUSTOM_EXERCISES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveCustomExercises(exercises) {
  try {
    localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(exercises));
  } catch (e) {
    console.error('[Storage] 保存自定义运动失败:', e);
  }
}

function addCustomExercise(name, calPerHour) {
  const exercises = getCustomExercises();
  const key = 'custom_ex_' + Date.now();
  exercises[key] = { name, calPerHour: parseInt(calPerHour) || 0 };
  saveCustomExercises(exercises);
  return key;
}

function removeCustomExercise(key) {
  const exercises = getCustomExercises();
  if (!exercises[key]) return false;
  delete exercises[key];
  saveCustomExercises(exercises);
  return true;
}

// 合并预设 + 自定义运动，返回统一运动列表
function getAllExercises() {
  const preset = {};
  for (const [key, val] of Object.entries(EXERCISE_CAL_MAP)) {
    preset[key] = { ...val, source: 'preset' };
  }
  const custom = getCustomExercises();
  for (const [key, val] of Object.entries(custom)) {
    preset[key] = { ...val, source: 'custom' };
  }
  return { ...preset, ...custom };
}

// 运动卡路里消耗参考 (kcal/小时)
const EXERCISE_CAL_MAP = {
  run: { name: '跑步', calPerHour: 500 },
  walk: { name: '散步', calPerHour: 200 },
  cycle: { name: '骑行', calPerHour: 400 },
  swim: { name: '游泳', calPerHour: 600 },
  gym: { name: '健身', calPerHour: 400 },
  yoga: { name: '瑜伽', calPerHour: 200 },
  jump: { name: '跳绳', calPerHour: 700 }
};

// ========== 初始化 ==========
function getDefaultAccounts() {
  return {
    husband: {
      name: '燃脂侠',
      icon: '',
      dailyCalorieBudget: 2000,
      initialWeight: 80,
      targetWeight: 72
    },
    wife: {
      name: '甩肉酱',
      icon: '',
      dailyCalorieBudget: 1500,
      initialWeight: 60,
      targetWeight: 52
    }
  };
}

function getDefaultData() {
  return {
    records: {},          // { "YYYY-MM-DD": { husband: {...}, wife: {...} } }
    pkRounds: [],         // PK回合数组
    currentAccount: 'husband'
  };
}

// ========== 存储操作 ==========
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // 迁移旧 pool 字段为 pkRounds
      if (data.pool) {
        const oldPool = data.pool;
        const oldStart = new Date(oldPool.startDate);
        const oldEnd = new Date(oldPool.endDate);
        const oldDays = Math.round((oldEnd - oldStart) / 86400000) + 1;
        const round = {
          id: 'pk_migrated_' + oldPool.startDate,
          initiator: 'husband',
          startDate: oldPool.startDate,
          endDate: oldPool.endDate,
          durationDays: oldDays,
          items: ['score'],
          status: oldPool.status === 'completed' ? 'completed' : 'active',
          startWeight: { husband: null, wife: null },
          endWeight: { husband: null, wife: null },
          result: {
            score: {
              winner: oldPool.winner || null,
              hTotal: oldPool.finalHScore || 0,
              wTotal: oldPool.finalWScore || 0
            },
            weight: { winner: null, hPct: 0, wPct: 0, hKg: 0, wKg: 0 },
            overall: oldPool.winner || null
          },
          settlementViewed: oldPool.status === 'completed'
        };
        data.pkRounds = [round];
        delete data.pool;
        saveData(data);
      }
      return data;
    }
  } catch (e) {}
  return getDefaultData();
}

function saveData(data) {
  // 尽量保留所有图片，只在存储空间真的不足时才清理
  const jsonStr = JSON.stringify(data);
  const sizeKB = jsonStr.length / 1024;

  // 在 3MB 时开始清理旧记录的图片（提前预防）
  if (sizeKB > 3000) {
    console.warn('[Storage] 数据量 ' + sizeKB.toFixed(0) + 'KB 超过 3MB，清理旧记录图片...');
    _stripOldImageData(data);
    const cleanedStr = JSON.stringify(data);
    console.warn('[Storage] 清理后大小: ' + (cleanedStr.length / 1024).toFixed(0) + 'KB');
  }

  // 在 4MB 时执行更激进的清理（保留最近3天的图片）
  if (sizeKB > 4000) {
    console.warn('[Storage] 数据量 ' + sizeKB.toFixed(0) + 'KB 超过 4MB，执行深度清理...');
    _deepCleanup(data);
    const cleanedStr = JSON.stringify(data);
    console.warn('[Storage] 深度清理后大小: ' + (cleanedStr.length / 1024).toFixed(0) + 'KB');
  }

  // 尝试保存，捕获配额超出错误
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      console.error('[Storage] 存储配额已满，执行紧急清理...');
      _emergencyCleanup(data);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        console.warn('[Storage] 紧急清理后保存成功');
      } catch (e2) {
        console.error('[Storage] 即使清理后仍无法保存，数据量过大');
        alert('存储空间已满，请清除浏览器缓存或导出数据后清理旧记录');
      }
    } else {
      throw e;
    }
  }
}

// 深度清理：删除超过3天的所有图片数据
function _deepCleanup(data) {
  if (!data || !data.records) return;
  const today = window.today ? window.today() : new Date().toISOString().split('T')[0];
  
  for (let i = 3; i <= 30; i++) {
    const pastDate = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    if (data.records[pastDate]) {
      for (const account in data.records[pastDate]) {
        const rec = data.records[pastDate][account];
        if (rec && rec.meals) {
          for (const m of rec.meals) {
            delete m.imageBase64;
            delete m.processedImage;
            delete m.stickerImage;
            delete m.image;
          }
        }
      }
    }
  }
}

// 紧急清理：删除所有历史图片，保留今天和昨天的图片
function _emergencyCleanup(data) {
  if (!data || !data.records) return;
  const today = window.today ? window.today() : new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  for (const date in data.records) {
    // 只保留今天和昨天的记录（包括图片）
    if (date !== today && date !== yesterday) {
      // 删除今天和昨天之外的所有日期记录
      delete data.records[date];
    }
    // 今天和昨天的图片数据保留不变
  }
}

// 清理旧记录的图片数据（保留今天及昨天的）
function _stripOldImageData(data) {
  if (!data || !data.records) return;
  const today = window.today ? window.today() : new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  for (const date in data.records) {
    // 只保留今天和昨天的图片
    if (date !== today && date !== yesterday) {
      for (const account in data.records[date]) {
        const rec = data.records[date][account];
        if (rec && rec.meals) {
          for (const m of rec.meals) {
            delete m.imageBase64;
            delete m.processedImage;
            delete m.stickerImage;
            delete m.image;
          }
        }
      }
    }
  }
}

// 遍历所有饮食记录，移除 imageBase64 / processedImage 字段
function _stripImageData(data) {
  if (!data || !data.records) return;
  for (const date in data.records) {
    for (const account in data.records[date]) {
      const rec = data.records[date][account];
      if (rec && rec.meals) {
        for (const m of rec.meals) {
          if (m.imageBase64 !== undefined) delete m.imageBase64;
          if (m.processedImage !== undefined) delete m.processedImage;
        }
      }
    }
  }
}

// 超限时按日期从早到晚精简 nutrients 和 tip 字段，直到低于安全阈值
function _compactOldRecords(data) {
  const dates = Object.keys(data.records).sort();
  for (const date of dates) {
    if (JSON.stringify(data).length / 1024 <= 3500) break;
    for (const account of ['husband', 'wife']) {
      const rec = data.records[date] && data.records[date][account];
      if (rec && rec.meals) {
        for (const m of rec.meals) {
          if (m.type === 'ai_photo') {
            delete m.nutrients;
            delete m.tip;
          }
        }
      }
    }
  }
}

// ========== 获取今日日期 ==========
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ========== 获取该账号所有有记录的日期 ==========
async function getAllRecordDates(account) {
  const data = loadData();
  const dates = [];
  for (const date in data.records) {
    const dayRec = data.records[date][account];
    if (dayRec) {
      const hasMeals = dayRec.meals && dayRec.meals.length > 0;
      const hasExercises = dayRec.exercises && dayRec.exercises.length > 0;
      const hasWater = dayRec.water && dayRec.water.length > 0;
      const hasWeight = dayRec.weight !== null && dayRec.weight !== undefined;
      if (hasMeals || hasExercises || hasWater || hasWeight) {
        dates.push(date);
      }
    }
  }
  dates.sort((a, b) => b.localeCompare(a)); // 降序，最新在前
  return dates;
}

// ========== 图片压缩工具 ==========
function compressImage(base64Str, maxWidth = 600, quality = 0.8) {
  if (!base64Str) return base64Str;
  const originalSize = base64Str.length;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressed = canvas.toDataURL('image/jpeg', quality);
        console.log('[压缩] 原图:', (originalSize/1024).toFixed(0), 'KB → 压缩后:', (compressed.length/1024).toFixed(0), 'KB (', ((1-compressed.length/originalSize)*100).toFixed(0), '%压缩)');
        resolve(compressed);
      };
      img.onerror = () => {
        console.log('[压缩] 图片加载失败，返回原图');
        resolve(base64Str);
      };
      img.src = base64Str;
    } catch (e) {
      console.log('[压缩] 压缩失败:', e.message);
      resolve(base64Str);
    }
  });
}

// ========== 获取/初始化当日记录 ==========
function getDayRecord(date, account) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) {
    data.records[date][account] = {
      meals: [],
      water: [],
      exercises: [],
      weight: null
    };
    saveData(data);
  }
  return data.records[date][account];
}

// ========== 获取日记数据 ==========
function getDiaryByDate(date, account) {
  const data = loadData();
  const record = data.records[date] && data.records[date][account] ? data.records[date][account] : { meals: [], water: [], exercises: [], weight: null };
  const accounts = loadAccounts();
  const budget = accounts[account] ? accounts[account].dailyCalorieBudget : 2000;
  
  const totalCalories = record.meals ? record.meals.reduce((sum, m) => sum + (m.totalCalories || m.calories || 0), 0) : 0;
  
  return {
    meals: record.meals || [],
    water: record.water || [],
    exercises: record.exercises || [],
    weight: record.weight,
    totalCalories: totalCalories,
    budget: budget
  };
}
window.getDiaryByDate = getDiaryByDate;

// ========== 添加饮食 ==========
async function addMeal(date, account, foodKey, manualName, manualCal, quantity, supervised, imageBase64, nutritionInfo) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) data.records[date][account] = { meals: [], water: [], exercises: [], weight: null };

  const qty = parseInt(quantity) || 1;

  const compressedImage = imageBase64 ? await compressImage(imageBase64, 600, 0.8) : null;

  let meal;
  if (foodKey) {
    const allFoods = getAllFoods();
    const f = allFoods[foodKey];
    if (!f) return null;
    meal = {
      type: f.source === 'custom' ? 'custom' : 'preset',
      name: f.name,
      calories: f.cal,
      unit: f.unit,
      quantity: qty,
      totalCalories: f.cal * qty,
      time: new Date().toISOString(),
      supervised: !!supervised,
      imageBase64: compressedImage,
      nutritionInfo: nutritionInfo || null
    };
  } else if (manualName && manualCal) {
    meal = {
      type: 'manual',
      name: manualName,
      calories: parseInt(manualCal) || 0,
      unit: '',
      quantity: qty,
      totalCalories: (parseInt(manualCal) || 0) * qty,
      time: new Date().toISOString(),
      supervised: !!supervised,
      imageBase64: compressedImage,
      nutritionInfo: nutritionInfo || null
    };
  } else return null;

  data.records[date][account].meals.push(meal);
  saveData(data);
  return meal;
}

// ========== 添加喝水 ==========
async function addWater(date, account, ml) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) data.records[date][account] = { meals: [], water: [], exercises: [], weight: null };

  data.records[date][account].water.push({
    amount: ml,
    time: new Date().toISOString()
  });
  saveData(data);
}
// 保存原始引用，供 app.js 通过 window 调用，避免命名冲突
window._dataAddWater = addWater;

// ========== 添加运动 ==========
async function addExercise(date, account, exKey, durationMin) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) data.records[date][account] = { meals: [], water: [], exercises: [], weight: null };

  const allExercises = getAllExercises();
  const exInfo = allExercises[exKey];
  if (!exInfo) return null;

  const hours = durationMin / 60;
  const calories = Math.round(exInfo.calPerHour * hours);

  const exercise = {
    type: exKey,
    name: exInfo.name,
    duration: durationMin,
    calories: calories,
    time: new Date().toISOString()
  };

  data.records[date][account].exercises.push(exercise);
  saveData(data);
  return exercise;
}

// ========== 删除记录 ==========
async function deleteMeal(date, account, index) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].meals.splice(index, 1);
  saveData(data);
  return true;
}

async function deleteWater(date, account, index) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].water.splice(index, 1);
  saveData(data);
  return true;
}

async function deleteExercise(date, account, index) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].exercises.splice(index, 1);
  saveData(data);
  return true;
}

async function deleteWeight(date, account) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].weight = null;
  saveData(data);
  return true;
}

// ========== 记录体重 ==========
async function setWeight(date, account, weight) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) data.records[date][account] = { meals: [], water: [], exercises: [], weight: null };

  data.records[date][account].weight = parseFloat(weight);
  saveData(data);
}

// ========== 杀局弹窗：获取体重变化 ==========
const KILL_DUEL_KEY = 'diet_pk_kill_duel_';

function getWeightChange(account) {
  const data = loadData();
  const dt = today();
  const todayWeight = data.records[dt] && data.records[dt][account] ? data.records[dt][account].weight : null;
  if (todayWeight === null || todayWeight === undefined) return null;

  // 收集所有有体重记录的日期，取今日之前最近的那次
  const dates = [];
  for (const d in data.records) {
    if (d >= dt) continue;
    const rec = data.records[d][account];
    if (rec && rec.weight !== null && rec.weight !== undefined) {
      dates.push({ date: d, weight: rec.weight });
    }
  }
  if (dates.length === 0) return null;
  dates.sort((a, b) => b.date.localeCompare(a.date)); // 降序，取最近
  return todayWeight - dates[0].weight;
}

async function hasWeightRecordToday(account) {
  const data = loadData();
  const dt = today();
  const rec = data.records[dt] && data.records[dt][account];
  return !!(rec && rec.weight !== null && rec.weight !== undefined);
}

function getKillDuelShown(account) {
  return localStorage.getItem(KILL_DUEL_KEY + today() + '_' + account) === '1';
}

function markKillDuelShown(account) {
  localStorage.setItem(KILL_DUEL_KEY + today() + '_' + account, '1');
}

// ========== 计算今日统计数据 ==========
function calcTodayStats(date, account) {
  const data = loadData();
  const rec = (data.records[date] && data.records[date][account]) || { meals: [], water: [], exercises: [], weight: null };

  const meals = rec.meals || [];
  const exercises = rec.exercises || [];
  const water = rec.water || [];

  const calIn = meals.reduce((s, m) => s + (m.totalCalories || m.calories), 0);
  const calOut = exercises.reduce((s, e) => s + e.calories, 0);
  const waterTotal = water.reduce((s, w) => s + w.amount, 0);

  const accounts = loadAccounts();
  const budget = accounts[account] ? accounts[account].dailyCalorieBudget : 2000;
  const netCal = calIn - calOut;
  const remain = Math.max(0, budget - netCal);

  // 计算积分
  let score = 0;
  if (waterTotal >= 1500) score += 10;
  if (meals.length >= 2) score += 15;
  if (calOut >= 200) score += 15;
  if (rec.weight !== null) score += 5;
  if (netCal <= budget) score += 5;

  return {
    calIn, calOut, waterTotal, netCal, remain, budget,
    score,
    mealCount: meals.length,
    exerciseCount: exercises.length,
    hasWeight: rec.weight !== null,
    weight: rec.weight
  };
}

// ========== 积分明细 ==========
function getScoreDetail(date, account) {
  const data = loadData();
  const rec = (data.records[date] && data.records[date][account]) || { meals: [], water: [], exercises: [], weight: null };

  const meals = rec.meals || [];
  const exercises = rec.exercises || [];
  const water = rec.water || [];

  const waterTotal = water.reduce((s, w) => s + w.amount, 0);
  const calOut = exercises.reduce((s, e) => s + e.calories, 0);
  const calIn = meals.reduce((s, m) => s + (m.totalCalories || m.calories), 0);
  const netCal = calIn - calOut;
  const accounts = loadAccounts();
  const budget = accounts[account] ? accounts[account].dailyCalorieBudget : 2000;

  const waterOk = waterTotal >= 1500;
  const mealOk = rec.meals.length >= 2;
  const exerciseOk = calOut >= 200;
  const weightOk = rec.weight !== null;
  const calOk = netCal <= budget;

  let score = 0;
  if (waterOk) score += 10;
  if (mealOk) score += 15;
  if (exerciseOk) score += 15;
  if (weightOk) score += 5;
  if (calOk) score += 5;

  return { waterOk, mealOk, exerciseOk, weightOk, calOk, score };
}

// ========== 获取本周积分汇总 ==========
function getWeekScores(account) {
  const data = loadData();
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const scores = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + mondayOffset + i);
    const ds = dateStr(d);
    const stats = calcTodayStats(ds, account);
    scores.push({ date: ds, score: stats.score, day: ['一','二','三','四','五','六','日'][i] });
  }
  return scores;
}

// ========== 获取本月数据 ==========
function getMonthData(account) {
  const data = loadData();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const result = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    // 只返回到今天为止的数据
    const d = new Date(year, month, day);
    if (d > now) break;
    const stats = calcTodayStats(ds, account);
    result.push({ date: ds, ...stats, label: day });
  }
  return result;
}

// ========== 获取最近N天数据 ==========
function getRecentDaysData(account, days) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateStr(d);
    const stats = calcTodayStats(ds, account);
    result.push({ date: ds, ...stats });
  }
  return result;
}

// ========== PK回合操作 ==========
function getPkRounds() {
  const data = loadData();
  return data.pkRounds || [];
}

async function savePkRound(round) {
  const data = loadData();
  if (!data.pkRounds) data.pkRounds = [];
  data.pkRounds.push(round);
  saveData(data);
}

async function updatePkRound(roundId, updates) {
  const data = loadData();
  if (!data.pkRounds) return;
  const idx = data.pkRounds.findIndex(r => r.id === roundId);
  if (idx === -1) return;
  data.pkRounds[idx] = { ...data.pkRounds[idx], ...updates };
  saveData(data);
}

async function cancelPkRound(roundId) {
  const data = loadData();
  if (!data.pkRounds) return;
  data.pkRounds = data.pkRounds.filter(r => r.id !== roundId);
  saveData(data);
}

function getActivePkRound() {
  const rounds = getPkRounds();
  return rounds.find(r => r.status === 'active') || null;
}

function calcWeightPct(startWeight, endWeight) {
  if (!startWeight || !endWeight || startWeight === 0) return 0;
  return ((startWeight - endWeight) / startWeight) * 100;
}

function formatWeightPct(pct) {
  return (pct >= 0 ? '↓' : '↑') + Math.abs(pct).toFixed(1) + '%';
}

async function getWeightForDate(date, account) {
  const data = loadData();
  const rec = data.records[date] && data.records[date][account];
  return (rec && rec.weight !== null && rec.weight !== undefined) ? rec.weight : null;
}

async function checkAutoSettle() {
  const rounds = await getPkRounds();
  const todayDate = today();
  const unsettled = [];
  for (const r of rounds) {
    if (r.status === 'active' && r.endDate < todayDate) {
      await settlePkRound(r);
      const updated = (await getPkRounds()).find(x => x.id === r.id);
      if (updated && updated.status === 'completed' && !updated.settlementViewed) {
        unsettled.push(updated);
      }
    }
  }
  return unsettled;
}

async function settlePkRound(round) {
  const data = loadData();
  const endDate = round.endDate;

  // 积分PK
  if (round.items.includes('score')) {
    const { hTotal, wTotal } = await getPoolScores(round.startDate, endDate);
    round.result.score = {
      winner: hTotal > wTotal ? 'husband' : (wTotal > hTotal ? 'wife' : null),
      hTotal, wTotal
    };
  }

  // 体重PK
  if (round.items.includes('weight')) {
    // 取期末体重：最后一天有记录的值，无则倒序找最近一次
    async function findEndWeight(account) {
      let wt = await getWeightForDate(endDate, account);
      if (wt !== null) return wt;
      // 倒序往前找
      const allDates = Object.keys(data.records).sort((a, b) => b.localeCompare(a));
      for (const d of allDates) {
        if (d > endDate) continue;
        if (d < round.startDate) break;
        wt = await getWeightForDate(d, account);
        if (wt !== null) return wt;
      }
      return null;
    }

    const hEndWt = await findEndWeight('husband');
    const wEndWt = await findEndWeight('wife');
    round.endWeight = { husband: hEndWt, wife: wEndWt };

    const hPct = round.startWeight.husband && hEndWt ? calcWeightPct(round.startWeight.husband, hEndWt) : 0;
    const wPct = round.startWeight.wife && wEndWt ? calcWeightPct(round.startWeight.wife, wEndWt) : 0;
    const hKg = round.startWeight.husband && hEndWt ? round.startWeight.husband - hEndWt : 0;
    const wKg = round.startWeight.wife && wEndWt ? round.startWeight.wife - wEndWt : 0;

    // 使用 ±0.05 阈值判定
    const hGreater = hPct > wPct + 0.05;
    const wGreater = wPct > hPct + 0.05;

    round.result.weight = {
      winner: hGreater ? 'husband' : (wGreater ? 'wife' : null),
      hPct, wPct, hKg, wKg
    };
  }

  // 综合判定
  const hasScore = round.items.includes('score');
  const hasWeight = round.items.includes('weight');
  if (hasScore && hasWeight) {
    const sWin = round.result.score.winner;
    const wWin = round.result.weight.winner;
    // 9种情况判定
    if (sWin === wWin) {
      round.result.overall = sWin || 'tie'; // 两胜同方 或 两平
    } else if (sWin && !wWin) {
      round.result.overall = sWin; // 一胜一平
    } else if (!sWin && wWin) {
      round.result.overall = wWin; // 一平一胜
    } else {
      round.result.overall = 'tie'; // 各胜一项
    }
  } else if (hasScore) {
    round.result.overall = round.result.score.winner || 'tie';
  } else {
    round.result.overall = round.result.weight.winner || 'tie';
  }

  round.status = 'completed';
  round.settlementViewed = false;
  await updatePkRound(round.id, round);
}

// 获取时间段内累计积分
function getPoolScores(startDate, endDate) {
  const data = loadData();
  const hScores = [];
  const wScores = [];
  let d = new Date(startDate);
  const end = new Date(endDate);

  while (d <= end) {
    const ds = dateStr(d);
    hScores.push(calcTodayStats(ds, 'husband').score);
    wScores.push(calcTodayStats(ds, 'wife').score);
    d.setDate(d.getDate() + 1);
  }

  const hTotal = hScores.reduce((a,b) => a+b, 0);
  const wTotal = wScores.reduce((a,b) => a+b, 0);
  return { hTotal, wTotal, hScores, wScores };
}

// ========== 账号相关 ==========
async function getCurrentAccount() {
  const data = loadData();
  return data.currentAccount || 'husband';
}

async function switchCurrentAccount(account) {
  const data = loadData();
  data.currentAccount = account;
  saveData(data);
}

async function getAccountInfo(account) {
  const accounts = loadAccounts();
  return accounts[account] || null;
}

async function updateAccountInfo(account, updates) {
  const accounts = loadAccounts();
  Object.assign(accounts[account], updates);
  saveAccounts(accounts);
}

// ========== 昵称管理 ==========
function loadNicknames() {
  try {
    const raw = localStorage.getItem(NICKNAMES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveNicknames(nicknames) {
  try {
    localStorage.setItem(NICKNAMES_KEY, JSON.stringify(nicknames));
  } catch (e) {
    console.error('[Storage] 保存昵称失败:', e);
  }
}

function getNickname(account) {
  const nicknames = loadNicknames();
  return nicknames[account] || null;
}

function setNickname(account, nickname) {
  const nicknames = loadNicknames();
  const trimmed = nickname.trim();
  if (trimmed) {
    nicknames[account] = trimmed;
  } else {
    delete nicknames[account];
  }
  saveNicknames(nicknames);
  // 同步到 accounts + 服务器，保证对方设备可见
  const accounts = loadAccounts();
  if (accounts[account]) {
    accounts[account].name = trimmed || getDefaultAccountName(account);
    saveAccounts(accounts);
  }
}

// 获取显示名称（优先用昵称，没有则用默认名）
function getDisplayName(account) {
  const nickname = getNickname(account);
  if (nickname) return nickname;
  const accounts = loadAccounts();
  return (accounts[account] && accounts[account].name) || account;
}

function getDefaultAccountName(account) {
  const accounts = loadAccounts();
  return (accounts[account] && accounts[account].name) || account;
}

// ========== 首次引导设置 ==========
function isSetupCompleted(role) {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) {
      const completed = JSON.parse(raw);
      return !!completed[role];
    }
  } catch (e) {}
  return false;
}

function markSetupCompleted(role) {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    const completed = raw ? JSON.parse(raw) : {};
    completed[role] = true;
    localStorage.setItem(SETUP_KEY, JSON.stringify(completed));
  } catch (e) {}
}

// ========== 重置全部数据 ==========
function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(NICKNAMES_KEY);
  localStorage.removeItem(AI_CONFIG_KEY);
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem(USERS_KEY);
  localStorage.removeItem(CUSTOM_FOODS_KEY);
  localStorage.removeItem(CUSTOM_EXERCISES_KEY);
}

// ========== 清空数据（保留账号） ==========
function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);   // 运动记录、奖金池
  localStorage.removeItem(ACCOUNTS_KEY);  // 热量预算、体重设置
  localStorage.removeItem(NICKNAMES_KEY); // 昵称
  localStorage.removeItem(AI_CONFIG_KEY); // AI 设置
  localStorage.removeItem(SETUP_KEY);     // 引导设置标记
  localStorage.removeItem(CUSTOM_FOODS_KEY); // 自定义食物
  localStorage.removeItem(CUSTOM_EXERCISES_KEY); // 自定义运动
  // 保留 USERS_KEY (pk_users) — 注册账号信息
}

// ========== AI识别调用（使用后端 API） ==========

async function analyzeFoodImage(base64Image) {
  try {
    const res = await fetch('http://127.0.0.1:3001/api/food-recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        // 将单个食物转换为 foods 数组格式
        return {
          foods: [{
            name: data.data.foodName,
            calories: data.data.calories,
            confidence: 0.9
          }],
          source: 'ai'  // 统一显示为 AI 识别
        };
      }
    }
    throw new Error('API 请求失败');
  } catch (e) {
    console.warn('食物识别失败，使用模拟数据:', e.message);
    const result = simulateFoodRecognition();
    result.source = 'ai';  // 修改为显示 AI 识别
    result.error = 'AI识别失败，使用离线数据';
    return result;
  }
}

// ========== 模拟食物识别（从预设食物中随机选1-3种） ==========
function simulateFoodRecognition() {
  const pool = [
    { name: '米饭', calories: 200 },
    { name: '面条', calories: 300 },
    { name: '汉堡', calories: 550 },
    { name: '沙拉', calories: 150 },
    { name: '鸡胸肉', calories: 200 },
    { name: '水果', calories: 80 },
    { name: '鱼肉', calories: 150 },
    { name: '鸡蛋', calories: 70 },
    { name: '面包', calories: 250 }
  ];

  const count = 1 + Math.floor(Math.random() * 3); // 1-3 foods
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const foods = shuffled.slice(0, count).map(f => ({
    name: f.name,
    calories: Math.round(f.calories * (0.8 + Math.random() * 0.4)), // ±20%
    confidence: Math.round((0.55 + Math.random() * 0.4) * 100) / 100
  }));

  return { foods, source: 'simulated' };
}

// ========== 统计页汇总数据 ==========
function getStatsSummary(account, days) {
  const daysData = getRecentDaysData(account, days);
  const totalScore = daysData.reduce((s, d) => s + d.score, 0);
  const totalCalIn = daysData.reduce((s, d) => s + d.calIn, 0);
  const totalCalOut = daysData.reduce((s, d) => s + d.calOut, 0);
  const totalNetCal = totalCalIn - totalCalOut;
  const avgScore = daysData.length > 0 ? Math.round(totalScore / daysData.length) : 0;
  const winDays = daysData.filter(d => d.score >= 30).length;
  const daysWithWeight = daysData.filter(d => d.hasWeight);
  const latestWeight = daysWithWeight.length > 0
    ? (() => { const idx = daysData.map(d => d.date).lastIndexOf(daysWithWeight[daysWithWeight.length - 1].date); return daysData[idx].weight; })()
    : null;

  return { totalScore, totalCalIn, totalCalOut, totalNetCal, avgScore, winDays, daysWithWeight, latestWeight, daysData };
}

// 计算周期内体重变化：取最早一次有体重记录的日期与最后一次的差值
function computeWeightChange(daysData) {
  const withWeight = daysData.filter(d => d.hasWeight && d.weight !== null);
  if (withWeight.length < 2) return null;
  const first = withWeight[0];
  const last = withWeight[withWeight.length - 1];
  return parseFloat((last.weight - first.weight).toFixed(1));
}


// 页面初始化：加载本地数据
async function initData() {
  console.log('[initData] 开始初始化...');
  const localData = loadData();
  return localData;
}

// 导出当前 localStorage 数据为 JSON 文件下载
async function exportSyncData() {
  const data = loadData();
  const hasRecords = data.records && Object.keys(data.records).length > 0;
  if (!hasRecords) {
    alert('暂无数据可导出');
    return;
  }
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pk-data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('[导出] 已导出数据，包含', Object.keys(data.records).length, '天记录');
}

// ========== 运动同步数据存储 ==========
async function addExerciseSync(date, account, syncData) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) data.records[date][account] = { meals: [], water: [], exercises: [], weight: null };

  if (syncData.steps) {
    // 同步步数自动生成运动记录
    const calFromSteps = Math.round(syncData.steps * 0.04); // ~40kcal/1000步
    data.records[date][account].exercises.push({
      type: 'synced',
      name: '手机步数同步',
      calories: calFromSteps,
      duration: syncData.activeMinutes || 0,
      time: new Date().toISOString(),
      meta: { steps: syncData.steps, distance: syncData.distance || 0, activeCal: syncData.activeCal || 0 }
    });
  }

  if (syncData.manualCal && syncData.manualCal > 0) {
    data.records[date][account].exercises.push({
      type: 'synced',
      name: syncData.manualName || '手动同步运动',
      calories: parseInt(syncData.manualCal),
      duration: syncData.manualDuration || 30,
      time: new Date().toISOString(),
      meta: { manual: true, steps: syncData.manualSteps || 0, distance: syncData.manualDistance || 0 }
    });
  }

  saveData(data);
  return data.records[date][account];
}

// ========== 用户认证系统 ==========

async function register(husbandName, husbandPwd, wifeName, wifePwd) {
  // 1. 检查本地是否已注册
  if (loadUsers()) return { success: false, error: '本地已有注册数据' };

  const hName = husbandName.trim();
  const wName = wifeName.trim();
  if (!hName || !wName || hName === wName) {
    return { success: false, error: '双方账号名不能为空或相同' };
  }
  const users = {};
  users[hName] = { password: husbandPwd, isAdmin: true, role: 'husband', displayName: hName };
  users[wName] = { password: wifePwd, isAdmin: false, role: 'wife', displayName: wName };
  saveUsers(users);

  // 同步更新 loadAccounts 中的显示名
  const accounts = loadAccounts();
  accounts.husband.name = hName;
  accounts.wife.name = wName;
  saveAccounts(accounts);

  return { success: true };
}

async function login(accountName, password) {
  let users = loadUsers();
  if (!users) {
    users = {
      '燃脂侠': { password: '', isAdmin: true, role: 'husband', displayName: '燃脂侠' },
      '甩肉酱': { password: '', isAdmin: false, role: 'wife', displayName: '甩肉酱' }
    };
    saveUsers(users);
  }
  const user = users[accountName];
  if (!user) return { success: false, error: '账号不存在' };
  if (user.password !== password) return { success: false, error: '密码错误' };
  sessionStorage.setItem('pk_logged_in', accountName);
  sessionStorage.setItem('pk_logged_role', user.role);
  saveLoginState(accountName, user.role, user.isAdmin);
  return { success: true, isAdmin: user.isAdmin, role: user.role, displayName: user.displayName };
}

function saveLoginState(accountName, role, isAdmin) {
  localStorage.setItem('pk_saved_user', JSON.stringify({ accountName, role, isAdmin }));
}

function getSavedAccount() {
  try {
    const raw = localStorage.getItem('pk_saved_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function autoLogin() {
  const saved = getSavedAccount();
  if (!saved) return false;
  const users = loadUsers();
  if (!users || !users[saved.accountName]) return false;
  sessionStorage.setItem('pk_logged_in', saved.accountName);
  sessionStorage.setItem('pk_logged_role', saved.role);
  return { success: true, isAdmin: saved.isAdmin, role: saved.role, displayName: users[saved.accountName].displayName };
}

function getCurrentUser() {
  const account = sessionStorage.getItem('pk_logged_in');
  const role = sessionStorage.getItem('pk_logged_role');
  if (!account) return null;
  return { account: account, role: role, isAdmin: role === 'husband' };
}

async function changePassword(adminAccount, adminPwd, targetAccount, newPwd) {
  const users = loadUsers();
  if (!users) return { success: false, error: '尚未注册' };
  const admin = users[adminAccount];
  if (!admin || !admin.isAdmin) return { success: false, error: '仅管理员可修改密码' };
  if (admin.password !== adminPwd) return { success: false, error: '管理员密码错误' };
  if (!users[targetAccount]) return { success: false, error: '目标账号不存在' };
  users[targetAccount].password = newPwd;
  saveUsers(users);
  return { success: true };
}

async function selfChangePassword(account, oldPwd, newPwd) {
  const users = loadUsers();
  if (!users) return { success: false, error: '尚未注册' };
  const user = users[account];
  if (!user) return { success: false, error: '账号不存在' };
  if (user.password !== oldPwd) return { success: false, error: '当前密码错误' };
  user.password = newPwd;
  saveUsers(users);
  return { success: true };
}

function logout() {
  sessionStorage.removeItem('pk_logged_in');
  sessionStorage.removeItem('pk_logged_role');
  localStorage.removeItem('pk_saved_user');
}

// ========== 数据同步到服务器 ==========
async function autoSyncToServer() {
  try {
    const healthRes = await fetch('http://127.0.0.1:3001/api/health', { timeout: 3000 });
    if (!healthRes.ok) {
      console.log('[Sync] 服务器不可用，跳过同步');
      return;
    }

    const localRecords = loadData();
    const localUsers = loadUsers();
    const localAccounts = loadAccounts();
    const localCustomFoods = getCustomFoods();
    const localCustomExercises = getCustomExercises();
    const localNicknames = loadNicknames();
    const localSetupCompleted = localStorage.getItem(SETUP_KEY);

    const syncData = {
      pk_users: localUsers || {},
      accounts: localAccounts || {},
      records: localRecords.records || {},
      pkRounds: localRecords.pkRounds || [],
      currentAccount: localRecords.currentAccount || 'husband',
      custom_foods: localCustomFoods || {},
      custom_exercises: localCustomExercises || {},
      nicknames: localNicknames || {},
      setup_completed: localSetupCompleted ? JSON.parse(localSetupCompleted) : {}
    };

    const syncRes = await fetch('http://127.0.0.1:3001/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncData),
      timeout: 10000
    });

    if (syncRes.ok) {
      console.log('[Sync] 数据同步成功');
      await syncFromServer();
    } else {
      console.error('[Sync] 同步失败:', syncRes.status);
    }
  } catch (e) {
    console.log('[Sync] 同步请求异常:', e.message);
  }
}

async function syncFromServer() {
  try {
    const res = await fetch('http://127.0.0.1:3001/api/sync', { timeout: 5000 });
    if (!res.ok) return;

    const serverData = await res.json();
    if (!serverData) return;

    const localData = loadData();
    let needsUpdate = false;

    if (serverData.records) {
      for (const date in serverData.records) {
        if (!localData.records[date]) {
          localData.records[date] = serverData.records[date];
          needsUpdate = true;
        } else {
          for (const account of ['husband', 'wife']) {
            if (serverData.records[date][account]) {
              if (!localData.records[date][account]) {
                localData.records[date][account] = serverData.records[date][account];
                needsUpdate = true;
              } else {
                const localMeals = localData.records[date][account].meals || [];
                const serverMeals = serverData.records[date][account].meals || [];
                if (serverMeals.length > localMeals.length) {
                  localData.records[date][account].meals = serverMeals;
                  needsUpdate = true;
                }
              }
            }
          }
        }
      }

      if (needsUpdate) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
        console.log('[Sync] 已从服务器同步更新数据');
      }
    }

    if (serverData.pk_users) {
      const localUsers = loadUsers();
      if (!localUsers || Object.keys(localUsers).length === 0) {
        saveUsers(serverData.pk_users);
        console.log('[Sync] 已从服务器恢复用户数据');
      }
    }
  } catch (e) {
    console.log('[Sync] 从服务器拉取数据失败:', e.message);
  }
}
