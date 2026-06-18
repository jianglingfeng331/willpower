// ========== App Main Logic ==========

let currentUser = null;   // 当前登录账号名（自定义）
let currentRole = null;    // 'husband' 或 'wife'
let isAdmin = false;
let selectedFood = null;
let selectedExercise = null;
let superviseTarget = null;
let aiRecognitionResults = [];
let svAiResults = [];
let recordDate = today();

// ========== 日期导航辅助函数 ==========
function getRecordDate() { return recordDate; }

function goToPrevDay() {
  const d = new Date(recordDate);
  d.setDate(d.getDate() - 1);
  recordDate = d.toISOString().split('T')[0];
  updateRecordPage();
}

function goToNextDay() {
  const d = new Date(recordDate);
  d.setDate(d.getDate() + 1);
  const t = today();
  if (d.toISOString().split('T')[0] > t) return;
  recordDate = d.toISOString().split('T')[0];
  updateRecordPage();
}

function goToToday() {
  recordDate = today();
  updateRecordPage();
}

function formatDateDisplay(d) {
  const dt = new Date(d);
  const m = dt.getMonth() + 1;
  const day = dt.getDate();
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  return m + '月' + day + '日 ' + weekdays[dt.getDay()];
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  await initData();
  if (!checkAuth()) return;
  initMockData();
  updateAllUI();
  renderAllCharts();
  initHASync();
  initRandomAnimal();
  checkFirstTimeSetup();
});

// ========== 登录认证 ==========
function checkAuth() {
  const user = getCurrentUser();
  if (user) {
    currentUser = user.account;
    currentRole = user.role;
    isAdmin = user.isAdmin;
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-content').style.display = '';
    updateHeader();
    return true;
  }
  document.getElementById('auth-overlay').style.display = '';
  showLogin();
  return false;
}

// ========== 随机背景图 ==========
function randomAuthBackground() {
  const bgIndex = Math.floor(Math.random() * 3) + 1;
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.style.backgroundImage = "url('img/auth-bg-" + bgIndex + ".png')";
  }
}

function showLogin() {
  document.getElementById('auth-login-form').style.display = '';
  document.getElementById('auth-register-form').style.display = 'none';
  document.getElementById('login-error').textContent = '';
  document.getElementById('reg-error').textContent = '';
  randomAuthBackground();
}

function showRegister() {
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-register-form').style.display = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('reg-error').textContent = '';
  randomAuthBackground();
}

function doLogin() {
  const account = document.getElementById('login-account').value.trim();
  const password = document.getElementById('login-password').value;
  if (!account) {
    document.getElementById('login-error').textContent = '请输入账号名';
    return;
  }
  if (!password) {
    document.getElementById('login-error').textContent = '请输入密码';
    return;
  }
  const result = login(account, password);
  if (result.success) {
    currentUser = account;
    currentRole = result.role;
    isAdmin = result.isAdmin;
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-content').style.display = '';
    initMockData();
    updateAllUI();
    renderAllCharts();
    initHASync();
    initRandomAnimal();
    showToast('欢迎，' + getDisplayName(currentRole));
    checkFirstTimeSetup();
  } else {
    document.getElementById('login-error').textContent = result.error;
  }
}

// ========== 首次引导设置 ==========
function checkFirstTimeSetup() {
  if (isSetupCompleted(currentRole)) return;

  // 不预填默认值，由用户自行填写
  const elInitW = document.getElementById('setup-init-weight');
  const elTargetW = document.getElementById('setup-target-weight');
  const elCalB = document.getElementById('setup-cal-budget');
  if (elInitW) elInitW.value = '';
  if (elTargetW) elTargetW.value = '';
  if (elCalB) elCalB.value = '';
  document.getElementById('setup-error').textContent = '';

  openModal('modal-first-setup');
}

function confirmFirstTimeSetup() {
  const initW = parseFloat(document.getElementById('setup-init-weight').value);
  const targetW = parseFloat(document.getElementById('setup-target-weight').value);
  const calB = parseInt(document.getElementById('setup-cal-budget').value);

  const errEl = document.getElementById('setup-error');
  if (!initW || initW <= 0) { errEl.textContent = '请输入有效的初始体重'; return; }
  if (!targetW || targetW <= 0) { errEl.textContent = '请输入有效的目标体重'; return; }
  if (!calB || calB <= 0) { errEl.textContent = '请输入有效的每日热量预算'; return; }
  if (targetW >= initW) { errEl.textContent = '目标体重应小于初始体重'; return; }

  updateAccountInfo(currentRole, {
    initialWeight: initW,
    targetWeight: targetW,
    dailyCalorieBudget: calB
  });

  markSetupCompleted(currentRole);
  closeModal('modal-first-setup');
  updateAllUI();
  initRandomAnimal();
  showToast('目标已设定，开始你的减重之旅吧！');
}

function doRegister() {
  const hName = document.getElementById('reg-husband-name').value.trim();
  const hPwd = document.getElementById('reg-husband-pwd').value.trim();
  const wName = document.getElementById('reg-wife-name').value.trim();
  const wPwd = document.getElementById('reg-wife-pwd').value.trim();
  if (!hName || !hPwd || !wName || !wPwd) {
    document.getElementById('reg-error').textContent = '请完整填写双方账号名和密码';
    return;
  }
  if (hName === wName) {
    document.getElementById('reg-error').textContent = '双方账号名不能相同';
    return;
  }
  if (!register(hName, hPwd, wName, wPwd)) {
    document.getElementById('reg-error').textContent = '已注册过，请直接登录';
    return;
  }
  showToast('注册成功，请登录');
  showLogin();
}

function doChangePassword() {
  const target = document.getElementById('admin-target-account').value;
  const verifyPwd = document.getElementById('admin-verify-pwd').value;
  const newPwd = document.getElementById('admin-new-pwd').value;
  const errEl = document.getElementById('admin-pwd-error');
  if (!verifyPwd) { errEl.textContent = '请输入管理员密码'; return; }
  if (!newPwd) { errEl.textContent = '请输入新密码'; return; }
  const result = changePassword(currentUser, verifyPwd, target, newPwd);
  if (result.success) {
    document.getElementById('admin-verify-pwd').value = '';
    document.getElementById('admin-new-pwd').value = '';
    errEl.textContent = '';
    errEl.style.color = 'var(--green)';
    errEl.textContent = '密码修改成功';
    setTimeout(() => { errEl.textContent = ''; errEl.style.color = ''; }, 2000);
  } else {
    errEl.textContent = result.error;
  }
}

function doLogout() {
  if (!confirm('确定退出登录吗？')) return;
  logout();
  currentUser = null;
  currentRole = null;
  isAdmin = false;
  document.getElementById('auth-overlay').style.display = '';
  document.getElementById('main-content').style.display = 'none';
  showLogin();
}

// ========== Toast ==========
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('show'), 1800);
}

// ========== Tab 切换 ==========
function switchTab(tab) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

  const page = document.getElementById('tab-' + tab);
  if (page) page.classList.add('active');
  const tabBtn = document.querySelector('.tab-item[data-tab="' + tab + '"]');
  if (tabBtn) tabBtn.classList.add('active');

  if (tab === 'home') updateHomePage();
  if (tab === 'record') updateRecordPage();
  if (tab === 'stats') { destroyCharts(); renderAllCharts(); }
  if (tab === 'me') updateMePage();
}

// ========== 全量UI更新 ==========
function updateAllUI() {
  updateHeader();
  updateHomePage();
  updateRecordPage();
  updateMePage();
}

function updateHeader() {
  if (!currentUser) return;
  const name = getDisplayName(currentRole);
  const badge = document.getElementById('current-account-badge');
  if (badge) {
    badge.innerHTML = '<svg width="20" height="20" style="vertical-align:middle"><use href="#ic-person"/></svg> ' + name;
  }
}

// ========== 首页更新 ==========
function updateHomePage() {
  const dt = today();

  // 更新PK条
  updatePKBar();

  // 更新人名
  updateElement('person-name-h', getDisplayName('husband'));
  updateElement('person-name-w', getDisplayName('wife'));

  // 更新燃脂侠卡片
  const hStats = calcTodayStats(dt, 'husband');
  updateElement('h-score', hStats.score);
  updateElement('h-cal-in', hStats.calIn);
  updateElement('h-cal-out', hStats.calOut);
  updateElement('h-water', hStats.waterTotal);
  updateElement('h-cal-remain', '剩余 ' + hStats.remain + ' kcal');
  updateCalBar('h-cal-bar', hStats.netCal, hStats.budget);

  // 更新甩肉酱卡片
  const wStats = calcTodayStats(dt, 'wife');
  updateElement('w-score', wStats.score);
  updateElement('w-cal-in', wStats.calIn);
  updateElement('w-cal-out', wStats.calOut);
  updateElement('w-water', wStats.waterTotal);
  updateElement('w-cal-remain', '剩余 ' + wStats.remain + ' kcal');
  updateCalBar('w-cal-bar', wStats.netCal, wStats.budget);
}

function updatePKBar() {
  const pool = getPool();
  const pkBar = document.getElementById('pk-bar');
  const pkPeriod = document.getElementById('pk-period');
  const pkFillH = document.getElementById('pk-fill-husband');
  const pkHScore = document.getElementById('pk-h-score');
  const pkWScore = document.getElementById('pk-w-score');

  if (!pool || pool.status !== 'active') {
    pkFillH.style.width = '50%';
    pkHScore.textContent = '-';
    pkWScore.textContent = '-';
    pkPeriod.textContent = '未开启奖金池';
    return;
  }

  const { hTotal, wTotal } = getPoolScores(pool.startDate, pool.endDate);
  const total = hTotal + wTotal || 1;
  const hPct = Math.round((hTotal / total) * 100);

  pkFillH.style.width = hPct + '%';
  pkHScore.textContent = hTotal;
  pkWScore.textContent = wTotal;

  const start = new Date(pool.startDate);
  const end = new Date(pool.endDate);
  pkPeriod.textContent = formatDateShort(start) + ' - ' + formatDateShort(end);
}

function formatDateShort(d) {
  return (d.getMonth()+1) + '/' + d.getDate();
}

function updateElement(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateCalBar(id, netCal, budget) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = Math.min(100, Math.max(0, Math.round((netCal / budget) * 100)));
  el.style.width = pct + '%';
  el.classList.remove('caution', 'danger');
  if (pct > 90) {
    el.classList.add('danger');
  } else if (pct > 70) {
    el.classList.add('caution');
  }
}

// ========== 积分规则 ==========
function openScoreRules() {
  openModal('modal-score-rules');
}

// ========== 积分明细 ==========
function openScoreDetail() {
  renderScoreDetail();
  document.getElementById('score-panel').classList.add('show');
}

function closeScoreDetail() {
  document.getElementById('score-panel').classList.remove('show');
}

function renderScoreDetail() {
  const listEl = document.getElementById('score-panel-list');
  const items = [];
  const weekDays = ['日','一','二','三','四','五','六'];

  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateStr(d);
    const hDetail = getScoreDetail(ds, 'husband');
    const wDetail = getScoreDetail(ds, 'wife');
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const wd = weekDays[d.getDay()];

    function renderPerson(detail, accountClass) {
      const tagRows = [
        { label: '饮水', ok: detail.waterOk, pts: 10 },
        { label: '饮食', ok: detail.mealOk, pts: 15 },
        { label: '运动', ok: detail.exerciseOk, pts: 15 },
        { label: '称重', ok: detail.weightOk, pts: 5 },
        { label: '卡路里', ok: detail.calOk, pts: 5 }
      ];
      const tagsHTML = tagRows.map(tr =>
        '<div class="sd-tag-row">' +
          '<span class="sd-tag ' + (tr.ok ? 'pass' : 'fail') + '">' +
            '<svg width="10" height="10" style="margin-right:2px"><use href="#' + (tr.ok ? 'ic-check' : 'ic-close') + '"/></svg>' +
            tr.label +
          '</span>' +
          '<span class="sd-tag-pts">' + (tr.ok ? '+' + tr.pts : '0') + '</span>' +
        '</div>'
      ).join('');
      return '<div class="sd-col ' + accountClass + '">' +
        '<span class="sd-col-name"><svg width="14" height="14" style="margin-right:3px"><use href="#' + (accountClass === 'sd-husband' ? 'ic-husband' : 'ic-wife') + '"/></svg>' +
          (accountClass === 'sd-husband' ? getDisplayName('husband') : getDisplayName('wife')) + '</span>' +
        '<span class="sd-col-score' + (detail.score === 50 ? ' max' : '') + '">' + detail.score + '</span>' +
        '<div class="sd-col-tags">' + tagsHTML + '</div>' +
      '</div>';
    }

    items.push(
      '<div class="sd-card">' +
        '<div class="sd-card-left">' +
          '<span class="sd-card-date">' + month + '月' + day + '日 ' + wd + '</span>' +
        '</div>' +
        '<div class="sd-card-right">' +
          renderPerson(hDetail, 'sd-husband') +
          '<div class="sd-divider"></div>' +
          renderPerson(wDetail, 'sd-wife') +
        '</div>' +
      '</div>'
    );
  }

  listEl.innerHTML = items.length > 0 ? items.join('') : '<div class="sd-empty">暂无记录</div>';
}

// ========== 记录页更新 ==========
function updateRecordPage() {
  const dt = getRecordDate();
  const isToday = dt === today();
  const rec = getDayRecord(dt, currentRole);
  const stats = calcTodayStats(dt, currentRole);

  // 更新日期导航栏
  const navDisplay = document.getElementById('date-nav-display');
  if (navDisplay) {
    navDisplay.textContent = isToday ? '今日记录' : formatDateDisplay(dt);
  }

  // 回到今天按钮
  const navExtra = document.getElementById('date-nav-extra');
  if (navExtra) {
    navExtra.innerHTML = isToday ? '' : '<span class="date-nav-today" onclick="goToToday()">回到今天</span>';
  }

  // 今日日期汇总
  const summaryEl = document.getElementById('date-summary');
  if (summaryEl) {
    summaryEl.innerHTML = '<span>摄入 ' + stats.calIn + ' kcal</span>' +
      '<span>消耗 ' + stats.calOut + ' kcal</span>' +
      '<span>饮水 ' + stats.waterTotal + ' ml</span>' +
      '<span>得分 ' + stats.score + '</span>';
  }

  // 历史记录隐藏录入按钮和输入区域
  const recordSection = document.getElementById('tab-record');
  if (recordSection) {
    const btns = recordSection.querySelectorAll('.record-btn, .sync-btn, .water-btn, .weight-input-row');
    btns.forEach(b => { b.style.display = isToday ? '' : 'none'; });
  }

  // 饮食列表
  const mealList = document.getElementById('meal-list');
  const delMeal = (i) => isToday ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteMeal(${i})"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
  mealList.innerHTML = rec.meals.length === 0
    ? '<div style="color:#999;font-size:13px;padding:8px 0;">暂无记录</div>'
    : rec.meals.map((m, i) => `
      <div class="record-item${m.supervised ? ' supervised' : ''}">
        <div class="record-item-left">
          ${m.name} ${m.supervised ? '<span class="supervised-tag">监督</span>' : ''}
        </div>
        <div class="record-item-right">${m.calories} kcal${delMeal(i)}
        </div>
      </div>
    `).join('');

  // 运动列表
  const exList = document.getElementById('exercise-list');
  const delEx = (i) => isToday ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteExercise(${i})"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
  exList.innerHTML = rec.exercises.length === 0
    ? '<div style="color:#999;font-size:13px;padding:8px 0;">暂无记录</div>'
    : rec.exercises.map((e, i) => `
      <div class="record-item">
        <div class="record-item-left">${e.name} ${e.duration}分钟</div>
        <div class="record-item-right">-${e.calories} kcal${delEx(i)}
        </div>
      </div>
    `).join('');

  // 喝水列表
  const waterList = document.getElementById('water-list');
  const waterTotal = rec.water.reduce((s, w) => s + w.amount, 0);
  const waterLen = rec.water.length;
  const waterDayLabel = isToday ? '今日' : '当日';
  const delWater = (ri) => isToday ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteWater(${waterLen - 1 - ri})"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
  waterList.innerHTML = rec.water.length === 0
    ? '<div style="color:#999;font-size:13px;padding:8px 0;">暂无记录</div>'
    : `<div style="font-weight:600;color:var(--blue-deep);margin-bottom:4px;">${waterDayLabel}已饮 ${waterTotal}ml ${waterTotal >= 1500 ? '达标' : '(目标1500ml)'}</div>` +
      rec.water.slice().reverse().map((w, ri) => `
        <div class="record-item">
          <div class="record-item-left">饮水</div>
          <div class="record-item-right">${w.amount}ml${delWater(ri)}
          </div>
        </div>
      `).join('');

  // 体重列表
  const weightList = document.getElementById('weight-list');
  const info = getAccountInfo(currentRole);
  const targetWeight = info ? info.targetWeight : '-';
  const weightDayLabel = isToday ? '今日' : '当日';
  const delWeight = isToday ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteWeight()"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
  weightList.innerHTML = rec.weight !== null
    ? `<div class="record-item"><div class="record-item-left">体重</div><div class="record-item-right">${rec.weight} kg (目标: ${targetWeight}kg)${delWeight}</div></div>`
    : `<div style="color:#999;font-size:13px;padding:8px 0;">${weightDayLabel}未记录</div>`;
}

// ========== 删除确认 ==========
function confirmDeleteMeal(idx) {
  if (!confirm('确定删除这条饮食记录吗？')) return;
  deleteMeal(today(), currentRole, idx);
  updateAllUI();
  showToast('已删除');
}

function confirmDeleteExercise(idx) {
  if (!confirm('确定删除这条运动记录吗？')) return;
  deleteExercise(today(), currentRole, idx);
  updateAllUI();
  showToast('已删除');
}

function confirmDeleteWater(idx) {
  if (!confirm('确定删除这条饮水记录吗？')) return;
  deleteWater(getRecordDate(), currentRole, idx);
  updateAllUI();
  showToast('已删除');
}

function confirmDeleteWeight() {
  if (!confirm('确定删除今日体重记录吗？')) return;
  deleteWeight(today(), currentRole);
  updateAllUI();
  showToast('已删除');
}

// ========== 饮食记录弹窗 ==========
function openMealModal() {
  selectedFood = null;
  document.getElementById('manual-food-name').value = '';
  document.getElementById('manual-food-cal').value = '';
  document.getElementById('meal-supervised').checked = false;
  document.getElementById('meal-confirm-btn').textContent = '请选择食物或手动输入';

  document.querySelectorAll('#food-grid .food-item').forEach(el => el.classList.remove('selected'));
  aiRecognitionResults = [];
  clearAIPreview();
  openModal('modal-meal');
}

function selectFood(foodKey) {
  selectedFood = foodKey;
  document.querySelectorAll('#food-grid .food-item').forEach(el => el.classList.remove('selected'));
  const items = document.querySelectorAll('#food-grid .food-item');
  items.forEach(el => {
    if (el.textContent.includes(FOOD_CAL_MAP[foodKey].name)) el.classList.add('selected');
  });
  document.getElementById('meal-confirm-btn').textContent = '确认记录：' + FOOD_CAL_MAP[foodKey].name + ' ' + FOOD_CAL_MAP[foodKey].cal + 'kcal';
  document.getElementById('manual-food-name').value = '';
  document.getElementById('manual-food-cal').value = '';
}

function onMealSupervisedChange() {
  // 勾选监督时，提示将记录到对方账上
}

function confirmMeal() {
  const manualName = document.getElementById('manual-food-name').value.trim();
  const manualCal = document.getElementById('manual-food-cal').value;
  const supervised = document.getElementById('meal-supervised').checked;

  let targetAccount = currentRole;
  if (supervised) {
    targetAccount = currentRole === 'husband' ? 'wife' : 'husband';
  }

  if (selectedFood) {
    addMeal(getRecordDate(), targetAccount, selectedFood, null, null, supervised);
    closeModal('modal-meal');
    showToast((supervised ? '监督登记：' : '') + FOOD_CAL_MAP[selectedFood].name + ' 已记录到' + getDisplayName(targetAccount));
  } else if (manualName && manualCal) {
    addMeal(getRecordDate(), targetAccount, null, manualName, manualCal, supervised);
    closeModal('modal-meal');
    showToast((supervised ? '监督登记：' : '') + manualName + ' 已记录到' + getDisplayName(targetAccount));
  } else {
    showToast('请选择食物或手动输入');
    return;
  }

  updateAllUI();
}

// ========== AI拍照识别 ==========
function openCamera() {
  document.getElementById('ai-camera-input').click();
}

function handleImageCapture(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      compressAndPreview(img);
      startAIRecognition(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function compressAndPreview(img) {
  const canvas = document.getElementById('ai-preview-canvas');
  const maxW = 512;
  let w = img.width, h = img.height;
  if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const preview = document.getElementById('ai-preview');
  preview.classList.remove('hidden');
  document.getElementById('ai-results-inline').classList.add('hidden');
  document.getElementById('ai-loading').classList.remove('hidden');
}

async function startAIRecognition(img) {
  const canvas = document.getElementById('ai-preview-canvas');
  const base64 = canvas.toDataURL('image/jpeg', 0.7);

  try {
    const result = await analyzeFoodImage(base64);
    if (result.error) {
      showToast(result.error);
    }
    showRecognitionResults(result);
  } catch (e) {
    document.getElementById('ai-loading').classList.add('hidden');
    showToast('识别失败，请重试');
  }
}

function showRecognitionResults(result) {
  document.getElementById('ai-loading').classList.add('hidden');
  const resultsDiv = document.getElementById('ai-results-inline');
  resultsDiv.classList.remove('hidden');

  // Source badge
  const badge = document.getElementById('ai-source-badge');
  if (result.source === 'simulated') {
    badge.textContent = '离线识别（未配置AI）';
    badge.className = 'ai-source-badge badge-simulated';
  } else {
    badge.textContent = 'AI识别';
    badge.className = 'ai-source-badge badge-ai';
  }

  aiRecognitionResults = result.foods.map(f => ({ ...f, checked: true }));

  const list = document.getElementById('ai-results-list');
  list.innerHTML = aiRecognitionResults.map((f, i) => `
    <div class="ai-result-card" data-idx="${i}">
      <label class="ai-result-check">
        <input type="checkbox" checked onchange="toggleAIRecord(${i}, this.checked)">
      </label>
      <div class="ai-result-info">
        <span class="ai-result-name">${f.name}</span>
        <span class="ai-result-conf">置信度 ${Math.round(f.confidence * 100)}%</span>
      </div>
      <input type="number" class="ai-result-cal" value="${f.calories}" min="0" onchange="updateAICal(${i}, this.value)">
      <span style="font-size:14px;color:var(--text-muted);">kcal</span>
    </div>
  `).join('');

  updateAITotalCal();
}

function toggleAIRecord(idx, checked) {
  aiRecognitionResults[idx].checked = checked;
  updateAITotalCal();
}

function updateAICal(idx, val) {
  aiRecognitionResults[idx].calories = parseInt(val) || 0;
  updateAITotalCal();
}

function updateAITotalCal() {
  const total = aiRecognitionResults.filter(f => f.checked).reduce((s, f) => s + f.calories, 0);
  document.getElementById('ai-total-cal').textContent = total;
}

function clearAIPreview() {
  document.getElementById('ai-preview').classList.add('hidden');
  document.getElementById('ai-loading').classList.add('hidden');
  document.getElementById('ai-results-inline').classList.add('hidden');
  document.getElementById('ai-camera-input').value = '';
}

function confirmAllAIRecognition() {
  const supervised = document.getElementById('meal-supervised').checked;
  let targetAccount = currentRole;
  if (supervised) {
    targetAccount = currentRole === 'husband' ? 'wife' : 'husband';
  }

  const toAdd = aiRecognitionResults.filter(f => f.checked);
  if (toAdd.length === 0) {
    showToast('没有可添加的记录');
    return;
  }

  toAdd.forEach(f => {
    addMeal(today(), targetAccount, null, f.name, f.calories, supervised);
  });

  const totalCal = toAdd.reduce((s, f) => s + f.calories, 0);
  closeModal('modal-meal');
  showToast('AI识别已记录 ' + toAdd.length + ' 种食物，共 ' + totalCal + ' kcal');
  updateAllUI();
}

// ========== 运动记录弹窗 ==========
function openExerciseModal() {
  selectedExercise = null;
  document.getElementById('exercise-duration').value = '30';
  document.querySelectorAll('#exercise-grid .exercise-item').forEach(el => el.classList.remove('selected'));
  openModal('modal-exercise');
}

function selectExercise(exKey) {
  selectedExercise = exKey;
  document.querySelectorAll('#exercise-grid .exercise-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.ex === exKey);
  });
}

function confirmExercise() {
  if (!selectedExercise) {
    showToast('请选择运动类型');
    return;
  }

  const duration = parseInt(document.getElementById('exercise-duration').value) || 30;
  if (duration <= 0) {
    showToast('请输入有效时长');
    return;
  }

  const result = addExercise(today(), currentRole, selectedExercise, duration);
  closeModal('modal-exercise');
  showToast(getDisplayName(currentRole) + ' ' + result.name + ' ' + duration + '分钟 消耗' + result.calories + 'kcal');
  updateAllUI();
}

// ========== 快捷指令回调：解析 URL 参数中的运动数据 ==========
function initHASync() {
  const params = new URLSearchParams(location.search);
  if (params.get('ha_sync') !== '1') return;

  const steps = parseInt(params.get('steps')) || 0;
  const distance = parseFloat(params.get('distance')) || 0;
  const cal = parseInt(params.get('cal')) || 0;

  if (steps === 0 && cal === 0) return;

  const dateStr = today();
  addExerciseSync(dateStr, currentRole, {
    steps: steps,
    distance: distance,
    activeCal: cal
  });

  showToast(getDisplayName(currentRole) + ' 步数已同步 ✓');

  // 清理 URL 参数，避免刷新重复同步
  const cleanUrl = location.origin + location.pathname;
  history.replaceState(null, '', cleanUrl);

  updateAllUI();
}

// ========== 随机显示猫/狗图片 ==========
function initRandomAnimal() {
  const img = document.getElementById('pk-animal-img');
  if (!img) return;
  const animals = ['./img/dog.png', './img/cat.png'];
  const chosen = animals[Math.floor(Math.random() * animals.length)];
  // 加时间戳防浏览器缓存
  img.src = chosen + '?_=' + Date.now();
}



// ========== 喝水 ==========
function addWater(ml) {
  window._dataAddWater(today(), currentRole, ml);
  const info = getAccountInfo(currentRole);
  showToast(info.name + ' +' + ml + 'ml');
  updateAllUI();
}

// ========== 体重记录 ==========
function recordWeight() {
  const input = document.getElementById('weight-input');
  const val = parseFloat(input.value);
  if (!val || val <= 0) {
    showToast('请输入有效体重');
    return;
  }
  setWeight(getRecordDate(), currentRole, val);
  input.value = '';
  showToast(getDisplayName(currentRole) + ' 体重 ' + val + 'kg 已记录');
  updateAllUI();
}

// ========== 监督登记弹窗 ==========
function openSuperviseModal() {
  superviseTarget = null;
  svAiResults = [];
  document.getElementById('supervise-confirm-btn').style.display = 'none';
  document.getElementById('sv-manual-food-name').value = '';
  document.getElementById('sv-manual-food-cal').value = '';
  document.querySelectorAll('#supervise-food-grid .food-item').forEach(el => el.classList.remove('selected'));
  clearSvAIPreview();
  openModal('modal-supervise');
}

function superviseFood(foodKey) {
  superviseTarget = foodKey;
  document.querySelectorAll('#supervise-food-grid .food-item').forEach(el => el.classList.remove('selected'));
  const items = document.querySelectorAll('#supervise-food-grid .food-item');
  items.forEach(el => {
    if (el.textContent.includes(FOOD_CAL_MAP[foodKey].name)) el.classList.add('selected');
  });
  const btn = document.getElementById('supervise-confirm-btn');
  btn.style.display = 'block';
  const target = currentRole === 'husband' ? 'wife' : 'husband';
  btn.textContent = '确认监督登记：' + FOOD_CAL_MAP[foodKey].name + ' → ' + getDisplayName(target);
}

function confirmSupervise() {
  if (!superviseTarget) {
    showToast('请选择食物');
    return;
  }

  const target = currentRole === 'husband' ? 'wife' : 'husband';
  addMeal(today(), target, superviseTarget, null, null, true);
  closeModal('modal-supervise');
  showToast('已监督登记到' + getDisplayName(target) + '：' + FOOD_CAL_MAP[superviseTarget].name);
  updateAllUI();
}

// ========== 监督登记 - AI拍照识别 ==========
function openSuperviseCamera() {
  document.getElementById('sv-camera-input').click();
}

function handleSuperviseImageCapture(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      compressSupervisePreview(img);
      startSuperviseAIRecognition(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function compressSupervisePreview(img) {
  const canvas = document.getElementById('sv-ai-preview-canvas');
  const maxW = 512;
  let w = img.width, h = img.height;
  if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const preview = document.getElementById('sv-ai-preview');
  preview.classList.remove('hidden');
  document.getElementById('sv-ai-results-inline').classList.add('hidden');
  document.getElementById('sv-ai-loading').classList.remove('hidden');
}

async function startSuperviseAIRecognition(img) {
  const canvas = document.getElementById('sv-ai-preview-canvas');
  const base64 = canvas.toDataURL('image/jpeg', 0.7);

  try {
    const result = await analyzeFoodImage(base64);
    if (result.error) {
      showToast(result.error);
    }
    showSuperviseRecognitionResults(result);
  } catch (e) {
    document.getElementById('sv-ai-loading').classList.add('hidden');
    showToast('识别失败，请重试');
  }
}

function showSuperviseRecognitionResults(result) {
  document.getElementById('sv-ai-loading').classList.add('hidden');
  const resultsDiv = document.getElementById('sv-ai-results-inline');
  resultsDiv.classList.remove('hidden');

  const badge = document.getElementById('sv-ai-source-badge');
  if (result.source === 'simulated') {
    badge.textContent = '离线识别（未配置AI）';
    badge.className = 'ai-source-badge badge-simulated';
  } else {
    badge.textContent = 'AI识别';
    badge.className = 'ai-source-badge badge-ai';
  }

  svAiResults = result.foods.map(f => ({ ...f, checked: true }));

  const list = document.getElementById('sv-ai-results-list');
  list.innerHTML = svAiResults.map((f, i) => `
    <div class="ai-result-card" data-idx="${i}">
      <label class="ai-result-check">
        <input type="checkbox" checked onchange="toggleSvAIRecord(${i}, this.checked)">
      </label>
      <div class="ai-result-info">
        <span class="ai-result-name">${f.name}</span>
        <span class="ai-result-conf">置信度 ${Math.round(f.confidence * 100)}%</span>
      </div>
      <input type="number" class="ai-result-cal" value="${f.calories}" min="0" onchange="updateSvAICal(${i}, this.value)">
      <span style="font-size:14px;color:var(--text-muted);">kcal</span>
    </div>
  `).join('');

  updateSvAITotalCal();
}

function toggleSvAIRecord(idx, checked) {
  svAiResults[idx].checked = checked;
  updateSvAITotalCal();
}

function updateSvAICal(idx, val) {
  svAiResults[idx].calories = parseInt(val) || 0;
  updateSvAITotalCal();
}

function updateSvAITotalCal() {
  const total = svAiResults.filter(f => f.checked).reduce((s, f) => s + f.calories, 0);
  document.getElementById('sv-ai-total-cal').textContent = total;
}

function clearSvAIPreview() {
  document.getElementById('sv-ai-preview').classList.add('hidden');
  document.getElementById('sv-ai-loading').classList.add('hidden');
  document.getElementById('sv-ai-results-inline').classList.add('hidden');
  document.getElementById('sv-camera-input').value = '';
}

function confirmSuperviseAI() {
  const target = currentRole === 'husband' ? 'wife' : 'husband';

  const toAdd = svAiResults.filter(f => f.checked);
  if (toAdd.length === 0) {
    showToast('没有可添加的记录');
    return;
  }

  toAdd.forEach(f => {
    addMeal(today(), target, null, f.name, f.calories, true);
  });

  const totalCal = toAdd.reduce((s, f) => s + f.calories, 0);
  closeModal('modal-supervise');
  showToast('AI识别已监督登记 ' + toAdd.length + ' 种食物，共 ' + totalCal + ' kcal 到' + getDisplayName(target));
  updateAllUI();
}

// ========== 监督登记 - 手动输入 ==========
function confirmSuperviseManual() {
  const manualName = document.getElementById('sv-manual-food-name').value.trim();
  const manualCal = document.getElementById('sv-manual-food-cal').value;

  if (!manualName || !manualCal) {
    showToast('请输入食物名称和卡路里');
    return;
  }

  const target = currentRole === 'husband' ? 'wife' : 'husband';
  addMeal(today(), target, null, manualName, manualCal, true);
  closeModal('modal-supervise');
  showToast('已监督登记到' + getDisplayName(target) + '：' + manualName + ' ' + manualCal + 'kcal');
  updateAllUI();
}

// ========== 我的页面 ==========
function updateMePage() {
  const account = currentRole;
  const info = getAccountInfo(account);

  // 账号设置区域
  document.getElementById('me-account-name').textContent = account;
  const curNick = getNickname(currentRole) || '';
  document.getElementById('me-nickname-input').value = curNick;
  document.getElementById('me-nickname-input').placeholder = getDefaultAccountName(currentRole);
  document.getElementById('me-old-pwd').value = '';
  document.getElementById('me-new-pwd').value = '';
  document.getElementById('me-settings-error').textContent = '';

  document.getElementById('cal-budget-input').value = (info && info.dailyCalorieBudget) || 2000;
  document.getElementById('init-weight-input').value = (info && info.initialWeight) || 70;
  document.getElementById('target-weight-input').value = (info && info.targetWeight) || 60;

  // 管理员可见改密区
  const adminSection = document.getElementById('admin-password-section');
  if (adminSection) {
    adminSection.style.display = isAdmin ? '' : 'none';
    if (isAdmin) {
      const select = document.getElementById('admin-target-account');
      if (select) {
        const users = loadUsers();
        select.innerHTML = '';
        Object.keys(users).forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        });
      }
    }
  }

  // AI设置
  const aiConfig = loadAIConfig();
  document.getElementById('ai-api-endpoint').value = aiConfig.apiEndpoint || '';
  document.getElementById('ai-api-key').value = aiConfig.apiKey || '';
  document.getElementById('ai-model').value = aiConfig.model || '';

  // 奖金池信息
  updateElement('pool-h-label', getDisplayName('husband') + '投入');
  updateElement('pool-w-label', getDisplayName('wife') + '投入');
  const pool = getPool();
  if (pool) {
    updateElement('pool-status', pool.status === 'active' ? '进行中' : '已结算');
    updateElement('pool-period-display', pool.startDate + ' ~ ' + pool.endDate);
    updateElement('pool-husband', pool.husbandAmount + ' 元');
    updateElement('pool-wife', pool.wifeAmount + ' 元');
  } else {
    updateElement('pool-status', '未开启');
    updateElement('pool-period-display', '-');
    updateElement('pool-husband', '0 元');
    updateElement('pool-wife', '0 元');
  }
}

function saveCalorieBudget() {
  const val = parseInt(document.getElementById('cal-budget-input').value) || 2000;
  updateAccountInfo(currentRole, { dailyCalorieBudget: val });
  showToast('卡路里预算已更新：' + val + ' kcal');
  updateAllUI();
}

function saveInitWeight() {
  const val = parseFloat(document.getElementById('init-weight-input').value) || 70;
  updateAccountInfo(currentRole, { initialWeight: val });
  showToast('初始体重已更新：' + val + ' kg');
  updateAllUI();
}

function saveTargetWeight() {
  const val = parseFloat(document.getElementById('target-weight-input').value) || 60;
  updateAccountInfo(currentRole, { targetWeight: val });
  showToast('目标体重已更新：' + val + ' kg');
  updateAllUI();
}

// ========== AI设置 ==========
function saveAISettings() {
  const config = {
    apiEndpoint: document.getElementById('ai-api-endpoint').value.trim(),
    apiKey: document.getElementById('ai-api-key').value.trim(),
    model: document.getElementById('ai-model').value.trim()
  };
  saveAIConfig(config);
  showToast('AI设置已保存');
  document.getElementById('ai-test-result').classList.add('hidden');
}

async function testAIConnection() {
  const endpoint = document.getElementById('ai-api-endpoint').value.trim();
  const apiKey = document.getElementById('ai-api-key').value.trim();
  const model = document.getElementById('ai-model').value.trim();

  const resultDiv = document.getElementById('ai-test-result');
  resultDiv.classList.remove('hidden');

  if (!endpoint) {
    resultDiv.textContent = '请填写 API 地址';
    resultDiv.style.color = 'var(--orange-deep)';
    return;
  }

  if (!apiKey) {
    resultDiv.textContent = '请先输入 API Key';
    resultDiv.style.color = 'var(--orange-deep)';
    return;
  }

  resultDiv.textContent = '测试中...';
  resultDiv.style.color = 'var(--text-muted)';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });

    if (res.ok) {
      resultDiv.textContent = '连接成功';
      resultDiv.style.color = 'var(--green)';
      showToast('AI连接测试成功');
    } else if (res.status === 401) {
      resultDiv.textContent = '401 — API Key 无效，请检查 Key 是否正确';
      resultDiv.style.color = 'var(--orange-deep)';
    } else if (res.status === 404) {
      resultDiv.textContent = '404 — API 地址错误，请检查 Endpoint 是否正确';
      resultDiv.style.color = 'var(--orange-deep)';
    } else if (res.status === 429) {
      resultDiv.textContent = '429 — 请求频率超限，请稍后再试';
      resultDiv.style.color = 'var(--orange-deep)';
    } else {
      const errData = await res.text().catch(() => '');
      const snippet = errData.substring(0, 100);
      resultDiv.textContent = res.status + ' 错误：' + snippet;
      resultDiv.style.color = 'var(--orange-deep)';
    }
  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      resultDiv.textContent = '网络错误：无法连接到服务器，请检查 API 地址';
    } else {
      resultDiv.textContent = '网络错误：' + e.message;
    }
    resultDiv.style.color = 'var(--orange-deep)';
  }
}

function restoreAIDefaults() {
  const config = getDefaultAIConfig();
  document.getElementById('ai-api-endpoint').value = config.apiEndpoint;
  document.getElementById('ai-api-key').value = config.apiKey;
  document.getElementById('ai-model').value = config.model;
  document.getElementById('ai-test-result').classList.add('hidden');
  showToast('已恢复默认设置，请保存生效');
}

// ========== 昵称编辑 ==========
function openNicknameModal() {
  const currentName = getDisplayName(currentRole);
  document.getElementById('nickname-account-label').textContent = currentName;
  document.getElementById('nickname-input').value = getNickname(currentRole) || '';
  openModal('modal-nickname');
}

function saveNickname() {
  const val = document.getElementById('nickname-input').value.trim();
  const oldName = getDisplayName(currentRole);
  setNickname(currentRole, val);
  const newName = getDisplayName(currentRole);
  closeModal('modal-nickname');
  if (newName !== oldName) {
    showToast('昵称已更新：' + newName);
  } else if (!val && !getNickname(currentRole)) {
    showToast('已恢复默认名称：' + newName);
  }
  updateAllUI();
}

function closeNicknameModal() {
  closeModal('modal-nickname');
}

// ========== 账号设置保存（"我的"页面） ==========
function saveAccountSettings() {
  const account = currentUser;
  const errEl = document.getElementById('me-settings-error');
  errEl.textContent = '';

  const nickname = document.getElementById('me-nickname-input').value.trim();
  const oldPwd = document.getElementById('me-old-pwd').value;
  const newPwd = document.getElementById('me-new-pwd').value;

  let changes = [];

  // 修改昵称（以角色为 key 存储，与全局 getDisplayName 保持一致）
  const oldName = getDisplayName(currentRole);
  setNickname(currentRole, nickname);
  const newName = getDisplayName(currentRole);
  if (newName !== oldName) {
    changes.push('昵称：' + newName);
  }

  // 修改密码
  if (newPwd) {
    if (!oldPwd) {
      errEl.textContent = '修改密码需要输入当前密码';
      return;
    }
    const result = selfChangePassword(account, oldPwd, newPwd);
    if (!result.success) {
      errEl.textContent = result.error;
      return;
    }
    changes.push('密码已修改');
  } else if (oldPwd && !newPwd) {
    errEl.textContent = '请输入新密码';
    return;
  }

  // 清理密码字段
  document.getElementById('me-old-pwd').value = '';
  document.getElementById('me-new-pwd').value = '';

  if (changes.length > 0) {
    showToast(changes.join('；'));
  } else {
    showToast('无变更');
  }

  updateAllUI();
}

// ========== 奖金池 ==========
function openPoolModal() {
  // 更新弹窗标签为当前昵称
  updateElement('pool-modal-h-label', getDisplayName('husband') + '投入金额（虚拟）');
  updateElement('pool-modal-w-label', getDisplayName('wife') + '投入金额（虚拟）');
  const pool = getPool();
  if (pool) {
    document.getElementById('pool-days').value = 7;
    document.getElementById('pool-husband-amount').value = pool.husbandAmount || 100;
    document.getElementById('pool-wife-amount').value = pool.wifeAmount || 100;
  }
  openModal('modal-pool');
}

function startPool() {
  const days = parseInt(document.getElementById('pool-days').value) || 7;
  const husbandAmount = parseInt(document.getElementById('pool-husband-amount').value) || 0;
  const wifeAmount = parseInt(document.getElementById('pool-wife-amount').value) || 0;

  if (husbandAmount <= 0 || wifeAmount <= 0) {
    showToast('请输入有效的投入金额');
    return;
  }

  const startDate = today();
  const end = new Date();
  end.setDate(end.getDate() + days - 1);
  const endDate = dateStr(end);

  setPool({
    startDate,
    endDate,
    husbandAmount,
    wifeAmount,
    status: 'active'
  });

  closeModal('modal-pool');
  showToast('奖金池已开启！总奖池 ' + (husbandAmount + wifeAmount) + ' 元');
  updateAllUI();
}

function settlePool() {
  const pool = getPool();
  if (!pool || pool.status !== 'active') {
    showToast('没有进行中的奖金池');
    return;
  }

  const { hTotal, wTotal } = getPoolScores(pool.startDate, pool.endDate);
  let winner;
  if (hTotal > wTotal) winner = 'husband';
  else if (wTotal > hTotal) winner = 'wife';
  else winner = 'tie';

  const totalPool = pool.husbandAmount + pool.wifeAmount;

  pool.status = 'completed';
  pool.winner = winner;
  pool.finalHScore = hTotal;
  pool.finalWScore = wTotal;
  setPool(pool);

  closeModal('modal-pool');

  let msg = '奖金池结算！';
  if (winner === 'tie') {
    msg += ' 平局！' + totalPool + ' 元退还';
  } else {
    const name = getDisplayName(winner);
    msg += ' ' + name + ' 赢得 ' + totalPool + ' 元！';
  }
  msg += ' (' + getDisplayName('husband') + hTotal + '分 vs ' + getDisplayName('wife') + wTotal + '分)';
  showToast(msg);
  updateAllUI();
}

// ========== 重置数据 ==========
function resetAllData() {
  if (confirm('确定要重置全部数据吗？此操作不可恢复！')) {
    resetAll();
    initMockData();
    updateAllUI();
    destroyCharts();
    renderAllCharts();
    showToast('数据已重置');
  }
}

function clearDataKeepAccount() {
  if (!confirm('确定要清空运动记录与设置数据吗？\n\n将清除：运动记录、积分、热量/体重设置、昵称、AI配置\n将保留：已注册的账号密码\n\n此操作不可恢复！')) return;
  clearAllData();
  location.reload();
}

// ========== 弹窗操作 ==========
let _bodyScrollY = 0;

function openModal(id) {
  _bodyScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_bodyScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  window.scrollTo(0, _bodyScrollY);
}

// ========== 折叠面板 ==========
function toggleSection(id) {
  const body = document.getElementById(id);
  const toggle = document.getElementById(id.split('-')[0] + '-toggle');
  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    if (toggle) toggle.classList.remove('open');
  } else {
    body.classList.add('hidden');
    if (toggle) toggle.classList.add('open');
  }
}

// ========== 点击弹窗外层关闭 ==========
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
    closeModal(e.target.id);
  }
});

// 防止弹窗内滚动穿透到背景页面
document.addEventListener('touchmove', function(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.stopPropagation();
  }
}, { passive: true });
