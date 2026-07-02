// ========== Mock Data Initialization ==========
// 生成过去7天的模拟数据，让首次打开有演示效果

async function initMockData() {
  const data = await loadData();
  // 如果已有记录，跳过
  if (Object.keys(data.records).length > 0) return;

  const now = new Date();
  const accounts = await loadAccounts();

  // 生成过去7天数据
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = dateStr(d);

    // 燃脂侠数据
    data.records[ds] = data.records[ds] || {};
    data.records[ds].husband = generateMockRecord('husband', d, i === 0, i);
    data.records[ds].wife = generateMockRecord('wife', d, i === 0, i);
  }

  // 预设账号信息
  const defAccounts = getDefaultAccounts();
  await saveAccounts(defAccounts);

  // 设置当前账号
  data.currentAccount = 'husband';
  await saveData(data);
}

function generateMockRecord(account, date, isToday, dayIndex) {
  const meals = [];
  const water = [];
  const exercises = [];

  if (!isToday || Math.random() > 0.3) {
    // 饮食
    const foodOptions = ['rice', 'noodles', 'salad', 'chicken', 'fruit', 'fish', 'egg', 'bread'];
    const mealCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < mealCount; i++) {
      const fk = foodOptions[Math.floor(Math.random() * foodOptions.length)];
      const f = FOOD_CAL_MAP[fk];
      meals.push({
        type: 'ai',
        name: f.name,
        calories: f.cal,
        unit: f.unit,
        time: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8 + i * 4, Math.floor(Math.random() * 60)).toISOString(),
        supervised: false
      });
    }
  }

  if (!isToday || Math.random() > 0.2) {
    // 运动
    const exOptions = ['run', 'walk', 'cycle', 'gym', 'yoga', 'jump'];
    const exKey = exOptions[Math.floor(Math.random() * exOptions.length)];
    const exInfo = EXERCISE_CAL_MAP[exKey];
    const duration = 20 + Math.floor(Math.random() * 40);
    exercises.push({
      type: exKey,
      name: exInfo.name,
      duration: duration,
      calories: Math.round(exInfo.calPerHour * (duration / 60)),
      time: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17, Math.floor(Math.random() * 60)).toISOString()
    });
  }

  if (!isToday || Math.random() > 0.5) {
    // 喝水
    const amounts = [200, 500, 800, 1000];
    const waterCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < waterCount; i++) {
      water.push({
        amount: amounts[Math.floor(Math.random() * amounts.length)],
        time: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9 + i * 3, Math.floor(Math.random() * 60)).toISOString()
      });
    }
  }

  // 体重（每隔1-2天记录一次）
  const weight = (i, account) => {
    const base = account === 'husband' ? 78.5 : 58.2;
    const trend = -0.1 * (7 - i);
    return Math.round((base + trend + (Math.random() - 0.5) * 0.6) * 10) / 10;
  };

  return {
    meals,
    water,
    exercises,
    weight: date.getDate() % 2 === 0 ? weight(dayIndex, account) : null
  };
}

// 自动初始化
initMockData();
