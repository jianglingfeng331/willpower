// ========== Data Layer: localStorage CRUD + 跨设备 JSON 同步 ==========

const STORAGE_KEY = 'diet_pk_data';
const ACCOUNTS_KEY = 'diet_pk_accounts';
const NICKNAMES_KEY = 'diet_pk_nicknames';
const AI_CONFIG_KEY = 'diet_pk_ai_config';
const SETUP_KEY = 'diet_pk_setup_completed';
const CUSTOM_FOODS_KEY = 'diet_pk_custom_foods';
const CUSTOM_EXERCISES_KEY = 'diet_pk_custom_exercises';

// 跨设备同步：指向工作区 output/diet-pk/pk-sync.json
const SYNC_DATA_FILE = './pk-sync.json';

// ========== API 层（后端 server.js 端口 3001）==========
const API_BASE = '';
let _apiOnline = null; // null=未检测, true/false

async function apiGet(path) {
  try {
    const resp = await fetch(API_BASE + path, { cache: 'no-cache' });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (_e) { return null; }
}

async function apiPost(path, body) {
  try {
    const resp = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (_e) { return null; }
}

async function checkApiOnline() {
  if (_apiOnline !== null) return _apiOnline;
  const r = await apiGet('/api/health');
  _apiOnline = !!(r && r.status === 'ok');
  console.log('[API] 服务器状态:', _apiOnline ? '在线' : '离线，降级到本地存储');
  return _apiOnline;
}

// 将 pk_users 推送到后端
async function pushUsersToServer(users) {
  if (!(await checkApiOnline())) return;
  await apiPost('/api/sync', { pk_users: users });
}

// 将完整数据推送到后端
async function pushDataToServer() {
  if (!(await checkApiOnline())) return;
  const data = loadData();
  const accounts = loadAccounts();
  const users = loadUsers();
  await apiPost('/api/sync', {
    pk_users: users,
    accounts: accounts,
    records: data.records || {}
  });
}

// 从后端拉取数据合并到本地
async function pullDataFromServer() {
  if (!(await checkApiOnline())) return null;
  return await apiGet('/api/sync');
}

// 防抖自动同步（延迟 3 秒，汇聚连续写入）
let _syncTimer = null;
function autoSyncToServer() {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => pushDataToServer(), 3000);
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


function getCustomFoods() {
  try {
    const raw = localStorage.getItem(CUSTOM_FOODS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveCustomFoods(foods) {
  localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
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
  delete foods[key];
  saveCustomFoods(foods);
}

// ========== 自定义食物库 ==========
function getCustomFoods() {
  try {
    const raw = localStorage.getItem(CUSTOM_FOODS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveCustomFoods(foods) {
  localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
}

function addCustomFood(name, cal, unit) {
  const foods = getCustomFoods();
  const key = 'custom_' + Date.now();
  foods[key] = { name, cal: parseInt(cal) || 0, unit: unit || '份' };
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

// 合并预设 + 自定义，返回统一食物列表
function getAllFoods() {
  const preset = {};
  for (const [key, val] of Object.entries(FOOD_CAL_MAP)) {
    preset[key] = { ...val, source: 'preset' };
  }
  const custom = getCustomFoods();
  for (const [key, val] of Object.entries(custom)) {
    custom[key] = { ...val, source: 'custom' };
  }
  return { ...preset, ...custom };
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
  localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(exercises));
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
    custom[key] = { ...val, source: 'custom' };
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  autoSyncToServer();
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return getDefaultAccounts();
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
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
function getAllRecordDates(account) {
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

// ========== 添加饮食 ==========
function addMeal(date, account, foodKey, manualName, manualCal, quantity, supervised) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) data.records[date][account] = { meals: [], water: [], exercises: [], weight: null };

  const qty = parseInt(quantity) || 1;

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
      supervised: !!supervised
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
      supervised: !!supervised
    };
  } else return null;

  data.records[date][account].meals.push(meal);
  saveData(data);
  return meal;
}

// ========== 添加喝水 ==========
function addWater(date, account, ml) {
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
function addExercise(date, account, exKey, durationMin) {
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
function deleteMeal(date, account, index) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].meals.splice(index, 1);
  saveData(data);
  return true;
}

function deleteWater(date, account, index) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].water.splice(index, 1);
  saveData(data);
  return true;
}

function deleteExercise(date, account, index) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].exercises.splice(index, 1);
  saveData(data);
  return true;
}

function deleteWeight(date, account) {
  const data = loadData();
  if (!data.records[date] || !data.records[date][account]) return false;
  data.records[date][account].weight = null;
  saveData(data);
  return true;
}

// ========== 记录体重 ==========
function setWeight(date, account, weight) {
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

function hasWeightRecordToday(account) {
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
  return loadData().pkRounds || [];
}

function savePkRound(round) {
  const data = loadData();
  if (!data.pkRounds) data.pkRounds = [];
  data.pkRounds.push(round);
  saveData(data);
}

function updatePkRound(roundId, updates) {
  const data = loadData();
  if (!data.pkRounds) return;
  const idx = data.pkRounds.findIndex(r => r.id === roundId);
  if (idx === -1) return;
  data.pkRounds[idx] = { ...data.pkRounds[idx], ...updates };
  saveData(data);
}

function cancelPkRound(roundId) {
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

function getWeightForDate(date, account) {
  const data = loadData();
  const rec = data.records[date] && data.records[date][account];
  return (rec && rec.weight !== null && rec.weight !== undefined) ? rec.weight : null;
}

function checkAutoSettle() {
  const rounds = getPkRounds();
  const todayDate = today();
  const unsettled = [];
  rounds.forEach(r => {
    if (r.status === 'active' && r.endDate < todayDate) {
      settlePkRound(r);
      const updated = getPkRounds().find(x => x.id === r.id);
      if (updated && updated.status === 'completed' && !updated.settlementViewed) {
        unsettled.push(updated);
      }
    }
  });
  return unsettled;
}

function settlePkRound(round) {
  const data = loadData();
  const endDate = round.endDate;

  // 积分PK
  if (round.items.includes('score')) {
    const { hTotal, wTotal } = getPoolScores(round.startDate, endDate);
    round.result.score = {
      winner: hTotal > wTotal ? 'husband' : (wTotal > hTotal ? 'wife' : null),
      hTotal, wTotal
    };
  }

  // 体重PK
  if (round.items.includes('weight')) {
    // 取期末体重：最后一天有记录的值，无则倒序找最近一次
    function findEndWeight(account) {
      let wt = getWeightForDate(endDate, account);
      if (wt !== null) return wt;
      // 倒序往前找
      const allDates = Object.keys(data.records).sort((a, b) => b.localeCompare(a));
      for (const d of allDates) {
        if (d > endDate) continue;
        if (d < round.startDate) break;
        wt = getWeightForDate(d, account);
        if (wt !== null) return wt;
      }
      return null;
    }

    const hEndWt = findEndWeight('husband');
    const wEndWt = findEndWeight('wife');
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
  updatePkRound(round.id, round);
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
function getCurrentAccount() {
  const data = loadData();
  return data.currentAccount || 'husband';
}

function switchCurrentAccount(account) {
  const data = loadData();
  data.currentAccount = account;
  saveData(data);
}

function getAccountInfo(account) {
  const accounts = loadAccounts();
  return accounts[account] || null;
}

function updateAccountInfo(account, updates) {
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
  localStorage.setItem(NICKNAMES_KEY, JSON.stringify(nicknames));
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
    autoSyncToServer();
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
}

// ========== 清空数据（保留账号） ==========
function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);   // 运动记录、奖金池
  localStorage.removeItem(ACCOUNTS_KEY);  // 热量预算、体重设置
  localStorage.removeItem(NICKNAMES_KEY); // 昵称
  localStorage.removeItem(AI_CONFIG_KEY); // AI 设置
  localStorage.removeItem(SETUP_KEY);     // 引导设置标记
  // 保留 USERS_KEY (pk_users) — 注册账号信息
}

// ========== AI识别配置 ==========
function getDefaultAIConfig() {
  return {
    apiKey: '',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o'
  };
}

function loadAIConfig() {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return getDefaultAIConfig();
}

function saveAIConfig(config) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

// ========== AI识别调用（带重试与节流） ==========
let _lastAICallTime = 0;
const AI_MIN_INTERVAL = 1500; // 最小间隔1.5秒

async function analyzeFoodImage(base64Image) {
  const config = loadAIConfig();
  if (!config.apiKey) {
    const result = simulateFoodRecognition();
    result.error = '未配置API Key，使用离线识别';
    return result;
  }

  // 客户端节流：确保两次请求间隔至少1.5秒
  const now = Date.now();
  const gap = now - _lastAICallTime;
  if (gap < AI_MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, AI_MIN_INTERVAL - gap));
  }

  const prompt = '请识别这张图片中的食物，以JSON格式返回：{"foods":[{"name":"食物名称","calories":热量估算值(kcal),"confidence":置信度0-1}]}，只返回JSON不要其他内容';

  const body = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: base64Image } }
        ]
      }
    ],
    max_tokens: 500,
    temperature: 0.1
  };

  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    _lastAICallTime = Date.now();
    try {
      const res = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + config.apiKey
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) {
          const result = simulateFoodRecognition();
          result.error = 'AI未返回有效内容，已回退离线识别';
          return result;
        }
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          const result = simulateFoodRecognition();
          result.error = 'AI返回格式异常，已回退离线识别';
          return result;
        }
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.foods && Array.isArray(parsed.foods) && parsed.foods.length > 0) {
          return { foods: parsed.foods, source: 'ai' };
        }
        const result = simulateFoodRecognition();
        result.error = 'AI未识别到食物，已回退离线识别';
        return result;
      }

      // 429 指数退避重试
      if (res.status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn('AI API 429, retrying in ' + (delay / 1000) + 's (attempt ' + (attempt + 1) + '/' + maxRetries + ')');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // 401/404 等不可重试错误
      const errMsg = res.status === 401 ? 'API Key无效(401)'
        : res.status === 404 ? 'API地址错误(404)'
        : res.status === 429 ? '请求频率超限(429)，重试' + maxRetries + '次后仍失败'
        : 'API错误(' + res.status + ')';
      console.warn('AI API error:', res.status, errMsg);
      const result = simulateFoodRecognition();
      result.error = errMsg + '，已回退离线识别';
      return result;

    } catch (e) {
      // 网络错误重试
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn('AI API network error, retrying in ' + (delay / 1000) + 's');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.warn('AI API call failed:', e);
      const result = simulateFoodRecognition();
      result.error = '网络请求失败（重试' + maxRetries + '次），已回退离线识别';
      return result;
    }
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

// ========== 跨设备 JSON 文件同步 ==========

// 从 pk-sync.json 加载共享数据（桌面端启动时调用）
async function loadSyncData() {
  try {
    const resp = await fetch(SYNC_DATA_FILE, { cache: 'no-cache' });
    if (!resp.ok) return null;
    const data = await resp.json();
    console.log('[同步] 已加载 pk-sync.json，包含', Object.keys(data.records || {}).length, '天记录');
    return data;
  } catch (e) {
    console.log('[同步] 未找到 pk-sync.json，将仅使用本地数据');
    return null;
  }
}

// 智能合并：以日期为 key，共享数据优先覆盖本地数据
function mergeSyncData(localData, syncData) {
  if (!syncData || !syncData.records) return localData;
  const merged = JSON.parse(JSON.stringify(localData));

  for (const [date, dayData] of Object.entries(syncData.records)) {
    if (!merged.records[date]) {
      merged.records[date] = JSON.parse(JSON.stringify(dayData));
    } else {
      for (const [account, accountData] of Object.entries(dayData)) {
        if (!accountData) continue;
        if (!merged.records[date][account]) {
          merged.records[date][account] = JSON.parse(JSON.stringify(accountData));
        } else {
          for (const [key, val] of Object.entries(accountData)) {
            if (Array.isArray(val)) {
              // 数组字段以服务器数据为权威来源，直接替换以支持删除操作
              merged.records[date][account][key] = val;
            } else if (val !== null && val !== undefined) {
              merged.records[date][account][key] = val;
            }
          }
        }
      }
    }
  }

  if (syncData.accounts) {
    merged.accounts = { ...merged.accounts, ...syncData.accounts };
  }
  console.log('[同步] 合并完成：本地 + 共享共', Object.keys(merged.records).length, '天记录');
  return merged;
}

// 页面初始化：优先从 API 拉取数据，不可用时降级到 pk-sync.json
async function initData() {
  console.log('[initData] 开始初始化...');
  const localData = loadData();

  // 1. 尝试从后端拉取
  const serverData = await pullDataFromServer();
  console.log('[initData] 服务器数据:', serverData ? 'QWK: ' + JSON.stringify(serverData).slice(0, 120) : 'null（离线）');
  if (serverData) {
    // 合并 records
    const merged = mergeSyncData(localData, serverData.records ? { records: serverData.records, accounts: serverData.accounts } : null);
    saveData(merged);
    // 合并 pk_users
    if (serverData.pk_users && typeof serverData.pk_users === 'object') {
      const existingUsers = loadUsers();
      if (!existingUsers) {
        saveUsers(serverData.pk_users);
        console.log('[API] 已从服务器加载账号数据，共', Object.keys(serverData.pk_users).length, '个账号');
      } else {
        let changed = false;
        for (const [name, info] of Object.entries(serverData.pk_users)) {
          if (!existingUsers[name]) { existingUsers[name] = info; changed = true; }
        }
        if (changed) saveUsers(existingUsers);
      }
    }
    // 合并 accounts
    if (serverData.accounts) {
      const acc = loadAccounts();
      saveAccounts({ ...acc, ...serverData.accounts });
    }
    // 如果服务器未提供 pk_users，降级到 pk-sync.json 的 _users
    if (!loadUsers()) {
      const syncData = await loadSyncData();
      if (syncData && syncData._users) {
        saveUsers(syncData._users);
        console.log('[同步] 服务器无账号数据，已从 pk-sync.json 加载');
      }
    }
    console.log('[initData] API 服务器数据合并完成，最终 loadUsers():', JSON.stringify(loadUsers()));
    return merged;
  }

  // 2. API 不可用，降级到 pk-sync.json
  const syncData = await loadSyncData();
  if (syncData) {
    const merged = mergeSyncData(localData, syncData);
    saveData(merged);
    console.log('[同步] 已合并共享数据到本地存储');
    if (syncData._users) {
      const existingUsers = loadUsers();
      if (!existingUsers) {
        saveUsers(syncData._users);
        console.log('[同步] 已合并账号数据（_users），共', Object.keys(syncData._users).length, '个账号');
      } else {
        let changed = false;
        for (const [name, info] of Object.entries(syncData._users)) {
          if (!existingUsers[name]) { existingUsers[name] = info; changed = true; }
        }
        if (changed) saveUsers(existingUsers);
      }
    }
    return merged;
  }
  return localData;
}

// 导出当前 localStorage 数据为 JSON 文件下载（「导出到云端」按钮）
function exportSyncData() {
  const data = loadData();
  const hasRecords = data.records && Object.keys(data.records).length > 0;
  const hasUsers = data._users && Object.keys(data._users).length > 0;
  if (!hasRecords && !hasUsers) {
    alert('暂无数据可导出');
    return;
  }
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pk-sync.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('[同步] 已导出 pk-sync.json，包含', Object.keys(data.records).length, '天记录');
}

// 保存共享数据：触发浏览器下载 pk-sync.json（iPhone 端同步后供用户放入工作区）
function saveSyncData(data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pk-sync.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== 运动同步数据存储 ==========
function addExerciseSync(date, account, syncData) {
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
const USERS_KEY = 'pk_users';

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function register(husbandName, husbandPwd, wifeName, wifePwd) {
  // 1. 检查本地是否已注册
  if (loadUsers()) return { success: false, error: '本地已有注册数据' };

  // 2. 检查服务器是否已有账号（防止重复注册）
  const serverData = await pullDataFromServer();
  if (serverData && serverData.pk_users && Object.keys(serverData.pk_users).length > 0) {
    return { success: false, error: '服务器已有账号，请直接登录' };
  }

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

  // 推送账号到服务器 + 写入本地同步数据
  syncUsersToData(users);
  await pushUsersToServer(users);
  console.log('[注册] 账号已同步到服务器');
  return { success: true };
}

function login(accountName, password) {
  const users = loadUsers();
  if (!users) return { success: false, error: '尚未注册，请先注册燃脂搭档账号' };
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

function autoLogin() {
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

function changePassword(adminAccount, adminPwd, targetAccount, newPwd) {
  const users = loadUsers();
  if (!users) return { success: false, error: '尚未注册' };
  const admin = users[adminAccount];
  if (!admin || !admin.isAdmin) return { success: false, error: '仅管理员可修改密码' };
  if (admin.password !== adminPwd) return { success: false, error: '管理员密码错误' };
  if (!users[targetAccount]) return { success: false, error: '目标账号不存在' };
  users[targetAccount].password = newPwd;
  saveUsers(users);
  syncUsersToData(users);
  return { success: true };
}

function selfChangePassword(account, oldPwd, newPwd) {
  const users = loadUsers();
  if (!users) return { success: false, error: '尚未注册' };
  const user = users[account];
  if (!user) return { success: false, error: '账号不存在' };
  if (user.password !== oldPwd) return { success: false, error: '当前密码错误' };
  user.password = newPwd;
  saveUsers(users);
  syncUsersToData(users);
  return { success: true };
}

// 将 pk_users 数据同步到 diet_pk_data._users + 推送到服务器
function syncUsersToData(users) {
  const data = loadData();
  data._users = users;
  saveData(data);
  // 异步推送到服务器（不阻塞 UI）
  pushUsersToServer(users);
}

function logout() {
  sessionStorage.removeItem('pk_logged_in');
  sessionStorage.removeItem('pk_logged_role');
  localStorage.removeItem('pk_saved_user');
}
