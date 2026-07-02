// ========== AI 食物识别逻辑 ==========

// API 配置
const API_CONFIG = {
  ZHIPU_API_KEY: 'da521b586d1d4279908ba9d1cb69573d.EoiBIgODirND5P5z',
  REMOVE_BG_API_KEY: '', // 可选：remove.bg API Key
  SERVER_URL: ''
};

// 当前数据
let currentFoodData = null;
let originalImageBase64 = null;
let processedImageBase64 = null;

// ========== 拍照功能 ==========
function triggerCamera() {
  document.getElementById('camera-input').click();
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('camera-input');
  input.addEventListener('change', handleImageSelect);
});

async function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    originalImageBase64 = e.target.result;
    await processFoodImage(originalImageBase64);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// ========== 图像处理流程 ==========
async function processFoodImage(imageBase64) {
  // 显示处理状态
  showProcessing('正在处理图片...');

  try {
    // 步骤1：抠图
    updateProcessingText('正在抠图去除背景...');
    const processedImage = await removeBackground(imageBase64);

    // 步骤2：AI 识别
    updateProcessingText('AI 正在识别食物...');
    const foodData = await recognizeFood(processedImage);

    // 保存数据
    currentFoodData = foodData;
    processedImageBase64 = processedImage;

    // 显示营养卡片
    showFoodCard(foodData, processedImage);
  } catch (error) {
    console.error('处理失败:', error);
    alert('识别失败：' + error.message + '\n\n请重试或检查网络连接');
    resetToCapture();
  }
}

// ========== 抠图功能 ==========
async function removeBackground(base64Image) {
  // 方案1：使用 remove.bg API（如果有 API Key）
  if (API_CONFIG.REMOVE_BG_API_KEY) {
    try {
      const result = await callRemoveBgAPI(base64Image);
      return result;
    } catch (e) {
      console.warn('remove.bg API 失败，使用原图:', e);
      return base64Image;
    }
  }

  // 方案2：使用服务端抠图服务
  try {
    const response = await fetch(API_CONFIG.SERVER_URL + '/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.image) return data.image;
    }
  } catch (e) {
    console.warn('服务端抠图失败，使用原图:', e);
  }

  // 降级：返回原图（不抠图）
  return base64Image;
}

async function callRemoveBgAPI(base64Image) {
  const formData = new FormData();
  const blob = dataURLtoBlob(base64Image);
  formData.append('image_file', blob, 'image.jpg');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': API_CONFIG.REMOVE_BG_API_KEY
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error('remove.bg API 请求失败');
  }

  const blob = await response.blob();
  return blobToDataURL(blob);
}

// ========== AI 食物识别 ==========
async function recognizeFood(imageBase64) {
  const response = await fetch(API_CONFIG.SERVER_URL + '/api/food-recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 })
  });

  if (!response.ok) {
    throw new Error('AI 识别服务不可用');
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error('AI 识别返回数据无效');
  }

  return result.data;
}

// ========== 显示营养卡片 ==========
function showFoodCard(data, imageBase64) {
  // 隐藏处理状态，显示卡片
  document.getElementById('processing-state').classList.add('hidden');
  document.getElementById('food-card').classList.remove('hidden');

  // 设置图片
  document.getElementById('food-image').src = imageBase64;

  // 设置数据
  document.getElementById('food-name').textContent = data.foodName || '未知食物';
  document.getElementById('calories').textContent = data.calories || 0;
  document.getElementById('carbs').textContent = data.carbs || 0;
  document.getElementById('protein').textContent = data.protein || 0;
  document.getElementById('fat').textContent = data.fat || 0;
  document.getElementById('fiber').textContent = data.fiber || 0;
  document.getElementById('sugar').textContent = data.sugar || 0;
  document.getElementById('sodium').textContent = data.sodium || 0;
  document.getElementById('tip-text').textContent = data.tip || '记得均衡饮食，适量运动';

  // 保存原始值用于编辑
  saveOriginalValues(data);

  // 绑定编辑事件
  bindEditEvents();
}

// ========== 编辑功能 ==========
function saveOriginalValues(data) {
  const fields = ['foodName', 'calories', 'carbs', 'protein', 'fat', 'fiber', 'sugar', 'sodium'];
  fields.forEach(field => {
    const el = document.getElementById(field) || document.querySelector(`[data-field="${field}"]`);
    if (el) {
      el.dataset.original = el.textContent;
    }
  });
}

function bindEditEvents() {
  const editables = document.querySelectorAll('[contenteditable="true"]');
  editables.forEach(el => {
    el.onfocus = function() {
      this.dataset.beforeEdit = this.textContent;
    };
    el.onblur = function() {
      const val = this.textContent.trim();
      if (!val || val === '0') {
        this.textContent = this.dataset.original || this.dataset.beforeEdit;
      } else {
        this.dataset.original = this.textContent;
        // 更新数据
        if (currentFoodData) {
          const field = this.dataset.field;
          if (field) {
            currentFoodData[field] = field === 'foodName' ? val : parseFloat(val) || 0;
          }
        }
      }
    };
    el.onkeydown = function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
      }
    };
  });
}

// ========== 操作按钮功能 ==========
function deleteAndRetake() {
  if (confirm('确定要删除当前食物并重新拍摄吗？')) {
    resetToCapture();
  }
}

function saveToDiary() {
  if (!currentFoodData) {
    alert('没有可保存的数据');
    return;
  }

  // 收集当前编辑后的数据
  const finalData = {
    ...currentFoodData,
    _imageBase64: processedImageBase64 || originalImageBase64
  };

  // 保存到 localStorage（可以改为发送到后端）
  const today = new Date().toISOString().split('T')[0];
  const savedData = JSON.parse(localStorage.getItem('food_diary') || '{}');
  if (!savedData[today]) {
    savedData[today] = [];
  }
  savedData[today].push({
    ...finalData,
    timestamp: new Date().toISOString()
  });
  localStorage.setItem('food_diary', JSON.stringify(savedData));

  alert('已保存到今日记录！');

  // 可以返回主页或关闭页面
  // window.close();
}

// ========== 辅助功能 ==========
function showProcessing(text) {
  document.getElementById('capture-area').classList.add('hidden');
  document.getElementById('processing-state').classList.remove('hidden');
  document.getElementById('food-card').classList.add('hidden');
  updateProcessingText(text);
}

function updateProcessingText(text) {
  document.getElementById('processing-text').textContent = text;
}

function resetToCapture() {
  document.getElementById('capture-area').classList.remove('hidden');
  document.getElementById('processing-state').classList.add('hidden');
  document.getElementById('food-card').classList.add('hidden');
  currentFoodData = null;
  originalImageBase64 = null;
  processedImageBase64 = null;
}

// ========== 数据转换工具 ==========
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
