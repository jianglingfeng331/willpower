// ========== Data Layer: localStorage CRUD + 跨设备 JSON 同步 ==========

const STORAGE_KEY = 'diet_pk_data';
const ACCOUNTS_KEY = 'diet_pk_accounts';
const NICKNAMES_KEY = 'diet_pk_nicknames';
const AI_CONFIG_KEY = 'diet_pk_ai_config';

// 跨设备同步：指向工作区 output/diet-pk/pk-sync.json
const SYNC_DATA_FILE = './pk-sync.json';

// 预设食物卡路里映射表
const FOOD_CAL_MAP = {
  rice: { name: '米饭', cal: 200, unit: '碗' },
  noodles: { name: '面条', cal: 300, unit: '碗' },
  burger: { name: '汉堡', cal: 550, unit: '个' },
  salad: { name: '沙拉', cal: 150, unit: '份' },
  chicken: { name: '鸡胸肉', cal: 200, unit: '份(100g)' },
  fruit: { name: '水果', cal: 80, unit: '份' },
  fish: { name: '鱼肉', cal: 150, unit: '份' },
  egg: { name: '鸡蛋', cal: 70, unit: '个' },
  bread: { name: '面包', cal: 250, unit: '片' },
  cake: { name: '蛋糕', cal: 350, unit: '块' },
  'milk-tea': { name: '奶茶', cal: 400, unit: '杯' },
  'ice-cream': { name: '冰淇淋', cal: 250, unit: '份' },
  'fried-chicken': { name: '炸鸡', cal: 600, unit: '份' },
  pizza: { name: '披萨', cal: 500, unit: '块' },
  chips: { name: '薯条', cal: 350, unit: '份' }
};

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
      name: '老公',
      icon: '',
      dailyCalorieBudget: 2000,
      initialWeight: 80,
      targetWeight: 72
    },
    wife: {
      name: '老婆',
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
    pool: null,           // { startDate, endDate, husbandAmount, wifeAmount, status }
    currentAccount: 'husband'
  };
}

// ========== 存储操作 ==========
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return getDefaultData();
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
function addMeal(date, account, foodKey, customName, customCal, supervised) {
  const data = loadData();
  if (!data.records[date]) data.records[date] = {};
  if (!data.records[date][account]) data.records[date][account] = { meals: [], water: [], exercises: [], weight: null };

  let meal;
  if (foodKey && FOOD_CAL_MAP[foodKey]) {
    const f = FOOD_CAL_MAP[foodKey];
    meal = {
      type: 'ai',
      name: f.name,
      calories: f.cal,
      unit: f.unit,
      time: new Date().toISOString(),
      supervised: !!supervised
    };
  } else if (customName && customCal) {
    meal = {
      type: 'manual',
      name: customName,
      calories: parseInt(customCal) || 0,
      unit: '',
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

  const exInfo = EXERCISE_CAL_MAP[exKey];
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

// ========== 计算今日统计数据 ==========
function calcTodayStats(date, account) {
  const data = loadData();
  const rec = (data.records[date] && data.records[date][account]) || { meals: [], water: [], exercises: [], weight: null };

  const calIn = rec.meals.reduce((s, m) => s + m.calories, 0);
  const calOut = rec.exercises.reduce((s, e) => s + e.calories, 0);
  const waterTotal = rec.water.reduce((s, w) => s + w.amount, 0);

  const accounts = loadAccounts();
  const budget = accounts[account] ? accounts[account].dailyCalorieBudget : 2000;
  const netCal = calIn - calOut;
  const remain = Math.max(0, budget - netCal);

  // 计算积分
  let score = 0;
  if (waterTotal >= 1500) score += 10;
  if (rec.meals.length >= 2) score += 15;
  if (calOut >= 200) score += 15;
  if (rec.weight !== null) score += 5;
  if (netCal <= budget) score += 5;

  return {
    calIn, calOut, waterTotal, netCal, remain, budget,
    score,
    mealCount: rec.meals.length,
    exerciseCount: rec.exercises.length,
    hasWeight: rec.weight !== null,
    weight: rec.weight
  };
}

// ========== 积分明细 ==========
function getScoreDetail(date, account) {
  const data = loadData();
  const rec = (data.records[date] && data.records[date][account]) || { meals: [], water: [], exercises: [], weight: null };

  const waterTotal = rec.water.reduce((s, w) => s + w.amount, 0);
  const calOut = rec.exercises.reduce((s, e) => s + e.calories, 0);
  const calIn = rec.meals.reduce((s, m) => s + m.calories, 0);
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

// ========== 奖金池操作 ==========
function getPool() {
  const data = loadData();
  return data.pool;
}

function setPool(pool) {
  const data = loadData();
  data.pool = pool;
  saveData(data);
}

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
}

// 获取显示名称（优先用昵称，没有则用默认名）
function getDisplayName(account) {
  const nickname = getNickname(account);
  if (nickname) return nickname;
  const accounts = loadAccounts();
  return (accounts[account] && accounts[account].name) || account;
}

// ========== 重置全部数据 ==========
function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(NICKNAMES_KEY);
  localStorage.removeItem(AI_CONFIG_KEY);
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

// ========== AI识别调用 ==========
async function analyzeFoodImage(base64Image) {
  const config = loadAIConfig();
  if (!config.apiKey) {
    const result = simulateFoodRecognition();
    result.error = '未配置API Key，使用离线识别';
    return result;
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

  try {
    const res = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errMsg = res.status === 401 ? 'API Key无效(401)'
        : res.status === 404 ? 'API地址错误(404)'
        : res.status === 429 ? '请求频率超限(429)'
        : 'API错误(' + res.status + ')';
      console.warn('AI API error:', res.status, errMsg);
      const result = simulateFoodRecognition();
      result.error = errMsg + '，已回退离线识别';
      return result;
    }

    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      const result = simulateFoodRecognition();
      result.error = 'AI未返回有效内容，已回退离线识别';
      return result;
    }

    // Try to extract JSON from response
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
  } catch (e) {
    console.warn('AI API call failed:', e);
    const result = simulateFoodRecognition();
    result.error = '网络请求失败，已回退离线识别';
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
            if (Array.isArray(val) && val.length > 0) {
              // 数组字段（meals/exercises/water）：追加并去重（按 time 字段）
              const existingTimes = new Set((merged.records[date][account][key] || []).map(item => item.time));
              const newItems = val.filter(item => !existingTimes.has(item.time));
              merged.records[date][account][key] = (merged.records[date][account][key] || []).concat(newItems);
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

// 页面初始化时尝试合并共享数据，写入 localStorage
async function initData() {
  const localData = loadData();
  const syncData = await loadSyncData();
  if (syncData) {
    const merged = mergeSyncData(localData, syncData);
    saveData(merged);
    console.log('[同步] 已合并共享数据到本地存储');
    return merged;
  }
  return localData;
}

// 导出当前 localStorage 数据为 JSON 文件下载（「导出到云端」按钮）
function exportSyncData() {
  const data = loadData();
  if (!data || Object.keys(data.records).length === 0) {
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

function register(husbandName, husbandPwd, wifeName, wifePwd) {
  if (loadUsers()) return false;
  const hName = husbandName.trim();
  const wName = wifeName.trim();
  if (!hName || !wName || hName === wName) return false;
  const users = {};
  users[hName] = { password: husbandPwd, isAdmin: true, role: 'husband', displayName: hName };
  users[wName] = { password: wifePwd, isAdmin: false, role: 'wife', displayName: wName };
  saveUsers(users);
  // 同步更新 loadAccounts 中的显示名
  const accounts = loadAccounts();
  accounts.husband.name = hName;
  accounts.wife.name = wName;
  saveAccounts(accounts);
  return true;
}

function login(accountName, password) {
  const users = loadUsers();
  if (!users) return { success: false, error: '尚未注册，请先注册夫妻账号' };
  const user = users[accountName];
  if (!user) return { success: false, error: '账号不存在' };
  if (user.password !== password) return { success: false, error: '密码错误' };
  sessionStorage.setItem('pk_logged_in', accountName);
  sessionStorage.setItem('pk_logged_role', user.role);
  return { success: true, isAdmin: user.isAdmin, role: user.role, displayName: user.displayName };
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
  return { success: true };
}

function logout() {
  sessionStorage.removeItem('pk_logged_in');
  sessionStorage.removeItem('pk_logged_role');
}
