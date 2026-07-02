// ========== App Main Logic ==========

let currentUser = null;   // 当前登录账号名（自定义）
let currentRole = null;    // 'husband' 或 'wife'
let isAdmin = false;
let selectedFoods = [];     // [{key, name, calories, quantity, unit}]
let selectedExercise = null;
let recordDate = today();
let recordViewRole = null; // 记录页当前查看的角色，切换后可查看对方历史记录
let mealTab = 'common';    // 'common' | 'manual'
// ========== 日期导航辅助函数 ==========
function getRecordDate() { return recordDate; }

function goToPrevDay() {
  const d = new Date(recordDate);
  d.setDate(d.getDate() - 1);
  recordDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  updateRecordPage();
}

function goToNextDay() {
  const d = new Date(recordDate);
  d.setDate(d.getDate() + 1);
  const t = today();
  const nextDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (nextDate > t) return;
  recordDate = nextDate;
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
  await syncFromServer();
  if (!checkAuth()) return;
  await initMockData();
  await updateAllUI();
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

async function doLogin() {
  const account = document.getElementById('login-account').value.trim();
  const password = document.getElementById('login-password').value;
  if (!account) {
    document.getElementById('login-error').textContent = '请输入账号名';
    return;
  }
  const result = await login(account, password);
  if (result.success) {
    currentUser = account;
    currentRole = result.role;
    isAdmin = result.isAdmin;
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-content').style.display = '';
    await initMockData();
    await updateAllUI();
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

async function confirmFirstTimeSetup() {
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
  await updateAllUI();
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
  // diary tab 不是底部导航项，仅当 tab 是四个主Tab时才激活底部导航
  if (tab !== 'diary') {
    const tabBtn = document.querySelector('.tab-item[data-tab="' + tab + '"]');
    if (tabBtn) tabBtn.classList.add('active');
  }

  // diary 页面隐藏居中「+」按钮和底部导航栏
  var addBtn = document.getElementById('center-add-btn');
  var tabBar = document.querySelector('.tab-bar');
  if (tab === 'diary') {
    if (addBtn) addBtn.style.display = 'none';
    if (tabBar) tabBar.style.display = 'none';
  } else {
    if (addBtn) addBtn.style.display = '';
    if (tabBar) tabBar.style.display = '';
  }

  if (tab === 'home') updateHomePage();
  if (tab === 'record') { recordViewRole = currentRole; updateRecordPage(); }
  if (tab === 'stats') { destroyCharts(); renderAllCharts(); renderWaterStats(); }
  if (tab === 'me') updateMePage();
}

// ========== 全量UI更新 ==========
async function updateAllUI() {
  updateHeader();
  updateHomePage();
  updateRecordPage();
  updateMePage();
  await checkKillDuelPopup();
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
      '<span>得分 ' + stats.score + '</span>' +
      '<button class="diary-entry-btn inline" onclick="openDiaryDetail(\'' + dt + '\', \'' + viewRole + '\')">饮食日记 →</button>';
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
async function confirmDeleteMeal(idx) {
  if (!confirm('确定删除这条饮食记录吗？')) return;
  deleteMeal(today(), currentRole, idx);
  await updateAllUI();
  showToast('已删除');
}

async function confirmDeleteExercise(idx) {
  if (!confirm('确定删除这条运动记录吗？')) return;
  deleteExercise(today(), currentRole, idx);
  await updateAllUI();
  showToast('已删除');
}

async function confirmDeleteWater(idx) {
  if (!confirm('确定删除这条饮水记录吗？')) return;
  deleteWater(getRecordDate(), currentRole, idx);
  await updateAllUI();
  showToast('已删除');
}

async function confirmDeleteWeight() {
  if (!confirm('确定删除今日体重记录吗？')) return;
  deleteWeight(today(), currentRole);
  await updateAllUI();
  showToast('已删除');
}

// ========== 饮食记录弹窗（二段Tab式）==========
function openMealModal() {
  selectedFoods = [];
  mealTab = 'common';

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
async function confirmMeal() {
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
  await updateAllUI();
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

async function confirmExercise() {
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
  await updateAllUI();
}

// ========== 快捷指令回调：解析 URL 参数中的运动数据 ==========
async function initHASync() {
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

  await updateAllUI();
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
async function addWater(ml) {
  window._dataAddWater(today(), currentRole, ml);
  const info = getAccountInfo(currentRole);
  showToast(info.name + ' +' + ml + 'ml');
  await updateAllUI();
}

// ========== 体重记录 ==========
async function recordWeight() {
  const input = document.getElementById('weight-input');
  const val = parseFloat(input.value);
  if (!val || val <= 0) {
    showToast('请输入有效体重');
    return;
  }
  setWeight(getRecordDate(), currentRole, val);
  input.value = '';
  showToast(getDisplayName(currentRole) + ' 体重 ' + val + 'kg 已记录');
  await updateAllUI();
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
        const users = loadUsers() || {};
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

  // 自律大PK卡片
  renderPkCard();
  renderPkHistoryInline();
}

async function saveCalorieBudget() {
  const val = parseInt(document.getElementById('cal-budget-input').value) || 2000;
  updateAccountInfo(currentRole, { dailyCalorieBudget: val });
  showToast('卡路里预算已更新：' + val + ' kcal');
  await updateAllUI();
}

async function saveInitWeight() {
  const val = parseFloat(document.getElementById('init-weight-input').value) || 70;
  updateAccountInfo(currentRole, { initialWeight: val });
  showToast('初始体重已更新：' + val + ' kg');
  await updateAllUI();
}

async function saveTargetWeight() {
  const val = parseFloat(document.getElementById('target-weight-input').value) || 60;
  updateAccountInfo(currentRole, { targetWeight: val });
  showToast('目标体重已更新：' + val + ' kg');
  await updateAllUI();
}

// ========== 昵称编辑 ==========
function openNicknameModal() {
  const currentName = getDisplayName(currentRole);
  document.getElementById('nickname-account-label').textContent = currentName;
  document.getElementById('nickname-input').value = getNickname(currentRole) || '';
  openModal('modal-nickname');
}

async function saveNickname() {
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
  await updateAllUI();
}

function closeNicknameModal() {
  closeModal('modal-nickname');
}

// ========== 账号设置保存（"我的"页面） ==========
async function saveAccountSettings() {
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

  await updateAllUI();
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

async function startPkRound() {
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
  await updateAllUI();
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

async function confirmCancelPk() {
  if (!_cancelPkTargetId) return;
  cancelPkRound(_cancelPkTargetId);
  _cancelPkTargetId = null;
  closeModal('modal-cancel-pk');
  await updateAllUI();
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
async function resetAllData() {
  if (confirm('确定要重置全部数据吗？此操作不可恢复！')) {
    await resetAll();
    await initMockData();
    await updateAllUI();
    destroyCharts();
    renderAllCharts();
    showToast('数据已重置');
  }
}

async function clearDataKeepAccount() {
  if (!confirm('确定要清空运动记录与设置数据吗？\n\n将清除：运动记录、积分、热量/体重设置、昵称、AI配置\n将保留：已注册的账号密码\n\n此操作不可恢复！')) return;
  await clearAllData();
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

// ========== 食物拍照识别面板 ==========
let foodPanelData = null;

const MOCK_FOODS = [
  // === 中餐热菜 ===
  { foodName:'宫保鸡丁', calories:450, carbs:22, protein:32, fat:24, fiber:3, sugar:6, sodium:720, tip:'鸡肉高蛋白低脂肪，但宫保做法油糖偏多，建议搭配清炒蔬菜' },
  { foodName:'清蒸鲈鱼', calories:280, carbs:2, protein:42, fat:12, fiber:0, sugar:1, sodium:380, tip:'清蒸做法锁住营养，鱼肉富含Omega-3，减脂期优选' },
  { foodName:'糖醋排骨', calories:520, carbs:36, protein:26, fat:32, fiber:1, sugar:18, sodium:650, tip:'糖醋汁含糖量高，偶尔解馋即可，不宜常吃' },
  { foodName:'麻婆豆腐', calories:350, carbs:15, protein:20, fat:24, fiber:4, sugar:3, sodium:880, tip:'豆腐是优质植物蛋白来源，但麻婆做法钠含量偏高，注意控盐' },
  { foodName:'西红柿炒蛋', calories:220, carbs:10, protein:14, fat:14, fiber:2, sugar:5, sodium:320, tip:'家常快手菜，番茄红素搭配鸡蛋蛋白，营养全面又低卡' },
  // === 面食主食 ===
  { foodName:'红烧牛肉面', calories:580, carbs:68, protein:32, fat:22, fiber:4, sugar:5, sodium:920, tip:'牛肉补铁补蛋白，面条碳水较高，建议汤少喝以减少钠摄入' },
  { foodName:'蛋炒饭', calories:480, carbs:56, protein:16, fat:22, fiber:2, sugar:3, sodium:560, tip:'炒饭油脂吸收多，热量偏高，搭配一盘青菜更均衡' },
  { foodName:'猪肉白菜饺子(10个)', calories:420, carbs:48, protein:18, fat:18, fiber:3, sugar:4, sodium:610, tip:'饺子荤素搭配合理，蘸醋可延缓血糖上升' },
  { foodName:'炸酱面', calories:610, carbs:75, protein:20, fat:26, fiber:5, sugar:6, sodium:980, tip:'炸酱油脂多、钠含量高，减脂期建议半份即可' },
  // === 饮品 ===
  { foodName:'拿铁咖啡(中杯)', calories:190, carbs:15, protein:8, fat:9, fiber:0, sugar:12, sodium:120, tip:'适量饮用提神醒脑，建议不加糖，可选脱脂奶降低热量' },
  { foodName:'珍珠奶茶(中杯)', calories:380, carbs:58, protein:4, fat:14, fiber:0, sugar:42, sodium:90, tip:'含糖量和热量双高，珍珠本质是淀粉，建议用无糖纯茶替代' },
  { foodName:'鲜榨橙汁(300ml)', calories:135, carbs:31, protein:2, fat:0, fiber:1, sugar:25, sodium:5, tip:'维生素C丰富但果糖浓缩，直接吃橙子更有饱腹感' },
  { foodName:'无糖豆浆(300ml)', calories:90, carbs:6, protein:9, fat:4, fiber:2, sugar:1, sodium:15, tip:'优质植物蛋白，含大豆异黄酮，早餐搭配佳选' },
  // === 水果 ===
  { foodName:'苹果(1个)', calories:95, carbs:25, protein:1, fat:0, fiber:5, sugar:19, sodium:2, tip:'富含果胶和膳食纤维，饱腹感强，适合加餐食用' },
  { foodName:'香蕉(1根)', calories:105, carbs:27, protein:1, fat:0, fiber:3, sugar:14, sodium:1, tip:'运动后补钾首选，天然能量棒，但碳水密度偏高' },
  { foodName:'西瓜(200g)', calories:60, carbs:15, protein:1, fat:0, fiber:1, sugar:12, sodium:2, tip:'水分含量超90%，消暑解渴，但升糖指数较高不宜过量' },
  // === 零食甜点 ===
  { foodName:'巧克力蛋糕(1块)', calories:380, carbs:42, protein:5, fat:23, fiber:2, sugar:32, sodium:180, tip:'精制糖+饱和脂肪双重负担，偶尔犒劳自己一块足矣' },
  { foodName:'香草冰淇淋(1球)', calories:210, carbs:24, protein:3, fat:12, fiber:0, sugar:20, sodium:60, tip:'乳脂含量高，天气热来一球解暑，但控量是关键' },
  { foodName:'原味薯片(50g)', calories:270, carbs:28, protein:3, fat:17, fiber:2, sugar:1, sodium:350, tip:'油炸淀粉+高钠，空热量零食，建议用坚果替代' },
  // === 西餐/快餐 ===
  { foodName:'芝士汉堡', calories:540, carbs:42, protein:28, fat:30, fiber:2, sugar:8, sodium:820, tip:'蛋白质尚可但饱和脂肪和钠超标，去掉芝士和酱料可减约100kcal' },
  { foodName:'意式腊肠披萨(1片)', calories:285, carbs:32, protein:12, fat:13, fiber:2, sugar:4, sodium:650, tip:'单片热量尚可控，但很少有人只吃一片，建议配大份沙拉' },
  { foodName:'凯撒鸡肉沙拉', calories:320, carbs:14, protein:28, fat:18, fiber:5, sugar:3, sodium:560, tip:'鸡肉高蛋白，生菜高纤维，但凯撒酱热量不低，建议酱料减半' },
  // === 早餐 ===
  { foodName:'油条+豆浆', calories:350, carbs:38, protein:12, fat:18, fiber:2, sugar:3, sodium:420, tip:'经典中式早餐，油条油炸热量高，豆浆选无糖更健康' },
  { foodName:'火腿三明治', calories:340, carbs:36, protein:16, fat:16, fiber:3, sugar:5, sodium:680, tip:'碳水蛋白脂肪比例均衡的便携早餐，可选全麦面包增加纤维' },
  { foodName:'煎饼果子', calories:390, carbs:44, protein:14, fat:18, fiber:3, sugar:5, sodium:750, tip:'鸡蛋+薄脆+酱料组合，碳水为主，多加生菜少刷酱更健康' },
];

function openFoodCard() {
  // 打开 AI 食物识别营养卡片页面
  window.location.href = 'food-card.html';
}


// ========== 饮食日记详情 ==========
let diaryCurrentDate = '';
let diaryCurrentRole = '';

function openDiaryDetail(date, account) {
  diaryCurrentDate = date || today();
  diaryCurrentRole = account || currentRole;
  renderDiaryNavBar();
  renderDiaryDetail();
  switchTab('diary');
}

function closeDiaryDetail() {
  switchTab('record');
}

function renderDiaryNavBar() {
  var scroll = document.getElementById('date-nav-scroll');
  if (!scroll) return;

  var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  var dates = [];
  // 正确解析本地时区的日期
  var base = new Date();
  var dateParts = diaryCurrentDate.split('-');
  base.setFullYear(parseInt(dateParts[0]));
  base.setMonth(parseInt(dateParts[1]) - 1);
  base.setDate(parseInt(dateParts[2]));
  base.setHours(0, 0, 0, 0);

  for (var i = -3; i <= 3; i++) {
    var d = new Date(base);
    d.setDate(d.getDate() + i);
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var dow = weekDays[d.getDay()];
    var isToday = ds === today();
    dates.push({ date: ds, dow: dow, day: d.getDate(), isToday: isToday });
  }

  scroll.innerHTML = dates.map(function(item) {
    var isActive = item.date === diaryCurrentDate;
    var cls = 'date-nav-capsule' + (isActive ? ' active' : '');
    var todayTag = item.isToday ? ' (今)' : '';
    return '<button class="' + cls + '" onclick="diarySelectDate(\'' + item.date + '\')">' +
      '<div class="capsule-dow">' + item.dow + todayTag + '</div>' +
      '<div class="capsule-day">' + item.day + '</div>' +
    '</button>';
  }).join('');

  setTimeout(function() {
    var active = scroll.querySelector('.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, 50);
}

function diarySelectDate(date) {
  diaryCurrentDate = date;
  renderDiaryNavBar();
  renderDiaryDetail();
}

function diaryShiftDate(delta) {
  // 正确解析本地时区的日期
  var d = new Date();
  var dateParts = diaryCurrentDate.split('-');
  d.setFullYear(parseInt(dateParts[0]));
  d.setMonth(parseInt(dateParts[1]) - 1);
  d.setDate(parseInt(dateParts[2]));
  d.setHours(0, 0, 0, 0);

  d.setDate(d.getDate() + delta);
  diaryCurrentDate = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  renderDiaryNavBar();
  renderDiaryDetail();
}

function renderDiaryDetail() {
  var headerTitle = document.getElementById('diary-header-title');
  var headerAccount = document.getElementById('diary-header-account');
  var totalCalEl = document.getElementById('diary-total-cal');
  var budgetValEl = document.getElementById('diary-budget-val');
  var remainValEl = document.getElementById('diary-remain-val');
  var remainLabelEl = document.getElementById('diary-remain-label');
  var progressFillEl = document.getElementById('diary-progress-fill');
  var foodListEl = document.getElementById('diary-food-list');

  if (!window.getDiaryByDate) return;

  var data = window.getDiaryByDate(diaryCurrentDate, diaryCurrentRole);
  var accountName = getDisplayName(diaryCurrentRole);

  // 头部日期
  if (headerTitle) {
    // 正确解析本地时区的日期
    var dateParts = diaryCurrentDate.split('-');
    var d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 0, 0, 0, 0);
    var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    headerTitle.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + weekDays[d.getDay()] + (diaryCurrentDate === today() ? ' (今天)' : '');
  }
  if (headerAccount) headerAccount.textContent = accountName;

  // 总热量
  var total = data.totalCalories;
  var budget = data.budget;
  var remain = Math.max(0, budget - total);
  var ratio = budget > 0 ? total / budget : 0;

  if (totalCalEl) totalCalEl.textContent = total;
  if (budgetValEl) budgetValEl.textContent = budget;
  if (remainValEl) remainValEl.textContent = remain;
  if (remainLabelEl) remainLabelEl.textContent = total >= budget ? '已超出' : '剩余';

  // 进度条
  if (progressFillEl) {
    var pct = Math.min(100, ratio * 100);
    progressFillEl.style.width = pct + '%';
    progressFillEl.classList.remove('caution', 'danger');
    if (ratio > 1) progressFillEl.classList.add('danger');
    else if (ratio > 0.8) progressFillEl.classList.add('caution');
  }

  // 食物列表
  if (!foodListEl) return;

  if (data.meals.length === 0) {
    foodListEl.innerHTML = '<div class="diary-food-empty">暂无饮食记录</div>';
    return;
  }

  foodListEl.innerHTML = data.meals.map(function(m, index) {
    var imgSrc = m.imageBase64 || m.processedImage;
    var hasImg = imgSrc && imgSrc.length > 0;

    var nutritionData = m.nutritionInfo ? JSON.stringify(m.nutritionInfo).replace(/"/g, '&quot;') : '';

    var imgHTML = '';
    if (hasImg) {
      imgHTML = '<div class="diary-food-img-wrap" onclick="showMealDetail(' + index + ', \'' + escHtml(m.name) + '\', ' + m.calories + ', \'' + (imgSrc || '') + '\', \'' + nutritionData + '\')">' +
        '<img src="' + imgSrc + '" alt="' + escHtml(m.name) + '" loading="lazy" class="processed">' +
      '</div>';
    }

    return '<div class="diary-food-card' + (hasImg ? '' : ' no-image') + '">' +
      imgHTML +
      '<div class="diary-food-info">' +
        '<div class="diary-food-name">' + escHtml(m.name) + '</div>' +
        '<div class="diary-food-cal"><strong>' + m.calories + '</strong> kcal</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ========== 相机功能 ==========
let currentImageBase64 = null;
let currentProcessedImage = null;
let currentRecognizedData = null;
let currentStickerImage = null;
let isGeneratingSticker = false;

// 打开相机弹窗
function openCameraModal() {
  const overlay = document.getElementById('camera-modal-overlay');
  if (overlay) {
    overlay.classList.add('show');
    resetCamera();
  }
}

// 关闭相机弹窗
function closeCameraModal() {
  const overlay = document.getElementById('camera-modal-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    resetCamera();
  }
}

// 重置相机状态
function resetCamera() {
  currentImageBase64 = null;
  currentProcessedImage = null;
  currentRecognizedData = null;

  // 重置UI
  const choiceArea = document.getElementById('camera-choice-area');
  const processing = document.getElementById('camera-processing');
  const result = document.getElementById('camera-result');
  const fileInput = document.getElementById('camera-file-input');

  if (choiceArea) choiceArea.classList.remove('hidden');
  if (processing) processing.classList.add('hidden');
  if (result) result.classList.add('hidden');
  if (fileInput) fileInput.value = '';

  // 清空表单
  document.getElementById('result-food-name').value = '';
  document.getElementById('result-calories').value = '';
  document.getElementById('result-carbs').value = '';
  document.getElementById('result-protein').value = '';
  document.getElementById('result-fat').value = '';
  document.getElementById('result-fiber').value = '';
}

// 选择拍照
function chooseTakePhoto() {
  const fileInput = document.getElementById('camera-file-input');
  if (fileInput) {
    fileInput.setAttribute('capture', 'environment');
    fileInput.click();
  }
}

// 选择相册
function chooseGallery() {
  const fileInput = document.getElementById('camera-file-input');
  if (fileInput) {
    fileInput.removeAttribute('capture');
    fileInput.click();
  }
}

// 处理选择的文件
async function handleCameraFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    currentImageBase64 = e.target.result;
    await processImage(currentImageBase64);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// 处理图片（抠图 + AI识别 + 异步生成贴纸）
async function processImage(imageBase64) {
  console.log('[相机] 开始处理图片...');
  const totalStart = Date.now();
  const choiceArea = document.getElementById('camera-choice-area');
  const processing = document.getElementById('camera-processing');
  const processingText = document.getElementById('processing-text');

  if (choiceArea) choiceArea.classList.add('hidden');
  if (processing) processing.classList.remove('hidden');

  try {
    // 步骤1：抠图去除背景
    console.log('[相机] 步骤1：抠图去除背景...');
    if (processingText) processingText.textContent = '正在抠图去除背景...';
    const t1 = Date.now();
    const processedImage = await removeBackground(imageBase64);
    currentProcessedImage = processedImage;
    console.log('[相机] 抠图完成，耗时:', (Date.now() - t1) + 'ms');

    // 步骤2：AI识别食物
    console.log('[相机] 步骤2：AI识别食物...');
    if (processingText) processingText.textContent = 'AI 正在识别食物...';
    const t2 = Date.now();
    const recognizedData = await recognizeFood(processedImage);
    currentRecognizedData = recognizedData;
    console.log('[相机] AI识别完成，耗时:', (Date.now() - t2) + 'ms, 结果:', recognizedData);

    // 步骤3：立即显示结果（不等生图）
    console.log('[相机] 显示识别结果...');
    showRecognitionResult(null, { ...recognizedData, isSticker: false });
    console.log('[相机] 识别流程完成，用户可操作，耗时:', (Date.now() - totalStart) + 'ms (约' + ((Date.now() - totalStart)/1000).toFixed(1) + '秒)');

    // 步骤4：后台异步生图（不阻塞用户操作）
    console.log('[相机] 后台异步生成卡通贴纸...');
    generateStickerAsync(processedImage, recognizedData.foodName);

  } catch (error) {
    console.error('[相机] 图片处理失败:', error);
    showToast('识别失败，请重试');
    closeCameraModal();
  }
}

// 后台异步生成贴纸
async function generateStickerAsync(imageBase64, foodName) {
  isGeneratingSticker = true;
  const t0 = Date.now();
  
  // 更新按钮状态提示生图中
  const stickerBtn = document.getElementById('btn-show-sticker');
  if (stickerBtn) stickerBtn.textContent = '卡通贴纸生成中...';
  
  try {
    const stickerImage = await generateSticker(imageBase64, foodName);
    console.log('[相机] 后台生图完成，耗时:', (Date.now() - t0) + 'ms');
    
    if (stickerImage) {
      currentStickerImage = stickerImage;
      
      // 更新UI显示
      const stickerImg = document.getElementById('result-sticker-image');
      const resultImg = document.getElementById('result-food-image');
      const originalBtn = document.getElementById('btn-show-original');
      
      if (stickerImg) {
        stickerImg.src = stickerImage;
        stickerImg.classList.remove('hidden');
      }
      if (resultImg) {
        resultImg.classList.add('hidden');
      }
      if (stickerBtn) {
        stickerBtn.classList.add('active');
        stickerBtn.textContent = '卡通贴纸';
      }
      if (originalBtn) originalBtn.classList.remove('active');
      
      showToast('卡通贴纸已生成');
    } else {
      if (stickerBtn) stickerBtn.textContent = '卡通贴纸';
    }
  } catch (error) {
    console.error('[相机] 后台生图失败:', error);
    if (stickerBtn) stickerBtn.textContent = '卡通贴纸';
  } finally {
    isGeneratingSticker = false;
  }
}

// 抠图去除背景
async function removeBackground(base64Image, noBorder = false) {
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const apiUrl = `${protocol}//${hostname}:3001/api/remove-bg`;

    let imageData = base64Image;
    if (imageData.startsWith('data:')) {
      imageData = imageData.split(',')[1];
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageData, no_border: noBorder })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.image) {
        // 如果返回的数据已经包含前缀，直接返回；否则添加前缀
        if (data.image.startsWith('data:')) {
          return data.image;
        }
        return 'data:image/png;base64,' + data.image;
      }
    }
  } catch (error) {
    console.warn('服务端抠图失败:', error);
  }

  // 兜底：返回原图
  return base64Image;
}

// AI识别食物
async function recognizeFood(imageBase64) {
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const apiUrl = `${protocol}//${hostname}:3001/api/food-recognize`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return data.data;
      }
    }
  } catch (error) {
    console.warn('AI识别失败，使用模拟数据:', error);
  }

  return generateMockFoodData();
}

// 根据食物名称获取营养信息
async function getFoodInfoByName(foodName) {
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const apiUrl = `${protocol}//${hostname}:3001/api/food-info`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foodName: foodName })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return data.data;
      }
    }
  } catch (error) {
    console.warn('获取食物营养信息失败:', error);
  }
  return null;
}

// 生成卡通冰箱贴
async function generateSticker(imageBase64, foodName) {
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const apiUrl = `${protocol}//${hostname}:3001/api/generate-sticker`;

    let imageData = imageBase64;
    if (imageData.startsWith('data:')) {
      imageData = imageData.split(',')[1];
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: imageData,
        foodName: foodName || '美食'
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.image) {
        console.log('[冰箱贴] 生成成功，来源:', data.source);
        return data.image;
      }
    }
  } catch (error) {
    console.warn('[冰箱贴] 生成失败，使用原图:', error);
  }

  // 降级：返回原图
  return null;
}

// 生成本地模拟数据
function generateMockFoodData() {
  const mockFoods = [
    { foodName: '宫保鸡丁', calories: 450, carbs: 25, protein: 30, fat: 28, fiber: 3, sugar: 8, sodium: 1200, tip: '建议搭配蔬菜一起食用，控制油脂摄入' },
    { foodName: '清炒时蔬', calories: 120, carbs: 8, protein: 3, fat: 8, fiber: 4, sugar: 4, sodium: 400, tip: '蔬菜富含维生素，建议每餐都有' },
    { foodName: '红烧肉', calories: 580, carbs: 15, protein: 20, fat: 52, fiber: 1, sugar: 12, sodium: 800, tip: '高脂高热量，建议适量食用' },
    { foodName: '蒸蛋羹', calories: 150, carbs: 5, protein: 12, fat: 10, fiber: 0, sugar: 3, sodium: 300, tip: '优质蛋白来源，适合减脂期' },
    { foodName: '凉拌黄瓜', calories: 60, carbs: 8, protein: 2, fat: 3, fiber: 2, sugar: 4, sodium: 500, tip: '清爽低卡，适合夏季食用' },
    { foodName: '西红柿鸡蛋面', calories: 380, carbs: 55, protein: 15, fat: 12, fiber: 3, sugar: 8, sodium: 900, tip: '主食搭配蛋白质，营养均衡' }
  ];
  return mockFoods[Math.floor(Math.random() * mockFoods.length)];
}

// 显示识别结果
function showRecognitionResult(stickerBase64, data) {
  const processing = document.getElementById('camera-processing');
  const result = document.getElementById('camera-result');

  if (processing) processing.classList.add('hidden');
  if (result) result.classList.remove('hidden');

  // 设置图片 - 原图使用 currentProcessedImage，冰箱贴使用 stickerBase64
  const resultImage = document.getElementById('result-food-image');
  const stickerImage = document.getElementById('result-sticker-image');

  // 设置原图（抠图后的图片）
  if (resultImage && currentProcessedImage) {
    resultImage.src = currentProcessedImage;
  }

  // 判断是否成功生成并处理了冰箱贴
  const hasSticker = !!stickerBase64;

  if (hasSticker && stickerImage) {
    // 显示去除背景后的贴纸
    stickerImage.src = stickerBase64;
    stickerImage.classList.remove('hidden');
    resultImage.classList.add('hidden');

    // 更新按钮状态 - 默认显示贴纸
    document.getElementById('btn-show-original').classList.remove('active');
    document.getElementById('btn-show-sticker').classList.add('active');

    // 保存贴纸图片引用
    currentStickerImage = stickerBase64;
  } else {
    // 没有冰箱贴，只显示原图
    stickerImage.classList.add('hidden');
    resultImage.classList.remove('hidden');

    // 更新按钮状态
    document.getElementById('btn-show-original').classList.add('active');
    document.getElementById('btn-show-sticker').classList.remove('active');

    currentStickerImage = null;
  }

  // 填充数据 - 使用textContent而不是value，因为是contenteditable元素
  const nameEl = document.getElementById('result-food-name');
  const calEl = document.getElementById('result-calories');
  const carbsEl = document.getElementById('result-carbs');
  const proteinEl = document.getElementById('result-protein');
  const fatEl = document.getElementById('result-fat');
  const fiberEl = document.getElementById('result-fiber');
  const sugarEl = document.getElementById('result-sugar');
  const sodiumEl = document.getElementById('result-sodium');
  const tipEl = document.getElementById('result-tip-text');
  const datetimeEl = document.getElementById('result-datetime-text');
  const weightEl = document.getElementById('result-weight');

  if (nameEl) nameEl.textContent = data.foodName || '未知食物';
  if (calEl) calEl.textContent = data.calories || '0';
  if (carbsEl) carbsEl.textContent = data.carbs || '0';
  if (proteinEl) proteinEl.textContent = data.protein || '0';
  if (fatEl) fatEl.textContent = data.fat || '0';
  if (fiberEl) fiberEl.textContent = data.fiber || '0';
  if (sugarEl) sugarEl.textContent = data.sugar || '0';
  if (sodiumEl) sodiumEl.textContent = data.sodium || '0';
  if (weightEl) weightEl.value = data.estimatedWeight || 100;

  // 设置小贴士
  if (tipEl) {
    tipEl.textContent = data.tip || '记得均衡饮食，适量运动';
  }

  // 设置当前日期时间
  if (datetimeEl) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    datetimeEl.textContent = `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  // 设置份量调整监听
  setupWeightChangeListener();

  // 添加食物名称修改监听，自动更新营养信息
  setupFoodNameChangeListener();
}

// 设置食物名称修改监听
function setupFoodNameChangeListener() {
  const nameEl = document.getElementById('result-food-name');
  if (!nameEl) return;

  nameEl.addEventListener('blur', async (e) => {
    const newName = e.target.textContent.trim();
    if (!newName || newName === '未知食物') return;
    if (newName === currentRecognizedData?.foodName) return;

    console.log('[食物名称] 修改为:', newName);
    await updateFoodInfoByNewName(newName);
  });
}

// 设置份量调整监听
function setupWeightChangeListener() {
  const weightEl = document.getElementById('result-weight');
  if (!weightEl) return;

  weightEl.addEventListener('change', (e) => {
    const weight = parseInt(e.target.value) || 100;
    updateNutritionByWeight(weight);
  });

  weightEl.addEventListener('input', (e) => {
    const weight = parseInt(e.target.value) || 100;
    updateNutritionByWeight(weight);
  });
}

// 根据份量更新营养信息
function updateNutritionByWeight(weight) {
  if (!currentRecognizedData) return;

  const data = currentRecognizedData;
  const currentWeight = data.estimatedWeight || 100;
  
  let calsPer100g, carbsPer100g, proteinPer100g, fatPer100g, fiberPer100g, sugarPer100g, sodiumPer100g;
  
  if (data.caloriesPer100g) {
    calsPer100g = data.caloriesPer100g;
    carbsPer100g = data.carbsPer100g || 0;
    proteinPer100g = data.proteinPer100g || 0;
    fatPer100g = data.fatPer100g || 0;
    fiberPer100g = data.fiberPer100g || 0;
    sugarPer100g = data.sugarPer100g || 0;
    sodiumPer100g = data.sodiumPer100g || 0;
  } else {
    const ratio = 100 / currentWeight;
    calsPer100g = Math.round((data.calories || 0) * ratio);
    carbsPer100g = Math.round((data.carbs || 0) * ratio);
    proteinPer100g = Math.round((data.protein || 0) * ratio);
    fatPer100g = Math.round((data.fat || 0) * ratio);
    fiberPer100g = Math.round((data.fiber || 0) * ratio);
    sugarPer100g = Math.round((data.sugar || 0) * ratio);
    sodiumPer100g = Math.round((data.sodium || 0) * ratio);
  }
  
  const newRatio = weight / 100;
  
  const calEl = document.getElementById('result-calories');
  const carbsEl = document.getElementById('result-carbs');
  const proteinEl = document.getElementById('result-protein');
  const fatEl = document.getElementById('result-fat');
  const fiberEl = document.getElementById('result-fiber');
  const sugarEl = document.getElementById('result-sugar');
  const sodiumEl = document.getElementById('result-sodium');

  if (calEl) calEl.textContent = Math.round(calsPer100g * newRatio);
  if (carbsEl) carbsEl.textContent = Math.round(carbsPer100g * newRatio);
  if (proteinEl) proteinEl.textContent = Math.round(proteinPer100g * newRatio);
  if (fatEl) fatEl.textContent = Math.round(fatPer100g * newRatio);
  if (fiberEl) fiberEl.textContent = Math.round(fiberPer100g * newRatio);
  if (sugarEl) sugarEl.textContent = Math.round(sugarPer100g * newRatio);
  if (sodiumEl) sodiumEl.textContent = Math.round(sodiumPer100g * newRatio);
}

// 根据新名称更新营养信息
async function updateFoodInfoByNewName(newName) {
  if (!newName) return;

  const nameEl = document.getElementById('result-food-name');
  if (nameEl) nameEl.style.opacity = '0.6';

  showToast('正在获取营养信息...');

  try {
    const foodInfo = await getFoodInfoByName(newName);
    if (foodInfo) {
      currentRecognizedData = foodInfo;
      console.log('[食物营养] 更新成功:', foodInfo);

      // 更新UI显示
      const calEl = document.getElementById('result-calories');
      const carbsEl = document.getElementById('result-carbs');
      const proteinEl = document.getElementById('result-protein');
      const fatEl = document.getElementById('result-fat');
      const fiberEl = document.getElementById('result-fiber');
      const sugarEl = document.getElementById('result-sugar');
      const sodiumEl = document.getElementById('result-sodium');
      const tipEl = document.getElementById('result-tip-text');

      if (calEl) calEl.textContent = foodInfo.calories || '0';
      if (carbsEl) carbsEl.textContent = foodInfo.carbs || '0';
      if (proteinEl) proteinEl.textContent = foodInfo.protein || '0';
      if (fatEl) fatEl.textContent = foodInfo.fat || '0';
      if (fiberEl) fiberEl.textContent = foodInfo.fiber || '0';
      if (sugarEl) sugarEl.textContent = foodInfo.sugar || '0';
      if (sodiumEl) sodiumEl.textContent = foodInfo.sodium || '0';
      if (tipEl) tipEl.textContent = foodInfo.tip || '记得均衡饮食，适量运动';

      showToast('营养信息已更新');
    }
  } catch (error) {
    console.error('[食物营养] 更新失败:', error);
  } finally {
    if (nameEl) nameEl.style.opacity = '1';
  }
}

// 保存识别的食物
async function saveRecognizedFood() {
  const nameEl = document.getElementById('result-food-name');
  const calEl = document.getElementById('result-calories');
  const carbsEl = document.getElementById('result-carbs');
  const proteinEl = document.getElementById('result-protein');
  const fatEl = document.getElementById('result-fat');
  const fiberEl = document.getElementById('result-fiber');
  const sugarEl = document.getElementById('result-sugar');
  const sodiumEl = document.getElementById('result-sodium');
  const tipEl = document.getElementById('result-tip-text');

  const name = (nameEl?.textContent || '').trim();
  const calories = parseInt(calEl?.textContent || '0') || 0;
  const carbs = parseInt(carbsEl?.textContent || '0') || 0;
  const protein = parseInt(proteinEl?.textContent || '0') || 0;
  const fat = parseInt(fatEl?.textContent || '0') || 0;
  const fiber = parseInt(fiberEl?.textContent || '0') || 0;
  const sugar = parseInt(sugarEl?.textContent || '0') || 0;
  const sodium = parseInt(sodiumEl?.textContent || '0') || 0;
  const tip = tipEl?.textContent || '';

  if (!name || name === '未知食物') {
    showToast('请输入食物名称');
    return;
  }

  if (calories <= 0) {
    showToast('请输入有效的热量');
    return;
  }

  // 生图未完成时提示用户
  if (isGeneratingSticker) {
    const confirmed = confirm('卡通贴纸正在生成中，当前保存将使用原图。是否继续保存？');
    if (!confirmed) return;
  }

  // 添加到今日记录（优先使用卡通贴纸图片）
  const imageToUse = currentStickerImage || currentProcessedImage;

  // 构建完整营养信息
  const nutritionInfo = {
    carbs: carbs,
    protein: protein,
    fat: fat,
    fiber: fiber,
    sugar: sugar,
    sodium: sodium,
    tip: tip
  };

  await addMeal(getRecordDate(), currentRole, null, name, calories, 1, false, imageToUse, nutritionInfo);

  showToast(name + ' 已添加到今日记录');
  closeCameraModal();
  await updateAllUI();

  // 立即更新饮食日记页面
  if (typeof renderDiaryDetail === 'function') {
    renderDiaryDetail();
  }

  // 显示保存后的详情
  setTimeout(() => {
    if (typeof showSavedFoodDetail === 'function') {
      showSavedFoodDetail();
    }
  }, 300);
}

// 切换图片显示（原图/冰箱贴）
function toggleImageDisplay(type) {
  const originalImage = document.getElementById('result-food-image');
  const stickerImage = document.getElementById('result-sticker-image');
  const btnOriginal = document.getElementById('btn-show-original');
  const btnSticker = document.getElementById('btn-show-sticker');

  if (type === 'original') {
    originalImage.classList.remove('hidden');
    stickerImage.classList.add('hidden');
    btnOriginal.classList.add('active');
    btnSticker.classList.remove('active');
  } else if (type === 'sticker') {
    // 检查是否有冰箱贴图片
    if (!currentStickerImage || !stickerImage.src) {
      showToast('卡通贴纸正在生成中，请稍候...');
      return;
    }
    originalImage.classList.add('hidden');
    stickerImage.classList.remove('hidden');
    btnOriginal.classList.remove('active');
    btnSticker.classList.add('active');
  }
}

// 显示食物详情
function showMealDetail(index, name, calories, imageSrc, nutritionDataJson) {
  // 解析营养信息
  let nutrition = null;
  if (nutritionDataJson) {
    try {
      nutrition = JSON.parse(nutritionDataJson.replace(/&quot;/g, '"'));
    } catch (e) {
      console.error('解析营养信息失败:', e);
    }
  }

  // 创建详情弹窗
  const overlay = document.createElement('div');
  overlay.className = 'meal-detail-overlay';
  overlay.innerHTML = `
    <div class="meal-detail-modal">
      <div class="meal-detail-header">
        <span class="meal-detail-title">食物详情</span>
        <button class="meal-detail-close" onclick="this.closest('.meal-detail-overlay').remove()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="meal-detail-content">
        ${imageSrc ? `
          <div class="meal-detail-image">
            <img src="${imageSrc}" alt="${name}">
          </div>
        ` : ''}
        <div class="meal-detail-info">
          <div class="meal-detail-name">${name}</div>
          <div class="meal-detail-calories">${calories} 大卡</div>
        </div>
        ${nutrition ? `
          <div class="meal-detail-nutrition">
            <div class="nutrition-row">
              <span class="nutrition-label">碳水化合物</span>
              <span class="nutrition-value">${nutrition.carbs || 0}g</span>
            </div>
            <div class="nutrition-row">
              <span class="nutrition-label">蛋白质</span>
              <span class="nutrition-value">${nutrition.protein || 0}g</span>
            </div>
            <div class="nutrition-row">
              <span class="nutrition-label">脂肪</span>
              <span class="nutrition-value">${nutrition.fat || 0}g</span>
            </div>
            <div class="nutrition-row">
              <span class="nutrition-label">膳食纤维</span>
              <span class="nutrition-value">${nutrition.fiber || 0}g</span>
            </div>
            ${nutrition.sugar ? `
              <div class="nutrition-row">
                <span class="nutrition-label">糖分</span>
                <span class="nutrition-value">${nutrition.sugar}g</span>
              </div>
            ` : ''}
            ${nutrition.sodium ? `
              <div class="nutrition-row">
                <span class="nutrition-label">钠</span>
                <span class="nutrition-value">${nutrition.sodium}mg</span>
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${nutrition && nutrition.tip ? `
          <div class="meal-detail-tip">
            <span class="tip-icon">💡</span>
            <span class="tip-text">${nutrition.tip}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);
}

// 点击关闭详情弹窗
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('meal-detail-overlay')) {
    e.target.remove();
  }
});


// 显示保存后的食物详情
function showSavedFoodDetail() {
  if (!currentRecognizedData || !currentProcessedImage) return;

  const name = currentRecognizedData.foodName || '未知食物';
  const calories = currentRecognizedData.calories || 0;
  const carbs = currentRecognizedData.carbs || 0;
  const protein = currentRecognizedData.protein || 0;
  const fat = currentRecognizedData.fat || 0;
  const fiber = currentRecognizedData.fiber || 0;
  const sugar = currentRecognizedData.sugar || 0;
  const sodium = currentRecognizedData.sodium || 0;
  const tip = currentRecognizedData.tip || '';
  
  const originalImage = currentProcessedImage;
  const stickerImage = currentStickerImage;

  // 创建详情弹窗
  const overlay = document.createElement('div');
  overlay.className = 'meal-detail-overlay saved-detail-overlay';
  overlay.innerHTML = `
    <div class="meal-detail-modal">
      <div class="meal-detail-header">
        <span class="meal-detail-title">已保存 - ${name}</span>
        <button class="meal-detail-close" onclick="this.closest('.meal-detail-overlay').remove()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="meal-detail-content">
        <div class="saved-images-container">
          <div class="saved-image-item">
            <div class="saved-image-label">原图</div>
            <div class="saved-image-wrapper">
              <img src="${originalImage}" alt="原图">
            </div>
          </div>
          ${stickerImage ? `
            <div class="saved-image-item">
              <div class="saved-image-label">卡通贴纸</div>
              <div class="saved-image-wrapper">
                <img src="${stickerImage}" alt="卡通贴纸">
              </div>
            </div>
          ` : ''}
        </div>
        <div class="meal-detail-info">
          <div class="meal-detail-name">${name}</div>
          <div class="meal-detail-calories">${calories} 大卡</div>
        </div>
        <div class="meal-detail-nutrition">
          <div class="nutrition-row">
            <span class="nutrition-label">碳水化合物</span>
            <span class="nutrition-value">${carbs}g</span>
          </div>
          <div class="nutrition-row">
            <span class="nutrition-label">蛋白质</span>
            <span class="nutrition-value">${protein}g</span>
          </div>
          <div class="nutrition-row">
            <span class="nutrition-label">脂肪</span>
            <span class="nutrition-value">${fat}g</span>
          </div>
          <div class="nutrition-row">
            <span class="nutrition-label">膳食纤维</span>
            <span class="nutrition-value">${fiber}g</span>
          </div>
          ${sugar ? `
            <div class="nutrition-row">
              <span class="nutrition-label">糖分</span>
              <span class="nutrition-value">${sugar}g</span>
            </div>
          ` : ''}
          ${sodium ? `
            <div class="nutrition-row">
              <span class="nutrition-label">钠</span>
              <span class="nutrition-value">${sodium}mg</span>
            </div>
          ` : ''}
        </div>
        ${tip ? `
          <div class="meal-detail-tip">
            <span class="tip-icon">💡</span>
            <span class="tip-text">${tip}</span>
          </div>
        ` : ''}
        <div class="saved-detail-actions">
          <button class="saved-detail-btn" onclick="this.closest('.meal-detail-overlay').remove()">关闭</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);
}
