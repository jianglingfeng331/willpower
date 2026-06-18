// ========== Chart.js Integration — Stats Redesign ==========

let chartInstances = {};
let currentChartPeriod = 'week';

// ─── 颜色体系 ───
const C = {
  husband: '#D4A574',
  husbandLight: 'rgba(212,165,116,0.4)',
  husbandGlow: 'rgba(212,165,116,0.12)',
  wife: '#8B5E3C',
  wifeLight: 'rgba(139,94,60,0.35)',
  wifeGlow: 'rgba(139,94,60,0.10)',
  grid: '#F0EDEA',
  textMuted: '#999999',
};

// ─── Canvas 渐变辅助 ───
function createGradient(ctx, color1, color2) {
  const g = ctx.createLinearGradient(0, 0, 0, 280);
  g.addColorStop(0, color1);
  g.addColorStop(1, color2);
  return g;
}

// ─── 通用 Chart.js 插件：注册渐变（beforeDraw 时填充） ───
const gradientPlugin = {
  id: 'gradientFills',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (ds._gradientTop && ds._gradientBottom && meta.type === 'line') {
        // gradient fill: area from line to bottom
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, ds._gradientTop);
        g.addColorStop(1, ds._gradientBottom);
        ds.backgroundColor = g;
      }
    });
  }
};

// ─── 通用 Chart.js 插件：数据标签（在数据点上方显示数值，无需 hover） ───
const dataLabelPlugin = {
  id: 'dataLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const labelH = 14;
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (!meta.visible) return;
      const color = ds.borderColor || '#666';
      meta.data.forEach((el, j) => {
        const val = ds.data[j];
        if (val === null || val === undefined) return;
        const x = el.x;
        const y = el.y;
        ctx.save();
        ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        // 如果上方空间不足，画在数据点下方
        if (y - labelH - 6 < chartArea.top) {
          ctx.textBaseline = 'top';
          ctx.fillText(val, x, y + 8);
        } else {
          ctx.textBaseline = 'bottom';
          ctx.fillText(val, x, y + (meta.type === 'bar' ? -6 : -10));
        }
        ctx.restore();
      });
    });
  }
};

// ─── 通用 options 工厂 ───
function baseLineOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { usePointStyle: true, pointStyleWidth: 8, boxWidth: 8, padding: 16, font: { size: 12, family: "'PingFang SC','Microsoft YaHei',sans-serif" }, color: '#6B6B6B' }
      },
      tooltip: {
        backgroundColor: 'rgba(26,26,26,0.92)',
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 13 },
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        boxPadding: 4,
      }
    },
    scales: {
      y: {
        grid: { color: C.grid, drawBorder: false },
        ticks: { font: { size: 11 }, color: C.textMuted, padding: 8 },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: C.textMuted, padding: 6 },
      }
    }
  };
}

function baseBarOptions() {
  const opts = baseLineOptions();
  opts.plugins.legend.position = 'top';
  opts.plugins.legend.align = 'end';
  return opts;
}

// ─── 销毁 & 周期切换 ───
function destroyCharts() {
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
}

function switchChartPeriod(period) {
  currentChartPeriod = period;
  document.querySelectorAll('.spp-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === period);
  });
  renderAllCharts();
}

function getChartDays() {
  return currentChartPeriod === 'week' ? 7 : 30;
}

function getChartLabels(days) {
  const labels = [];
  const weekDays = ['日','一','二','三','四','五','六'];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (days <= 7) {
      labels.push(weekDays[d.getDay()]);
    } else {
      labels.push((d.getMonth()+1) + '/' + d.getDate());
    }
  }
  return labels;
}

function getChartData(days) {
  const hData = getRecentDaysData('husband', days);
  const wData = getRecentDaysData('wife', days);
  return { labels: getChartLabels(days), husband: hData, wife: wData };
}

// ─── 主入口 ───
function renderAllCharts() {
  destroyCharts();
  const days = getChartDays();
  const data = getChartData(days);

  renderOverviewCards(days);
  renderScoreChart(data);
  renderNetCalChart(data);
  renderWeightChart(data);
  renderExerciseChart(data);
}

// ─── 顶部总览卡片 ───
function renderOverviewCards(days) {
  const h = getStatsSummary('husband', days);
  const w = getStatsSummary('wife', days);

  // 名称
  document.getElementById('so-h-name').textContent = getDisplayName('husband');
  document.getElementById('so-w-name').textContent = getDisplayName('wife');

  // 分数
  document.getElementById('so-h-score').textContent = h.totalScore;
  document.getElementById('so-w-score').textContent = w.totalScore;

  // 净摄入
  document.getElementById('so-h-netcal').textContent = h.totalNetCal;
  document.getElementById('so-w-netcal').textContent = w.totalNetCal;

  // 日均
  document.getElementById('so-h-avg').textContent = h.avgScore;
  document.getElementById('so-w-avg').textContent = w.avgScore;

  // VS 胜负
  const diff = h.totalScore - w.totalScore;
  const vsLeadEl = document.getElementById('so-vs-lead');
  const vsGapEl = document.getElementById('so-vs-gap');
  if (diff > 0) {
    vsLeadEl.textContent = getDisplayName('husband');
    vsGapEl.textContent = '+' + diff + ' 分';
  } else if (diff < 0) {
    vsLeadEl.textContent = getDisplayName('wife');
    vsGapEl.textContent = '+' + Math.abs(diff) + ' 分';
  } else {
    vsLeadEl.textContent = '—';
    vsGapEl.textContent = '—';
  }

  // 高亮领先方卡片
  const cardH = document.querySelector('.so-card-husband');
  const cardW = document.querySelector('.so-card-wife');
  cardH.style.boxShadow = diff > 0 ? '0 0 0 2px rgba(212,165,116,0.4), 0 4px 16px rgba(0,0,0,0.06)' : 'none';
  cardW.style.boxShadow = diff < 0 ? '0 0 0 2px rgba(139,94,60,0.35), 0 4px 16px rgba(0,0,0,0.06)' : 'none';
}

// ─── 图表1：积分趋势 (line + 渐变面积) ───
function renderScoreChart(data) {
  const canvas = document.getElementById('chart-score');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  chartInstances.score = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: getDisplayName('husband'),
          data: data.husband.map(d => d.score),
          borderColor: C.husband,
          borderWidth: 2.5,
          backgroundColor: C.husbandGlow,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: C.husband,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          _gradientTop: 'rgba(212,165,116,0.25)',
          _gradientBottom: 'rgba(212,165,116,0.0)',
        },
        {
          label: getDisplayName('wife'),
          data: data.wife.map(d => d.score),
          borderColor: C.wife,
          borderWidth: 2.5,
          backgroundColor: C.wifeGlow,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: C.wife,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          _gradientTop: 'rgba(139,94,60,0.22)',
          _gradientBottom: 'rgba(139,94,60,0.0)',
        }
      ]
    },
    options: {
      ...baseLineOptions(),
      scales: {
        ...baseLineOptions().scales,
        y: { ...baseLineOptions().scales.y, beginAtZero: true, max: 55, ticks: { ...baseLineOptions().scales.y.ticks, stepSize: 10 } }
      }
    },
    plugins: [gradientPlugin, dataLabelPlugin]
  });
}

// ─── 图表2：每日净卡路里对比 (line) ───
function renderNetCalChart(data) {
  const canvas = document.getElementById('chart-netcal');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  chartInstances.netcal = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: getDisplayName('husband'),
          data: data.husband.map(d => d.netCal),
          borderColor: C.husband,
          borderWidth: 2.5,
          backgroundColor: C.husbandGlow,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: C.husband,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          _gradientTop: 'rgba(212,165,116,0.25)',
          _gradientBottom: 'rgba(212,165,116,0.0)',
        },
        {
          label: getDisplayName('wife'),
          data: data.wife.map(d => d.netCal),
          borderColor: C.wife,
          borderWidth: 2.5,
          backgroundColor: C.wifeGlow,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: C.wife,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          _gradientTop: 'rgba(139,94,60,0.22)',
          _gradientBottom: 'rgba(139,94,60,0.0)',
        }
      ]
    },
    options: {
      ...baseLineOptions(),
      scales: {
        ...baseLineOptions().scales,
        y: {
          ...baseLineOptions().scales.y,
          beginAtZero: true,
          ticks: { ...baseLineOptions().scales.y.ticks, callback: v => v + ' kcal' }
        }
      }
    },
    plugins: [gradientPlugin, dataLabelPlugin]
  });
}

// ─── 图表3：体重变化趋势 (line, spanGaps=false) ───
function renderWeightChart(data) {
  const canvas = document.getElementById('chart-weight');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const allDates = [...new Set([
    ...data.husband.filter(d => d.hasWeight).map(d => d.date),
    ...data.wife.filter(d => d.hasWeight).map(d => d.date)
  ])].sort();

  const labels = allDates.map(ds => {
    const d = new Date(ds);
    return (d.getMonth()+1) + '/' + d.getDate();
  });

  const hWeights = allDates.map(ds => {
    const idx = data.husband.findIndex(h => h.date === ds);
    return idx >= 0 && data.husband[idx].hasWeight ? data.husband[idx].weight : null;
  });
  const wWeights = allDates.map(ds => {
    const idx = data.wife.findIndex(w => w.date === ds);
    return idx >= 0 && data.wife[idx].hasWeight ? data.wife[idx].weight : null;
  });

  chartInstances.weight = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: getDisplayName('husband'),
          data: hWeights,
          borderColor: C.husband,
          borderWidth: 2.5,
          backgroundColor: C.husbandGlow,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: C.husband,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          spanGaps: false,
          _gradientTop: 'rgba(212,165,116,0.22)',
          _gradientBottom: 'rgba(212,165,116,0.0)',
        },
        {
          label: getDisplayName('wife'),
          data: wWeights,
          borderColor: C.wife,
          borderWidth: 2.5,
          backgroundColor: C.wifeGlow,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: C.wife,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          spanGaps: false,
          _gradientTop: 'rgba(139,94,60,0.2)',
          _gradientBottom: 'rgba(139,94,60,0.0)',
        }
      ]
    },
    options: {
      ...baseLineOptions(),
      scales: {
        ...baseLineOptions().scales,
        y: { ...baseLineOptions().scales.y, ticks: { ...baseLineOptions().scales.y.ticks, callback: v => v + ' kg' } }
      }
    },
    plugins: [gradientPlugin, dataLabelPlugin]
  });
}

// ─── 图表4：运动消耗对比 (bar, 圆角) ───
function renderExerciseChart(data) {
  const canvas = document.getElementById('chart-exercise');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  chartInstances.exercise = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: getDisplayName('husband'),
          data: data.husband.map(d => d.calOut),
          backgroundColor: createGradient(ctx, 'rgba(212,165,116,0.8)', 'rgba(212,165,116,0.4)'),
          borderColor: C.husband,
          borderWidth: 0,
          borderRadius: 10,
          borderSkipped: false,
        },
        {
          label: getDisplayName('wife'),
          data: data.wife.map(d => d.calOut),
          backgroundColor: createGradient(ctx, 'rgba(139,94,60,0.8)', 'rgba(139,94,60,0.4)'),
          borderColor: C.wife,
          borderWidth: 0,
          borderRadius: 10,
          borderSkipped: false,
        }
      ]
    },
    options: {
      ...baseBarOptions(),
      scales: {
        ...baseBarOptions().scales,
        y: {
          ...baseBarOptions().scales.y,
          beginAtZero: true,
          ticks: { ...baseBarOptions().scales.y.ticks, callback: v => v + ' kcal' }
        }
      }
    },
    plugins: [gradientPlugin, dataLabelPlugin]
  });
}
