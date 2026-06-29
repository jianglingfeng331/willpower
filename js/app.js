// ========== App Main Logic ==========

let currentUser = null;   // 当前登录账号名（自定义）
let currentRole = null;    // 'husband' 或 'wife'
let isAdmin = false;
let selectedFoods = [];     // [{key, name, calories, quantity, unit}]
let selectedExercise = null;
let aiRecognitionResults = [];
let recordDate = today();
let recordViewRole = null; // 记录页当前查看的角色，切换后可查看对方历史记录
let mealTab = 'common';    // 'common' | 'camera' | 'manual'
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
  let user = getCurrentUser();
  // 自动登录：sessionStorage 无登录态但 localStorage 有
  if (!user) {
    const result = autoLogin();
    if (result && result.success) {
      user = getCurrentUser();
    }
  }
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
    checkPkAutoSettle();
  } else {
    // 调试：输出详细诊断信息
    const users = loadUsers();
    const saved = localStorage.getItem('pk_users');
    console.log('[DEBUG doLogin] 输入账号:', account, '密码长度:', password.length);
    console.log('[DEBUG doLogin] localStorage pk_users 原始值:', saved);
    console.log('[DEBUG doLogin] loadUsers() 返回:', JSON.stringify(users));
    console.log('[DEBUG doLogin] login result.error:', result.error);
    let debugMsg = result.error;
    if (!users) {
      debugMsg += ' [诊断: localStorage中pk_users为null，initData可能未加载用户数据]';
    } else {
      const found = users[account];
      if (!found) {
        debugMsg += ' [诊断: 已加载' + Object.keys(users).length + '个账号: ' + Object.keys(users).join(',') + ']';
      } else {
        debugMsg += ' [诊断: 账号存在，但密码不匹配。期望密码长度=' + found.password.length + ', 输入密码长度=' + password.length + ']';
      }
    }
    document.getElementById('login-error').textContent = debugMsg;
  }
}

// ========== 首次引导设置 ==========
function checkFirstTimeSetup() {
  if (isSetupCompleted(currentRole)) return;

  // 兜底检查：SETUP_KEY 可能因存储清理等原因丢失，
  // 但账户设置数据（体重/热量预算）仍然存在 → 自动补标记，跳过弹窗
  const info = getAccountInfo(currentRole);
  if (info && info.initialWeight > 0 && info.targetWeight > 0 && info.dailyCalorieBudget > 0) {
    markSetupCompleted(currentRole);
    return;
  }

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

async function doRegister() {
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
  const result = await register(hName, hPwd, wName, wPwd);
  if (!result.success) {
    document.getElementById('reg-error').textContent = result.error || '注册失败';
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
  if (tab === 'record') { recordViewRole = currentRole; updateRecordPage(); }
  if (tab === 'stats') { destroyCharts(); renderAllCharts(); renderWaterStats(); }
  if (tab === 'me') updateMePage();
}

// ========== 全量UI更新 ==========
function updateAllUI() {
  updateHeader();
  updateHomePage();
  updateRecordPage();
  updateMePage();
  checkKillDuelPopup();
  checkPkAutoSettle();
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
  const pkBar = document.getElementById('pk-bar');
  const pkPeriod = document.getElementById('pk-period');
  const pkFillH = document.getElementById('pk-fill-husband');
  const pkHScore = document.getElementById('pk-h-score');
  const pkWScore = document.getElementById('pk-w-score');

  const active = getActivePkRound();

  if (!active || !active.items.includes('score')) {
    // 无进行中PK或PK不含积分 → 显示默认条
    if (pkFillH) pkFillH.style.width = '50%';
    if (pkHScore) pkHScore.textContent = '-';
    if (pkWScore) pkWScore.textContent = '-';
    if (pkPeriod) pkPeriod.textContent = '未开启PK';
    return;
  }

  const todayDate = today();
  const { hTotal, wTotal } = getPoolScores(active.startDate, todayDate);
  const total = hTotal + wTotal || 1;
  const hPct = Math.round((hTotal / total) * 100);

  if (pkFillH) pkFillH.style.width = hPct + '%';
  if (pkHScore) pkHScore.textContent = hTotal;
  if (pkWScore) pkWScore.textContent = wTotal;

  const start = new Date(active.startDate);
  const end = new Date(active.endDate);
  if (pkPeriod) pkPeriod.textContent = formatDateShort(start) + ' - ' + formatDateShort(end);
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

// ========== 监督登记概览 ==========
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

// ========== 记录页角色切换 ==========
function toggleRecordViewRole() {
  const partnerRole = currentRole === 'husband' ? 'wife' : 'husband';
  recordViewRole = recordViewRole === currentRole ? partnerRole : currentRole;
  updateRecordPage();
}

// ========== 记录页更新 ==========
function updateRecordPage() {
  const dt = getRecordDate();
  const isToday = dt === today();
  const viewRole = recordViewRole || currentRole; // 兜底
  const isViewingPartner = viewRole !== currentRole;
  const rec = getDayRecord(dt, viewRole);
  const stats = calcTodayStats(dt, viewRole);

  // 更新日期导航栏
  const navDisplay = document.getElementById('date-nav-display');
  if (navDisplay) {
    navDisplay.textContent = isToday ? '今日记录' : formatDateDisplay(dt);
  }

  // 角色切换按钮 + 回到今天按钮
  const navExtra = document.getElementById('date-nav-extra');
  if (navExtra) {
    const selfName = getDisplayName(currentRole);
    const partnerRole = currentRole === 'husband' ? 'wife' : 'husband';
    const partnerName = getDisplayName(partnerRole);
    const selfActive = !isViewingPartner ? ' active' : '';
    const partnerActive = isViewingPartner ? ' active' : '';
    const todayBtn = isToday ? '' : '<span class="date-nav-today" style="margin-right:8px;" onclick="goToToday()">回到今天</span>';
    navExtra.innerHTML = todayBtn +
      '<div class="record-account-switch">' +
        '<button class="ras-btn' + selfActive + '" onclick="toggleRecordViewRole()">' + selfName + '</button>' +
        '<button class="ras-btn' + partnerActive + '" onclick="toggleRecordViewRole()">' + partnerName + '</button>' +
      '</div>';
  }

  // 日期汇总
  const summaryEl = document.getElementById('date-summary');
  if (summaryEl) {
    summaryEl.innerHTML = '<span>摄入 ' + stats.calIn + ' kcal</span>' +
      '<span>消耗 ' + stats.calOut + ' kcal</span>' +
      '<span>饮水 ' + stats.waterTotal + ' ml</span>' +
      '<span>得分 ' + stats.score + '</span>';
  }

  // 查看对方数据时隐藏录入按钮；历史日期也隐藏
  const recordSection = document.getElementById('tab-record');
  if (recordSection) {
    const btns = recordSection.querySelectorAll('.record-btn, .sync-btn, .water-btn, .weight-input-row');
    btns.forEach(b => { b.style.display = (isToday && !isViewingPartner) ? '' : 'none'; });
  }

  // 可删除条件：今日 + 查看的是自己
  const canDelete = isToday && !isViewingPartner;

  // 饮食列表
  const mealList = document.getElementById('meal-list');
  const delMeal = (i) => canDelete ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteMeal(${i})"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
  mealList.innerHTML = rec.meals.length === 0
    ? '<div style="color:#999;font-size:13px;padding:8px 0;">暂无记录</div>'
    : rec.meals.map((m, i) => `
      <div class="record-item">
        <div class="record-item-left">
          ${m.name} ${m.quantity && m.quantity > 1 ? '×' + m.quantity : ''}
        </div>
        <div class="record-item-right">${m.totalCalories || m.calories} kcal${delMeal(i)}
        </div>
      </div>
    `).join('');

  // 运动列表
  const exList = document.getElementById('exercise-list');
  const delEx = (i) => canDelete ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteExercise(${i})"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
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
  const delWater = (ri) => canDelete ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteWater(${waterLen - 1 - ri})"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
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
  const info = getAccountInfo(viewRole);
  const targetWeight = info ? info.targetWeight : '-';
  const weightDayLabel = isToday ? '今日' : '当日';
  const delWeight = canDelete ? `<span class="record-item-delete" onclick="event.stopPropagation();confirmDeleteWeight()"><svg width="18" height="18"><use href="#ic-close"/></svg></span>` : '';
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

// ========== 饮食记录弹窗（三段Tab式）==========
function openMealModal() {
  selectedFoods = [];
  mealTab = 'common';
  aiRecognitionResults = [];
  clearAIPreview();

  // Tab 切换
  document.querySelectorAll('.meal-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector('.meal-tab[data-tab="common"]');
  if (activeTab) activeTab.classList.add('active');

  document.querySelectorAll('.meal-tab-content').forEach(c => c.classList.remove('active'));
  const commonContent = document.getElementById('meal-tab-common');
  if (commonContent) commonContent.classList.add('active');

  // 清空手动输入
  document.getElementById('manual-food-name').value = '';
  document.getElementById('manual-food-cal').value = '';

  // 渲染常用食物网格
  renderFoodGrid();
  // 渲染已选列表
  updateSelectedList();
  // 重置确认按钮
  document.getElementById('meal-confirm-btn').textContent = '请添加食物';

  openModal('modal-meal');
}

// ========== Tab 切换 ==========
function switchMealTab(tab) {
  mealTab = tab;
  document.querySelectorAll('.meal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.meal-tab-content').forEach(c => c.classList.remove('active'));

  const tabEl = document.querySelector('.meal-tab[data-tab="' + tab + '"]');
  if (tabEl) tabEl.classList.add('active');
  const contentEl = document.getElementById('meal-tab-' + tab);
  if (contentEl) contentEl.classList.add('active');

  if (tab === 'common') {
    renderFoodGrid();
  }
}

// ========== 渲染常用食物网格 ==========
function renderFoodGrid() {
  const grid = document.getElementById('food-grid');
  const allFoods = getAllFoods();
  const entries = Object.entries(allFoods);

  if (entries.length === 0) {
    grid.innerHTML = '<div style="color:#999;font-size:13px;padding:16px;text-align:center;">暂无食物，请添加自定义食物</div>';
    return;
  }

  grid.innerHTML = entries.map(([key, f]) => `
    <div class="food-item" data-key="${key}" onclick="addFoodToSelected('${key}')">
      <div class="food-item-name">${f.name}</div>
      <div class="food-item-cal">${f.cal} kcal/${f.unit}</div>
      ${f.source === 'custom' ? '<div class="food-item-tag">自定义</div>' : ''}
    </div>
  `).join('');
}

// ========== 添加食物到已选列表 ==========
function addFoodToSelected(key) {
  const allFoods = getAllFoods();
  const f = allFoods[key];
  if (!f) return;

  // 检查是否已在列表中，是则 quantity+1
  const existing = selectedFoods.find(item => item.key === key);
  if (existing) {
    existing.quantity++;
  } else {
    selectedFoods.push({
      key: key,
      name: f.name,
      calories: f.cal,
      quantity: 1,
      unit: f.unit
    });
  }
  updateSelectedList();
}

// AI 识别结果添加到已选列表
function addAiFoodToList(name, calories) {
  const existing = selectedFoods.find(item => item.name === name && item.key === undefined);
  if (existing) {
    existing.quantity++;
  } else {
    selectedFoods.push({
      key: undefined,
      name: name,
      calories: parseInt(calories) || 0,
      quantity: 1,
      unit: ''
    });
  }
  updateSelectedList();
}

// ========== 渲染已选列表 + 合计热量 ==========
function updateSelectedList() {
  const listEl = document.getElementById('selected-foods-list');
  const totalEl = document.getElementById('meal-total-cal');
  const btnEl = document.getElementById('meal-confirm-btn');

  if (selectedFoods.length === 0) {
    listEl.innerHTML = '<div class="selected-empty">请选择食物或拍照识别</div>';
    totalEl.textContent = '0';
    btnEl.textContent = '请添加食物';
    btnEl.disabled = true;
    return;
  }
  btnEl.disabled = false;

  let total = 0;
  listEl.innerHTML = selectedFoods.map((item, idx) => {
    const itemTotal = item.calories * item.quantity;
    total += itemTotal;
    return `
      <div class="selected-food-item">
        <div class="selected-food-info">
          <span class="selected-food-name">${item.name}</span>
          <span class="selected-food-unit">${item.calories} kcal/${item.unit || '份'}</span>
        </div>
        <div class="food-stepper">
          <button class="stepper-btn" onclick="changeQuantity(${idx}, -1)">−</button>
          <span class="stepper-val">${item.quantity}</span>
          <button class="stepper-btn" onclick="changeQuantity(${idx}, 1)">+</button>
        </div>
        <span class="selected-food-total">${itemTotal} kcal</span>
      </div>
    `;
  }).join('');

  totalEl.textContent = total;
  btnEl.textContent = '确认记录 ' + total + ' kcal';
}

// ========== 调节份数 ==========
function changeQuantity(index, delta) {
  if (index < 0 || index >= selectedFoods.length) return;
  selectedFoods[index].quantity += delta;
  if (selectedFoods[index].quantity <= 0) {
    selectedFoods.splice(index, 1);
  }
  updateSelectedList();
}

// ========== 手动输入添加到列表 ==========
function addManualFoodToList() {
  const nameEl = document.getElementById('manual-food-name');
  const calEl = document.getElementById('manual-food-cal');
  const name = nameEl.value.trim();
  const cal = parseInt(calEl.value);

  if (!name) { showToast('请输入食物名称'); return; }
  if (!cal || cal <= 0) { showToast('请输入有效热量'); return; }

  selectedFoods.push({
    key: undefined,
    name: name,
    calories: cal,
    quantity: 1,
    unit: ''
  });

  nameEl.value = '';
  calEl.value = '';
  updateSelectedList();
  showToast(name + ' 已添加');
}

// ========== 确认记录（遍历 selectedFoods）==========
function confirmMeal() {
  if (selectedFoods.length === 0) {
    showToast('请添加至少一种食物');
    return;
  }

  selectedFoods.forEach(item => {
    addMeal(getRecordDate(), currentRole, item.key || null, item.key ? null : item.name, item.key ? null : item.calories, item.quantity, false);
  });

  const totalCal = selectedFoods.reduce((s, f) => s + f.calories * f.quantity, 0);
  closeModal('modal-meal');
  showToast('已记录 ' + selectedFoods.length + ' 种食物，共 ' + totalCal + ' kcal');
  updateAllUI();
}

// ========== 自定义运动管理 ==========
function openCustomExerciseModal() {
  renderCustomExerciseList();
  // 清空输入
  document.getElementById('custom-exercise-name').value = '';
  document.getElementById('custom-exercise-cal').value = '';
  openModal('modal-custom-exercise');
}

function addCustomExerciseItem() {
  const name = document.getElementById('custom-exercise-name').value.trim();
  const calStr = document.getElementById('custom-exercise-cal').value.trim();
  if (!name) { showToast('请输入运动名称'); return; }
  const cal = parseInt(calStr);
  if (isNaN(cal) || cal <= 0) { showToast('请输入有效的每小时消耗(kcal)'); return; }
  addCustomExercise(name, cal);
  renderCustomExerciseList();
  renderCustomExerciseGrid();
  document.getElementById('custom-exercise-name').value = '';
  document.getElementById('custom-exercise-cal').value = '';
  showToast('已添加自定义运动：' + name);
}

function removeCustomExerciseItem(key) {
  removeCustomExercise(key);
  renderCustomExerciseList();
  renderCustomExerciseGrid();
}

function renderCustomExerciseList() {
  const el = document.getElementById('custom-exercise-list');
  if (!el) return;
  const list = Object.entries(getCustomExercises());
  if (list.length === 0) {
    el.innerHTML = '<div style="color:#999;font-size:13px;padding:8px 0;">暂无自定义运动</div>';
    return;
  }
  el.innerHTML = list.map(([key, e]) => `
    <div class="sf-item">
      <div class="sf-item-info">
        <span class="sf-item-name">${e.name}</span>
        <span class="sf-item-cal">${e.calPerHour} kcal/h</span>
      </div>
      <button class="sf-item-del" onclick="removeCustomExerciseItem('${key}')"><svg width="16" height="16"><use href="#ic-close"/></svg></button>
    </div>
  `).join('');
}

function renderCustomExerciseGrid() {
  const container = document.getElementById('custom-exercise-items');
  if (!container) return;
  const exercises = getCustomExercises();
  const list = Object.entries(exercises);
  container.innerHTML = list.map(([key, e]) => `
    <div class="exercise-item" onclick="selectExercise('${key}')" data-ex="${key}">
      <svg class="ic-inline" width="16" height="16"><use href="#ic-exercise"/></svg> ${e.name}<br><small>~${e.calPerHour}kcal/h</small>
    </div>
  `).join('');
}

// ========== AI拍照识别 ==========
function openCamera() {
  const input = document.getElementById('ai-camera-input');
  if (!input) {
    showToast('相机组件未就绪，请刷新页面');
    return;
  }
  input.click();
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

  aiRecognitionResults = result.foods.map(f => ({ ...f, checked: true, quantity: 1 }));

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
      <div class="food-stepper ai-stepper">
        <button class="stepper-btn" onclick="changeAiQty(${i}, -1)">−</button>
        <span class="stepper-val">${f.quantity}</span>
        <button class="stepper-btn" onclick="changeAiQty(${i}, 1)">+</button>
      </div>
      <span class="ai-result-subtotal">${f.calories} kcal</span>
    </div>
  `).join('');

  updateAITotalCal();
}

function changeAiQty(idx, delta) {
  const f = aiRecognitionResults[idx];
  if (!f) return;
  f.quantity = Math.max(1, f.quantity + delta);

  // 更新 DOM
  const card = document.querySelector(`.ai-result-card[data-idx="${idx}"]`);
  if (card) {
    card.querySelector('.stepper-val').textContent = f.quantity;
    card.querySelector('.ai-result-subtotal').textContent = (f.calories * f.quantity) + ' kcal';
  }
  updateAITotalCal();
}

function toggleAIRecord(idx, checked) {
  aiRecognitionResults[idx].checked = checked;
  updateAITotalCal();
}

function updateAICal(idx, val) {
  aiRecognitionResults[idx].calories = parseInt(val) || 0;
  // 同步更新单条 subtotal
  const f = aiRecognitionResults[idx];
  const card = document.querySelector(`.ai-result-card[data-idx="${idx}"]`);
  if (card) {
    card.querySelector('.ai-result-subtotal').textContent = (f.calories * f.quantity) + ' kcal';
  }
  updateAITotalCal();
}

function updateAITotalCal() {
  const total = aiRecognitionResults.filter(f => f.checked).reduce((s, f) => s + f.calories * f.quantity, 0);
  document.getElementById('ai-total-cal').textContent = total;
}

function clearAIPreview() {
  document.getElementById('ai-preview').classList.add('hidden');
  document.getElementById('ai-loading').classList.add('hidden');
  document.getElementById('ai-results-inline').classList.add('hidden');
  document.getElementById('ai-camera-input').value = '';
}

function confirmAllAIRecognition() {
  const toAdd = aiRecognitionResults.filter(f => f.checked);
  if (toAdd.length === 0) {
    showToast('没有可添加的记录');
    return;
  }

  toAdd.forEach(f => {
    addAiFoodToList(f.name, f.calories);
    // 如果 quantity > 1，额外增量
    const existing = selectedFoods.find(item => item.name === f.name);
    if (existing && f.quantity > 1) {
      existing.quantity += f.quantity - 1;
    }
  });

  // 清空 AI 预览
  clearAIPreview();
  aiRecognitionResults = [];
  // 更新已选列表
  updateSelectedList();
  showToast('已添加 ' + toAdd.length + ' 种食物到列表');
}

// ========== 自定义食物管理弹窗 ==========
function openCustomFoodModal() {
  const listEl = document.getElementById('custom-food-list');
  const customFoods = getCustomFoods();
  const entries = Object.entries(customFoods);

  if (entries.length === 0) {
    listEl.innerHTML = '<div style="color:#999;font-size:13px;padding:8px;">暂无自定义食物</div>';
  } else {
    listEl.innerHTML = entries.map(([key, f]) => `
      <div class="selected-food-item">
        <div class="selected-food-info">
          <span class="selected-food-name">${f.name}</span>
          <span class="selected-food-unit">${f.cal} kcal/${f.unit}</span>
        </div>
        <button class="custom-food-del-btn" onclick="removeCustomFoodItem('${key}')">删除</button>
      </div>
    `).join('');
  }

  document.getElementById('custom-food-name').value = '';
  document.getElementById('custom-food-cal').value = '';
  document.getElementById('custom-food-unit').value = '';
  openModal('modal-custom-food');
}

function addCustomFoodItem() {
  const name = document.getElementById('custom-food-name').value.trim();
  const cal = document.getElementById('custom-food-cal').value;
  const unit = document.getElementById('custom-food-unit').value.trim() || '份';

  if (!name) { showToast('请输入食物名称'); return; }
  if (!cal || parseInt(cal) <= 0) { showToast('请输入有效热量'); return; }

  addCustomFood(name, cal, unit);
  document.getElementById('custom-food-name').value = '';
  document.getElementById('custom-food-cal').value = '';
  document.getElementById('custom-food-unit').value = '';
  openCustomFoodModal(); // 刷新列表
  renderFoodGrid();      // 同步刷新常用食物网格
  showToast(name + ' 已添加到自定义食物');
}

function removeCustomFoodItem(key) {
  if (!confirm('确定删除这个自定义食物吗？')) return;
  removeCustomFood(key);
  openCustomFoodModal();
  renderFoodGrid();
}

// ========== 运动记录弹窗 ==========
function openExerciseModal() {
  selectedExercise = null;
  document.getElementById('exercise-duration').value = '30';
  document.querySelectorAll('#exercise-grid .exercise-item').forEach(el => el.classList.remove('selected'));
  renderCustomExerciseGrid();
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

// ========== 杀局弹窗：夫妻减肥PK ==========
// 体重变化分级判定
function getWeightCategory(diff) {
  if (diff === null || diff === undefined) return null;
  if (diff >= 1.0) return 'bigUp';
  if (diff > 0.3) return 'smallUp';
  if (diff >= -0.3) return 'flat';
  if (diff >= -1.0) return 'smallDown';
  return 'bigDown';
}

// 胜负判定：赢=1, 输=-1, 平=0
function duelResult(myDiff, partnerDiff) {
  if (myDiff === null || partnerDiff === null) return 0;
  if (myDiff < partnerDiff) return 1;
  if (myDiff > partnerDiff) return -1;
  return 0;
}

// 时段判定
function getTimePeriod() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

// 21种组合模板表
// 格式: {myCat}_{partnerCat}_{result} → [morning, afternoon, evening] 或字符串
const KILL_DUEL_TEXTS = {
  'bigDown_bigDown_win': { morning: '减脂卷王就是你，稳住节奏别被反超！', afternoon: '保持自律，继续拉开和伴侣的差距！', evening: '减重碾压队友，再接再厉守住第一名！' },
  'bigDown_bigDown_lose': { morning: '被伴侣卷赢了，今天多运动追进度！', afternoon: '戒掉奶茶零食，抓紧缩小差距！', evening: '今日落败，明天严格控饮食争取翻盘！' },
  'bigDown_bigDown_draw': '双人同步猛掉秤，一起坚持自律！',

  'bigDown_smallDown_win': { morning: '减脂完胜伴侣，千万别偷懒松懈！', afternoon: '坚持低卡饮食，继续扩大领先优势！', evening: '减重优势拉满，继续保持优秀状态！' },
  'bigDown_flat_win': { morning: '你断层式掉秤，伴侣原地踏步，守住自律！', afternoon: '拒绝加餐，维持你的领先地位！', evening: '你的减脂效果拉满，继续坚持别松懈！' },
  'bigDown_smallUp_win': { morning: '今日减脂冠军就是你，稳住别反弹！', afternoon: '清淡饮食，牢牢守住领先优势！', evening: '你顺利掉秤对方涨重，再接再厉！' },
  'bigDown_bigUp_win': { morning: '自律封神完胜对方，千万不能松懈！', afternoon: '坚持运动饮食管控，继续拉开差距！', evening: '遥遥领先队友，保持自律稳住第一！' },

  'smallDown_bigDown_lose': { morning: '被伴侣狠狠内卷，抓紧运动追赶进度！', afternoon: '戒掉零食，努力缩小减重差距！', evening: '今日进度落后，明天一定要反超！' },
  'smallDown_smallDown_win': { morning: '细微优势在手，管住嘴拉大差距！', afternoon: '细微优势在手，管住嘴拉大差距！', evening: '细微优势在手，管住嘴拉大差距！' },
  'smallDown_smallDown_lose': { morning: '小幅落败，加大运动量下周翻盘！', afternoon: '小幅落败，加大运动量下周翻盘！', evening: '小幅落败，加大运动量下周翻盘！' },
  'smallDown_smallDown_draw': '两人稳步变瘦，互相监督共同进步！',
  'smallDown_flat_win': { morning: '稳步掉秤小赢一局，继续保持！', afternoon: '拒绝高热量零食，别丢掉领先优势！', evening: '小有减重优势，坚持下去效果会更好！' },
  'smallDown_smallUp_win': { morning: '顺利拿下今日减脂对局，稳住节奏！', afternoon: '饭后散步，持续维持减重优势！', evening: '今日成功胜出，继续坚持自律习惯！' },
  'smallDown_bigUp_win': { morning: '减脂完胜对方，杜绝夜宵重油食物！', afternoon: '守住减重成果，别让优势消失！', evening: '顺利拿下今日对局，再接再厉！' },

  'flat_bigDown_lose': { morning: '伴侣狂掉秤你停滞，抓紧运动追赶！', afternoon: '少吃加餐，尽快缩小巨大差距！', evening: '彻底落后队友，明日全力发力反超！' },
  'flat_smallDown_lose': { morning: '别人都在瘦就你停滞，赶紧动起来！', afternoon: '选择低卡饮食，努力跟上队友节奏！', evening: '今日落败，双人互相监督争取翻盘！' },
  'flat_flat_draw': '双人进入平台期，一起加练打破体重瓶颈！',
  'flat_smallUp_win': { morning: '守住体重没上涨，清淡饮食稳住优势！', afternoon: '小幅领先，拒绝一切额外加餐！', evening: '体重平稳取胜，继续保持健康饮食习惯！' },
  'flat_bigUp_win': { morning: '稳稳守住体重优势，别乱吃导致反弹！', afternoon: '对方热量严重超标，你继续保持自律！', evening: '今日减脂成功胜出，再接再厉！' },

  'smallUp_bigDown_lose': { morning: '队友疯狂掉秤你长胖，严格控卡追赶！', afternoon: '戒掉所有零食奶茶，拼命缩小差距！', evening: '差距悬殊，明天一定要全力翻盘！' },
  'smallUp_smallDown_lose': { morning: '伴侣变瘦你长胖，今天多运动消耗热量！', afternoon: '拒绝加餐，努力内卷追上队友进度！', evening: '今日遗憾落败，清淡饮食准备翻盘！' },
  'smallUp_flat_lose': { morning: '伴侣稳住体重你长胖，一定要管住嘴！', afternoon: '饭后出门散步，避免热量持续堆积！', evening: '今日落于下风，争取明天把涨的体重减回去！' },
  'smallUp_smallUp_win': { morning: '小幅取胜，今天少吃碳水夜宵！', afternoon: '小幅取胜，今天少吃碳水夜宵！', evening: '小幅取胜，今天少吃碳水夜宵！' },
  'smallUp_smallUp_lose': { morning: '今日落败，必须比伴侣更自律！', afternoon: '今日落败，必须比伴侣更自律！', evening: '今日落败，必须比伴侣更自律！' },
  'smallUp_smallUp_draw': '两人都要管控饮食，一起控制体重！',
  'smallUp_bigUp_win': { morning: '涨幅远低于伴侣，管住嘴守住小优势！', afternoon: '远离高热量食物，避免体重继续上涨！', evening: '小幅取胜，双人一起开启减脂计划！' },

  'bigUp_bigDown_lose': { morning: '复刻伴侣的减脂食谱，抓紧追赶进度！', afternoon: '停掉所有零食奶茶，加大每日运动量！', evening: '大幅落后队友，靠自律实现逆风翻盘！' },
  'bigUp_smallDown_lose': { morning: '复刻伴侣的减脂食谱，抓紧追赶进度！', afternoon: '停掉所有零食奶茶，加大每日运动量！', evening: '大幅落后队友，靠自律实现逆风翻盘！' },
  'bigUp_flat_lose': { morning: '复刻伴侣的减脂食谱，抓紧追赶进度！', afternoon: '停掉所有零食奶茶，加大每日运动量！', evening: '大幅落后队友，靠自律实现逆风翻盘！' },
  'bigUp_smallUp_lose': { morning: '复刻伴侣的减脂食谱，抓紧追赶进度！', afternoon: '停掉所有零食奶茶，加大每日运动量！', evening: '大幅落后队友，靠自律实现逆风翻盘！' },
  'bigUp_bigUp_draw': '两人都要管控饮食，一起控制体重！',
  'bigUp_bigUp_lose': { morning: '今日落败，必须比伴侣更自律！', afternoon: '今日落败，必须比伴侣更自律！', evening: '今日落败，必须比伴侣更自律！' },
  'bigUp_bigUp_win': { morning: '涨幅远低于伴侣，管住嘴守住小优势！', afternoon: '远离高热量食物，避免体重继续上涨！', evening: '小幅取胜，双人一起开启减脂计划！' },

  // 补充对称情况——大幅上涨对大幅下降（输方文案已在上面）
  'bigDown_bigDown_all': '双人同步猛掉秤，一起坚持自律！',
};

function getKillDuelText(myDiff, partnerDiff) {
  const myCat = getWeightCategory(myDiff);
  const partnerCat = getWeightCategory(partnerDiff);
  if (!myCat || !partnerCat) return null;

  const result = duelResult(myDiff, partnerDiff);
  const resultKey = result === 1 ? 'win' : result === -1 ? 'lose' : 'draw';
  const period = getTimePeriod();
  const key = `${myCat}_${partnerCat}_${resultKey}`;

  let template = KILL_DUEL_TEXTS[key];
  if (!template) return null;

  if (typeof template === 'object' && !Array.isArray(template)) {
    return template[period] || template['morning'];
  }
  return template;
}

function showKillDuelPopup() {
  const myDiff = getWeightChange(currentRole);
  const partnerRole = currentRole === 'husband' ? 'wife' : 'husband';
  const partnerDiff = getWeightChange(partnerRole);
  if (myDiff === null || partnerDiff === null) return;

  // 从今日记录中读取当前体重
  const data = loadData();
  const dt = today();
  const todayWeight = (data.records[dt] && data.records[dt][currentRole]) ? data.records[dt][currentRole].weight : null;
  const currentWeight = todayWeight !== null && todayWeight !== undefined ? todayWeight.toFixed(1) : '--';
  const diffSign = myDiff > 0 ? '+' : '';
  const diffText = diffSign + myDiff.toFixed(1);
  const bodyText = getKillDuelText(myDiff, partnerDiff);
  if (!bodyText) return;

  document.getElementById('kill-duel-header-weight').textContent = currentWeight + ' kg';
  document.getElementById('kill-duel-header-diff').textContent = diffText + ' kg';
  document.getElementById('kill-duel-body').textContent = bodyText;
  document.getElementById('kill-duel-nick-left').textContent = getDisplayName('husband');
  document.getElementById('kill-duel-nick-right').textContent = getDisplayName('wife');

  // 胜负视觉
  const result = duelResult(myDiff, partnerDiff);
  const card = document.getElementById('modal-kill-duel');
  const rankEl = document.getElementById('kill-duel-rank');
  card.classList.remove('duel-win', 'duel-lose', 'duel-draw');
  rankEl.textContent = '';
  if (result === 1) { card.classList.add('duel-win'); rankEl.textContent = '🏆 恭喜你赢了！'; }
  else if (result === -1) { card.classList.add('duel-lose'); rankEl.textContent = '💪 今日惜败，明天再战！'; }
  else { card.classList.add('duel-draw'); rankEl.textContent = '🤝 难分伯仲，继续加油！'; }

  openModal('modal-kill-duel');
  markKillDuelShown(currentRole);
}

function checkKillDuelPopup() {
  if (!currentRole) return;
  if (getKillDuelShown(currentRole)) return;
  if (!hasWeightRecordToday(currentRole)) return;
  const partnerRole = currentRole === 'husband' ? 'wife' : 'husband';
  if (!hasWeightRecordToday(partnerRole)) return;
  showKillDuelPopup();
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

  // 自律大PK卡片
  renderPkCard();
  renderPkHistoryInline();
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

// ========== PK模块 ==========

let pkDuration = 7;
let pkItems = ["score"];

function selectPkDuration(days, btn) {
  pkDuration = days;
  document.querySelectorAll('.pk-dur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function updatePkStartBtn() {
  const scoreChecked = document.getElementById('pk-item-score').checked;
  const weightChecked = document.getElementById('pk-item-weight').checked;
  const btn = document.getElementById('pk-start-btn');
  btn.disabled = !scoreChecked && !weightChecked;
}

function openPkStartModal() {
  const active = getActivePkRound();
  if (active) { showToast('已有进行中的PK，请等待结束后再发起'); return; }
  document.getElementById('pk-start-date').value = today();
  document.getElementById('pk-item-score').checked = true;
  document.getElementById('pk-item-weight').checked = false;
  document.querySelectorAll('.pk-dur-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.pk-dur-btn[data-days="7"]').classList.add('active');
  pkDuration = 7;
  updatePkStartBtn();
  openModal('modal-pk-start');
}

function startPkRound() {
  const scoreChecked = document.getElementById('pk-item-score').checked;
  const weightChecked = document.getElementById('pk-item-weight').checked;
  if (!scoreChecked && !weightChecked) { showToast('请至少选择一项PK'); return; }

  const items = [];
  if (scoreChecked) items.push('score');
  if (weightChecked) items.push('weight');

  const startDate = document.getElementById('pk-start-date').value || today();
  const end = new Date(startDate);
  end.setDate(end.getDate() + pkDuration - 1);
  const endDate = dateStr(end);

  const hStartWt = getWeightForDate(startDate, 'husband');
  const wStartWt = getWeightForDate(startDate, 'wife');
  if (weightChecked && (hStartWt === null || wStartWt === null)) {
    showToast('体重PK需要双方当天都已录入体重');
    return;
  }

  const round = {
    id: 'pk_' + today() + '_' + (getPkRounds().length + 1),
    initiator: currentRole,
    startDate, endDate,
    durationDays: pkDuration,
    items,
    status: 'active',
    startWeight: { husband: hStartWt, wife: wStartWt },
    endWeight: { husband: null, wife: null },
    result: { score: { winner: null, hTotal: 0, wTotal: 0 }, weight: { winner: null, hPct: 0, wPct: 0, hKg: 0, wKg: 0 }, overall: null },
    settlementViewed: false
  };

  savePkRound(round);
  closeModal('modal-pk-start');
  showToast('自律大PK已开启！' + startDate + ' ~ ' + endDate);
  updateAllUI();
}

// 渲染PK卡片（我的页面）
function renderPkCard() {
  const area = document.getElementById('pk-status-area');
  if (!area) return;
  const active = getActivePkRound();
  if (!active) {
    area.innerHTML = '<button class="record-btn" onclick="openPkStartModal()">发起PK</button>';
    return;
  }

  const todayDate = today();
  const start = new Date(active.startDate);
  const end = new Date(active.endDate);
  const totalDays = active.durationDays;
  const elapsed = Math.max(0, Math.min(totalDays, Math.floor((new Date(todayDate) - start) / 86400000) + 1));
  const remaining = Math.max(0, totalDays - elapsed);
  const pct = Math.round(elapsed / totalDays * 100);

  let scoreLead = '', weightLead = '';
  if (active.items.includes('score')) {
    const { hTotal, wTotal } = getPoolScores(active.startDate, todayDate);
    if (hTotal > wTotal) scoreLead = getDisplayName('husband') + ' 领先 (' + hTotal + ' vs ' + wTotal + ')';
    else if (wTotal > hTotal) scoreLead = getDisplayName('wife') + ' 领先 (' + wTotal + ' vs ' + hTotal + ')';
    else scoreLead = '暂时持平 (' + hTotal + ' vs ' + wTotal + ')';
  }
  if (active.items.includes('weight')) {
    const hWt = getWeightForDate(todayDate, 'husband');
    const wWt = getWeightForDate(todayDate, 'wife');
    if (hWt !== null && wWt !== null && active.startWeight.husband && active.startWeight.wife) {
      const hPct = calcWeightPct(active.startWeight.husband, hWt);
      const wPct = calcWeightPct(active.startWeight.wife, wWt);
      if (hPct > wPct) weightLead = getDisplayName('husband') + ' ' + active.startWeight.husband + '→' + hWt + 'kg（' + formatWeightPct(hPct) + '）';
      else if (wPct > hPct) weightLead = getDisplayName('wife') + ' ' + active.startWeight.wife + '→' + wWt + 'kg（' + formatWeightPct(wPct) + '）';
      else weightLead = '持平（' + active.startWeight.husband + '→' + hWt + 'kg, ' + active.startWeight.wife + '→' + wWt + 'kg）';
    } else {
      weightLead = '等待体重录入';
    }
  }

  const itemsLabel = active.items.includes('score') && active.items.includes('weight') ? '积分+体重' :
    active.items.includes('score') ? '积分' : '体重';

  area.innerHTML =
    '<div class="pk-active-card">' +
      '<div class="pk-active-header">' +
        '<span class="pk-active-badge">进行中</span>' +
        '<span class="pk-active-items">' + itemsLabel + 'PK</span>' +
        '<span class="pk-active-remain">剩余 ' + remaining + ' 天</span>' +
      '</div>' +
      '<div class="pk-active-period">' + active.startDate + ' ~ ' + active.endDate + '</div>' +
      '<div class="pk-progress"><div class="pk-progress-fill" style="width:' + pct + '%"></div></div>' +
      (scoreLead ? '<div class="pk-lead-row"><span class="pk-lead-label">积分：</span>' + scoreLead + '</div>' : '') +
      (weightLead ? '<div class="pk-lead-row"><span class="pk-lead-label">体重：</span>' + weightLead + '</div>' : '') +
      '<div class="pk-formula-note" style="margin-top:8px;">体重按下降百分比换算</div>' +
      '<div style="text-align:center;margin-top:12px;"><a href="javascript:void(0)" style="color:var(--text-muted);font-size:13px;text-decoration:none;" onclick="cancelActivePk()">取消本次PK</a></div>' +
    '</div>';
}

let _cancelPkTargetId = null;

function cancelActivePk() {
  const active = getActivePkRound();
  if (!active) return;
  _cancelPkTargetId = active.id;
  document.getElementById('cancel-pk-desc').textContent = active.startDate + ' ~ ' + active.endDate;
  openModal('modal-cancel-pk');
}

function confirmCancelPk() {
  if (!_cancelPkTargetId) return;
  cancelPkRound(_cancelPkTargetId);
  _cancelPkTargetId = null;
  closeModal('modal-cancel-pk');
  updateAllUI();
  showToast('PK已取消');
}

// 结算弹窗渲染
function renderSettlePopup(round) {
  const body = document.getElementById('pk-settle-body');
  if (!body) return;
  const r = round.result;
  const items = round.items;
  const hasScore = items.includes('score');
  const hasWeight = items.includes('weight');
  const isFull = hasScore && hasWeight;

  let html = '<div class="pk-settle-period">' + round.startDate + ' ~ ' + round.endDate + '</div>';

  if (r.overall === 'tie') {
    html += '<div class="pk-settle-title tie">🤝 难分伯仲！</div>';
  } else if (isFull && ((r.overall === 'husband' && r.score.winner === 'husband' && r.weight.winner === 'husband') || (r.overall === 'wife' && r.score.winner === 'wife' && r.weight.winner === 'wife'))) {
    html += '<div class="pk-settle-title win">🏆 ' + getDisplayName(r.overall) + ' 完胜！</div>';
  } else if (r.overall !== 'tie') {
    html += '<div class="pk-settle-title win">🏆 ' + getDisplayName(r.overall) + ' 胜出！</div>';
  }

  if (hasScore && r.score) {
    html += '<div class="pk-settle-item"><span class="pk-settle-label">积分</span>';
    if (r.score.winner) {
      html += '<span class="pk-settle-val">' + getDisplayName(r.score.winner) + '胜 ' + r.score.hTotal + ' vs ' + r.score.wTotal + '</span>';
    } else {
      html += '<span class="pk-settle-val">平局 ' + r.score.hTotal + ' vs ' + r.score.wTotal + '</span>';
    }
    html += '</div>';
  }

  if (hasWeight && r.weight) {
    html += '<div class="pk-settle-item"><span class="pk-settle-label">体重</span>';
    if (r.weight.winner) {
      html += '<span class="pk-settle-val">' + getDisplayName(r.weight.winner) + '胜 (' + getDisplayName('husband') + ' ' + formatWeightPct(r.weight.hPct) + ', ' + getDisplayName('wife') + ' ' + formatWeightPct(r.weight.wPct) + ')</span>';
    } else {
      html += '<span class="pk-settle-val">平局</span>';
    }
    html += '</div>';
    html += '<div class="pk-settle-note">' +
      getDisplayName('husband') + '：' + round.startWeight.husband + '→' + (round.endWeight.husband || '--') + 'kg，' + formatWeightPct(r.weight.hPct) + '<br>' +
      getDisplayName('wife') + '：' + round.startWeight.wife + '→' + (round.endWeight.wife || '--') + 'kg，' + formatWeightPct(r.weight.wPct) + '<br>' +
      '体重按下降百分比换算：(期初−期末)÷期初×100%</div>';
  }

  if (isFull) {
    const hWins = (r.score.winner === 'husband' ? 1 : 0) + (r.weight.winner === 'husband' ? 1 : 0);
    const wWins = (r.score.winner === 'wife' ? 1 : 0) + (r.weight.winner === 'wife' ? 1 : 0);
    html += '<div class="pk-settle-overall">综合：' + hWins + ' : ' + wWins + '</div>';
  }

  html += '<button class="modal-btn" style="margin-top:16px;width:100%;" onclick="closePkSettle()">知道了</button>';
  body.innerHTML = html;
}

function closePkSettle() {
  closeModal('modal-pk-settle');
  const rounds = getPkRounds();
  rounds.forEach(r => {
    if (r.status === 'completed' && !r.settlementViewed) {
      updatePkRound(r.id, { settlementViewed: true });
    }
  });
}

function renderPkHistoryInline() {
  const el = document.getElementById('pk-history-inline');
  if (!el) return;
  const rounds = getPkRounds().filter(r => r.status === 'completed');
  if (rounds.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无已完成的PK记录</div>';
    return;
  }
  // 最近3条
  const recent = [...rounds].reverse().slice(0, 3);
  el.innerHTML = recent.map(r => {
    const rw = r.result;
    const hName = getDisplayName('husband');
    const wName = getDisplayName('wife');
    let detail = '';
    if (r.items.includes('score') && rw.score) {
      detail += hName + ' ' + rw.score.hTotal + ' : ' + wName + ' ' + rw.score.wTotal;
    }
    if (r.items.includes('weight') && rw.weight) {
      if (detail) detail += '　';
      detail += hName + ' ↓' + rw.weight.hPct.toFixed(1) + '% : ' + wName + ' ↓' + rw.weight.wPct.toFixed(1) + '%';
    }
    let badge = '';
    if (rw.overall === 'tie') badge = '<span style="color:#999;">平局</span>';
    else badge = '<span style="color:var(--blue-deep);">' + getDisplayName(rw.overall) + '胜</span>';
    return '<div class="pk-inline-item" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;">' +
      '<span style="color:var(--text-muted);">' + r.startDate + '~' + r.endDate + '</span>' +
      '<span style="flex:1;margin:0 8px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + detail + '</span>' +
      badge +
      '</div>';
  }).join('');
}

function showPkHistory() {
  const rounds = getPkRounds().filter(r => r.status === 'completed');
  const list = document.getElementById('pk-history-list');
  if (rounds.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">暂无PK记录</div>';
  } else {
    list.innerHTML = rounds.reverse().map(r => renderHistoryItem(r)).join('');
  }
  openModal('modal-pk-history');
}

function renderHistoryItem(round) {
  const r = round.result;
  const itemsLabel = round.items.includes('score') && round.items.includes('weight') ? '积分+体重' :
    round.items.includes('score') ? '积分' : '体重';
  let winnerText = '';
  if (r.overall === 'tie') winnerText = '平局';
  else winnerText = getDisplayName(r.overall) + '胜';

  let html = '<div class="pk-history-item">' +
    '<div class="pk-history-top">' +
      '<span class="pk-history-period">' + round.startDate + ' ~ ' + round.endDate + '</span>' +
      '<span class="pk-history-items">' + itemsLabel + '</span>' +
      '<span class="pk-history-winner">' + winnerText + '</span>' +
    '</div>';

  html += '<div class="pk-history-detail">';
  if (round.items.includes('score') && r.score) {
    html += '<div>积分：' + getDisplayName('husband') + ' ' + r.score.hTotal + ' vs ' + getDisplayName('wife') + ' ' + r.score.wTotal;
    if (r.score.winner) html += '（' + getDisplayName(r.score.winner) + '胜）';
    html += '</div>';
  }
  if (round.items.includes('weight') && r.weight) {
    html += '<div>体重：' + getDisplayName('husband') + ' ' + round.startWeight.husband + '→' + round.endWeight.husband + 'kg（' + formatWeightPct(r.weight.hPct) + '） vs ' + getDisplayName('wife') + ' ' + round.startWeight.wife + '→' + round.endWeight.wife + 'kg（' + formatWeightPct(r.weight.wPct) + '）';
    if (r.weight.winner) html += '（' + getDisplayName(r.weight.winner) + '胜）';
    html += '</div>';
  }
  html += '</div></div>';
  return html;
}

function checkPkAutoSettle() {
  const rounds = getPkRounds();
  const todayDate = today();
  let needsSettle = false;

  rounds.forEach(r => {
    if (r.status === 'active' && r.endDate < todayDate) {
      settlePkRound(r);
      needsSettle = true;
    }
  });

  if (needsSettle) {
    const unsettled = getPkRounds().find(r => r.status === 'completed' && !r.settlementViewed);
    if (unsettled) {
      renderSettlePopup(unsettled);
      openModal('modal-pk-settle');
    }
  }
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

// ========== 饮水统计渲染 ==========
const WATER_TARGET = 1500; // ml
let waterBallAnimFrame = null;

function renderWaterStats() {
  const card = document.getElementById('water-stats-card');
  if (!card) return;

  // 更新名称
  document.getElementById('water-ball-name-h').textContent = getDisplayName('husband');
  document.getElementById('water-ball-name-w').textContent = getDisplayName('wife');
  document.getElementById('wh-th-h').textContent = getDisplayName('husband');
  document.getElementById('wh-th-w').textContent = getDisplayName('wife');

  // 今日饮水数据
  const today = new Date().toISOString().slice(0, 10);
  const hStats = calcTodayStats(today, 'husband');
  const wStats = calcTodayStats(today, 'wife');
  const hWater = hStats.waterTotal || 0;
  const wWater = wStats.waterTotal || 0;

  // 水球渲染
  if (waterBallAnimFrame) cancelAnimationFrame(waterBallAnimFrame);
  const cH = document.getElementById('water-ball-h');
  const cW = document.getElementById('water-ball-w');
  if (cH && cW) {
    const ctxH = cH.getContext('2d');
    const ctxW = cW.getContext('2d');
    drawWaterBalls(ctxH, hWater, ctxW, wWater);
  }

  // 文字标注
  document.getElementById('water-ball-text-h').textContent =
    hWater + '/' + WATER_TARGET + ' ml (' + Math.round(hWater / WATER_TARGET * 100) + '%)';
  document.getElementById('water-ball-text-w').textContent =
    wWater + '/' + WATER_TARGET + ' ml (' + Math.round(wWater / WATER_TARGET * 100) + '%)';

  // 历史记录
  renderWaterHistory();
}

function drawWaterBalls(ctxH, hWater, ctxW, wWater) {
  const SIZE = 130;
  const PADDING = 8;
  const r = SIZE / 2 - PADDING;
  const cx = SIZE / 2, cy = SIZE / 2;
  let phase = 0;

  // 预生成气泡池（每个水球独立一份）
  function makeBubbles() {
    const arr = [];
    for (let i = 0; i < 14; i++) {
      arr.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.15 + Math.random() * 0.73,
        radius: 1.0 + Math.random() * 1.6,
        speed: 0.25 + Math.random() * 0.55,
        baseProgress: Math.random(),
        opacity: 0.12 + Math.random() * 0.28
      });
    }
    return arr;
  }
  const bubblesH = makeBubbles();
  const bubblesW = makeBubbles();

  function drawOne(ctx, waterMl, bubbles) {
    const ratio = Math.min(1, waterMl / WATER_TARGET);
    ctx.clearRect(0, 0, SIZE, SIZE);

    // ═══════════════════════════════════════
    // Layer 1：玻璃球体背景（径向渐变）
    // ═══════════════════════════════════════
    const bgGrad = ctx.createRadialGradient(
      cx - r * 0.25, cy - r * 0.35, r * 0.05,
      cx, cy, r
    );
    bgGrad.addColorStop(0, '#F8FCFF');
    bgGrad.addColorStop(0.35, '#ECF5FC');
    bgGrad.addColorStop(0.7, '#D6EAF8');
    bgGrad.addColorStop(1, '#BDD8EB');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // ═══════════════════════════════════════
    // Layer 2：水体（clip 区域内）
    // ═══════════════════════════════════════
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const waterTop = cy + r - ratio * r * 2;

    if (ratio > 0) {
      // 波浪幅度：达标时更大
      const amp = ratio >= 1 ? 4.2 : (ratio > 0.7 ? 3.4 : (ratio > 0.3 ? 3.0 : 2.7));

      // 三正弦叠加波浪路径
      ctx.beginPath();
      ctx.moveTo(cx - r, waterTop);
      const step = 2;
      for (let x = cx - r; x <= cx + r; x += step) {
        const y = waterTop
          + Math.sin((x + phase) * 0.05) * amp
          + Math.sin((x + phase * 0.7) * 0.08) * amp * 0.6
          + Math.sin((x - phase * 0.4) * 0.12) * amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cx + r, cy + r);
      ctx.lineTo(cx - r, cy + r);
      ctx.closePath();

      // 水体渐变：浅蓝 → 中蓝 → 深蓝
      const waterGrad = ctx.createLinearGradient(0, waterTop - 19, 0, cy + r);
      waterGrad.addColorStop(0, '#B3E5FC');
      waterGrad.addColorStop(0.12, '#81D4FA');
      waterGrad.addColorStop(0.45, '#29B6F6');
      waterGrad.addColorStop(0.75, '#0288D1');
      waterGrad.addColorStop(1, '#01579B');
      ctx.fillStyle = waterGrad;
      ctx.fill();

      // 水面反光——白色泡沫边
      ctx.beginPath();
      ctx.moveTo(cx - r, waterTop - 1);
      for (let x = cx - r; x <= cx + r; x += step) {
        const y = waterTop - 1
          + Math.sin((x + phase) * 0.05) * amp
          + Math.sin((x + phase * 0.7) * 0.08) * amp * 0.6
          + Math.sin((x - phase * 0.4) * 0.12) * amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // 次反光线（稍低）
      ctx.beginPath();
      ctx.moveTo(cx - r, waterTop + 4);
      for (let x = cx - r; x <= cx + r; x += step) {
        const y = waterTop + 4
          + Math.sin((x + phase) * 0.05) * amp * 0.75
          + Math.sin((x + phase * 0.7) * 0.08) * amp * 0.45
          + Math.sin((x - phase * 0.4) * 0.12) * amp * 0.2;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 水面下方水平反光带（模拟水内散射）
      if (ratio > 0.2) {
        const reflY = waterTop + 9;
        ctx.beginPath();
        ctx.moveTo(cx - r, reflY);
        for (let x = cx - r; x <= cx + r; x += step) {
          const y = reflY
            + Math.sin((x + phase) * 0.05) * amp * 0.5
            + Math.sin((x + phase * 0.7) * 0.08) * amp * 0.3;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 气泡粒子
      for (const b of bubbles) {
        const progress = ((phase * b.speed * 0.003 + b.baseProgress) % 1 + 1) % 1;
        const bubbleY = cy + r - 2 - progress * (cy + r - waterTop + 4);
        const bx = cx + Math.cos(b.angle) * b.dist * r;
        if (bubbleY > waterTop + b.radius && bubbleY < cy + r - b.radius) {
          // 气泡主体
          ctx.beginPath();
          ctx.arc(bx, bubbleY, b.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${b.opacity})`;
          ctx.fill();
          // 气泡高光
          ctx.beginPath();
          ctx.arc(bx - b.radius * 0.3, bubbleY - b.radius * 0.35, b.radius * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fill();
        }
      }
    }

    ctx.restore();

    // ═══════════════════════════════════════
    // Layer 3：底部暗面 / 内阴影
    // ═══════════════════════════════════════
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const isGrad = ctx.createRadialGradient(
      cx, cy + r * 0.65, r * 0.25,
      cx, cy + r * 0.55, r * 1.05
    );
    isGrad.addColorStop(0, 'rgba(0,0,0,0)');
    isGrad.addColorStop(0.6, 'rgba(0,20,40,0.04)');
    isGrad.addColorStop(1, 'rgba(0,20,40,0.12)');
    ctx.fillStyle = isGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    // ═══════════════════════════════════════
    // Layer 4：高光反射（左上角）
    // ═══════════════════════════════════════
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // 主高光椭圆
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.33, cy - r * 0.38, r * 0.38, r * 0.16, -Math.PI / 7, 0, Math.PI * 2);
    const hlGrad = ctx.createRadialGradient(
      cx - r * 0.33, cy - r * 0.38, r * 0.02,
      cx - r * 0.3, cy - r * 0.3, r * 0.4
    );
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    hlGrad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    hlGrad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGrad;
    ctx.fill();

    // 副高光小点
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.48, cy - r * 0.52, r * 0.1, r * 0.05, -Math.PI / 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();

    ctx.restore();

    // ═══════════════════════════════════════
    // Layer 5：球体边缘描边
    // ═══════════════════════════════════════
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160,190,210,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 外圈微光
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(190,210,230,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ═══════════════════════════════════════
    // Layer 6：中心百分比文字
    // ═══════════════════════════════════════
    const pct = Math.round(ratio * 100);
    const isOverWater = ratio > 0.45;
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = isOverWater ? '#FFFFFF' : '#2C5F7C';
    ctx.font = '300 22px "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Helvetica Neue Light", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pct + '%', cx, cy);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // 100% 达标 ✓
    if (ratio >= 1) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '300 13px "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Helvetica Neue Light", sans-serif';
      ctx.fillText('✓', cx, cy + 23);
    }
  }

  function frame() {
    drawOne(ctxH, hWater, bubblesH);
    drawOne(ctxW, wWater, bubblesW);
    phase += 0.7;
    waterBallAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

function renderWaterHistory() {
  const tbody = document.getElementById('water-history-body');
  if (!tbody) return;
  const hData = getRecentDaysData('husband', 7);
  const wData = getRecentDaysData('wife', 7);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().slice(0, 10);
    const dow = weekDays[d.getDay()];

    const hDay = hData.find(r => r.date === ds);
    const wDay = wData.find(r => r.date === ds);
    const hOk = hDay && hDay.waterTotal >= WATER_TARGET;
    const wOk = wDay && wDay.waterTotal >= WATER_TARGET;

    html += '<tr>';
    html += '<td class="wh-date">' + (d.getMonth() + 1) + '/' + d.getDate() + ' 周' + dow + '</td>';
    html += '<td class="wh-mark">' + renderWaterMark(hDay, hOk) + '</td>';
    html += '<td class="wh-mark">' + renderWaterMark(wDay, wOk) + '</td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;
}

function renderWaterMark(dayData, isOk) {
  if (!dayData) return '<span class="wh-na">—</span>';
  const ml = dayData.waterTotal || 0;
  const pct = Math.round(ml / WATER_TARGET * 100);
  const cls = isOk ? 'wh-check' : 'wh-cross';
  const icon = isOk ? '✓' : '✗';
  return '<span class="' + cls + '">' + icon + '</span> <span class="wh-ml">' + ml + 'ml (' + pct + '%)</span>';
}
