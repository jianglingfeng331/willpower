const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Buffer } = require('buffer');
const { PNG } = require('pngjs');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 提供静态文件服务
app.use(express.static(__dirname));

// 同步数据文件路径
const SYNC_FILE = path.join(__dirname, 'pk-sync.json');

// 食物识别 API Key（原账户）
const ZHIPU_API_KEY = 'df56730a0ecf42f393bef6da89e4c44c.Mu6xDD7GiIvO9CYI';

// 图片生成 API Key（新账户，有 CogView 资源包）
const ZHIPU_IMAGE_API_KEY = 'da521b586d1d4279908ba9d1cb69573d.EoiBIgODirND5P5z';

// Seedream 4.5 图片生成配置
const SEEDREAM_API_KEY = 'api-key-20260701103746';
const SEEDREAM_ARK_ID = 'ark-0cf09727-45ff-4b31-b730-398be4c6c134-fb326';

// 本地模拟食物数据（当AI API不可用时使用）
const MOCK_FOODS = [
  { foodName: '宫保鸡丁', calories: 450, carbs: 25, protein: 30, fat: 28, fiber: 3, sugar: 8, sodium: 1200, tip: '建议搭配蔬菜一起食用，控制油脂摄入' },
  { foodName: '清炒时蔬', calories: 120, carbs: 8, protein: 3, fat: 8, fiber: 4, sugar: 4, sodium: 400, tip: '蔬菜富含维生素，建议每餐都有' },
  { foodName: '红烧肉', calories: 580, carbs: 15, protein: 20, fat: 52, fiber: 1, sugar: 12, sodium: 800, tip: '高脂高热量，建议适量食用' },
  { foodName: '蒸蛋羹', calories: 150, carbs: 5, protein: 12, fat: 10, fiber: 0, sugar: 3, sodium: 300, tip: '优质蛋白来源，适合减脂期' },
  { foodName: '凉拌黄瓜', calories: 60, carbs: 8, protein: 2, fat: 3, fiber: 2, sugar: 4, sodium: 500, tip: '清爽低卡，适合夏季食用' },
  { foodName: '西红柿鸡蛋面', calories: 380, carbs: 55, protein: 15, fat: 12, fiber: 3, sugar: 8, sodium: 900, tip: '主食搭配蛋白质，营养均衡' },
  { foodName: '米饭', calories: 200, carbs: 40, protein: 4, fat: 1, fiber: 1, sugar: 0, sodium: 10, tip: '主食适量，搭配蛋白质和蔬菜' },
  { foodName: '鸡胸肉沙拉', calories: 250, carbs: 10, protein: 35, fat: 8, fiber: 5, sugar: 3, sodium: 300, tip: '优质减脂餐，蛋白质丰富' },
  { foodName: '苹果', calories: 80, carbs: 20, protein: 0.5, fat: 0.2, fiber: 3, sugar: 10, sodium: 1, tip: '水果富含膳食纤维，每天一个' },
  { foodName: '全麦面包', calories: 250, carbs: 45, protein: 7, fat: 3, fiber: 5, sugar: 3, sodium: 350, tip: '选择全麦面包，升糖指数更低' },
  { foodName: '酸奶', calories: 120, carbs: 15, protein: 8, fat: 2, fiber: 0, sugar: 10, sodium: 50, tip: '选择无糖酸奶，补充益生菌' },
  { foodName: '西兰花炒虾仁', calories: 180, carbs: 8, protein: 25, fat: 5, fiber: 3, sugar: 2, sodium: 400, tip: '高蛋白低脂肪，减脂佳品' }
];

function getMockFoodData() {
  return MOCK_FOODS[Math.floor(Math.random() * MOCK_FOODS.length)];
}

// API状态检查接口
app.get('/api/status', (req, res) => {
  res.json({
    service: '燃脂PK - AI食物识别代理服务',
    status: 'running',
    endpoints: {
      food_recognize: '/api/food-recognize (POST)'
    }
  });
});

// 健康检查接口（前端 data.js 调用）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// AI 抠图接口
const BG_REMOVE_URL = 'http://127.0.0.1:8765/remove-bg';

app.post('/api/remove-bg', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: '缺少图片数据' });
    }

    let base64Data = image;
    if (base64Data.startsWith('data:')) {
      base64Data = base64Data.split(',')[1];
    }

    console.log('[抠图] 开始处理...');
    const pythonResponse = await fetch(BG_REMOVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data })
    });

    if (!pythonResponse.ok) {
      throw new Error('Python抠图服务调用失败: ' + pythonResponse.status);
    }

    const result = await pythonResponse.json();
    console.log('[抠图] 完成，耗时:', (Date.now() - startTime) + 'ms');
    res.json({ success: true, image: result.image, duration: Date.now() - startTime });
  } catch (error) {
    console.error('抠图失败:', error.message);
    try {
      let base64Data = req.body.image;
      if (base64Data.startsWith('data:')) {
        base64Data = base64Data.split(',')[1];
      }
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const result = addWhiteStrokeFallback(imageBuffer);
      console.log('[抠图] 降级方案，耗时:', (Date.now() - startTime) + 'ms');
      return res.json({ success: true, image: 'data:image/png;base64,' + result.toString('base64'), fallback: true, duration: Date.now() - startTime });
    } catch (e2) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

function addWhiteStrokeFallback(imageBuffer) {
  return imageBuffer;
}

// 数据同步接口
app.get('/api/sync', (req, res) => {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      const data = fs.readFileSync(SYNC_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({ pk_users: {}, accounts: {}, records: {} });
    }
  } catch (error) {
    console.error('读取同步文件失败:', error);
    res.json({ pk_users: {}, accounts: {}, records: {} });
  }
});

app.post('/api/sync', (req, res) => {
  try {
    const data = {
      pk_users: req.body.pk_users || {},
      accounts: req.body.accounts || {},
      records: req.body.records || {}
    };
    fs.writeFileSync(SYNC_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('写入同步文件失败:', error);
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/food-recognize', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: '缺少图片数据' });
    }

    console.log('[食物识别] 开始调用智谱AI...');

    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`
      },
      body: JSON.stringify({
        model: 'glm-4v-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: image
                }
              },
              {
                type: 'text',
                text: '请识别这张图片中的食物，并以JSON格式返回营养信息。请严格按照以下格式返回，不要添加任何其他文字：\n{\n  "foodName": "食物名称",\n  "calories": 热量数值,\n  "carbs": 碳水化合物克数,\n  "protein": 蛋白质克数,\n  "fat": 脂肪克数,\n  "fiber": 膳食纤维克数,\n  "sugar": 糖分克数,\n  "sodium": 钠毫克数,\n  "tip": "一句简短的饮食建议"\n}\n请估算合理的营养成分值，以整数值返回。只返回JSON，不要有其他说明文字。'
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('智谱AI错误:', errorText);
      console.log('降级到本地模拟数据...');
      const mockData = getMockFoodData();
      console.log('[食物识别] 降级返回，耗时:', (Date.now() - startTime) + 'ms');
      return res.json({
        success: true,
        data: {
          foodName: mockData.foodName,
          calories: mockData.calories,
          carbs: mockData.carbs,
          protein: mockData.protein,
          fat: mockData.fat,
          fiber: mockData.fiber,
          sugar: mockData.sugar,
          sodium: mockData.sodium,
          tip: mockData.tip
        },
        fallback: true,
        duration: Date.now() - startTime
      });
    }

    const data = await response.json();
    console.log('智谱AI响应:', data);

    if (data.error) {
      console.error('智谱AI返回错误:', data.error.message);
      console.log('降级到本地模拟数据...');
      const mockData = getMockFoodData();
      console.log('[食物识别] 降级返回，耗时:', (Date.now() - startTime) + 'ms');
      return res.json({
        success: true,
        data: {
          foodName: mockData.foodName,
          calories: mockData.calories,
          carbs: mockData.carbs,
          protein: mockData.protein,
          fat: mockData.fat,
          fiber: mockData.fiber,
          sugar: mockData.sugar,
          sodium: mockData.sodium,
          tip: mockData.tip
        },
        fallback: true,
        duration: Date.now() - startTime
      });
    }

    const content = data.choices[0].message.content;
    console.log('AI返回内容:', content);

    // 解析JSON响应
    let foodData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        foodData = JSON.parse(jsonMatch[0]);
      } else {
        foodData = JSON.parse(content);
      }

      console.log('[食物识别] 完成，耗时:', (Date.now() - startTime) + 'ms');
      res.json({
        success: true,
        data: {
          foodName: foodData.foodName || '未知食物',
          calories: parseInt(foodData.calories) || 0,
          carbs: parseInt(foodData.carbs) || 0,
          protein: parseInt(foodData.protein) || 0,
          fat: parseInt(foodData.fat) || 0,
          fiber: parseInt(foodData.fiber) || 0,
          sugar: parseInt(foodData.sugar) || 0,
          sodium: parseInt(foodData.sodium) || 0,
          tip: foodData.tip || '建议搭配蔬菜，营养均衡更健康'
        },
        duration: Date.now() - startTime
      });
    } catch (parseError) {
      console.error('解析响应失败:', parseError, content);
      res.status(500).json({ error: '无法解析AI响应', content: content });
    }
  } catch (error) {
    console.error('服务器错误:', error);
    res.status(500).json({ error: '服务器内部错误', message: error.message });
  }
});

// AI生成卡通冰箱贴接口
// 通用提示词：日系治愈扁平卡通插画，美食食物，完整保留原图食物外形、比例、色彩特征，圆润柔和质感，清新马卡龙柔和配色，细腻柔和阴影，干净简约轮廓线条，软萌 Q 版画风，高清细节，圆角异形白色描边，透明背景，冰箱贴贴纸样式，居中构图，柔和自然光，商品贴纸拍摄，8K 超高清晰度，无多余杂物，画面干净简洁
const STICKER_PROMPT = '杰作，最佳画质，8K 分辨率，极致细节，半写实日系插画风格，完整保留参考图中食物原本的外形轮廓、色彩、表皮纹理以及所有细节特征，仅做画质精细化优化，柔和哑光质感，自然细腻光影，干净纤细轮廓线，清新柔和色调，美食冰箱贴纸，异形圆角白色粗描边，纯白色背景无纹理无阴影无渐变无装饰，居中构图，柔和漫射自然光，无任何多余元素；图生图重绘幅度：0.3；采样器：DPM++ 2M Karras；采样步数：24 步；生成图片分辨率和原图尺寸保持一致';

app.post('/api/generate-sticker', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image, foodName } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: '缺少图片数据' });
    }

    console.log('[冰箱贴] 开始生成卡通冰箱贴，食物:', foodName);

    // 提取base64数据
    let base64Data = image;
    if (base64Data.startsWith('data:')) {
      base64Data = base64Data.split(',')[1];
    }

    // 方案1: 使用 Seedream 4.5 生成卡通贴纸
    try {
      console.log('[冰箱贴] 使用 Seedream 4.5 生成...');
      const t0 = Date.now();

      // 将 base64 图片转换为临时 URL 或使用 inline
      const imageInput = `data:image/png;base64,${base64Data}`;

      const seedreamResponse = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_ARK_ID}`
        },
        body: JSON.stringify({
          model: 'doubao-seedream-4-5-251128',
          prompt: `${STICKER_PROMPT}，${foodName || '美食食物'}`,
          image: imageInput,
          sequential_image_generation: 'disabled',
          response_format: 'url',
          size: '2K',
          stream: false,
          watermark: false
        })
      });

      if (seedreamResponse.ok) {
        const seedreamData = await seedreamResponse.json();
        console.log('[冰箱贴] Seedream 响应:', JSON.stringify(seedreamData, null, 2));

        // 检查响应格式
        if (seedreamData.data && seedreamData.data[0] && seedreamData.data[0].url) {
          const imageUrl = seedreamData.data[0].url;
          const imageResponse = await fetch(imageUrl);
          const imageBuffer = await imageResponse.buffer();
          const base64Image = 'data:image/png;base64,' + imageBuffer.toString('base64');

          console.log('[冰箱贴] Seedream 生成成功，耗时:', (Date.now() - startTime) + 'ms (AI生成:', (Date.now() - t0) + 'ms)');
          return res.json({
            success: true,
            image: base64Image,
            source: 'seedream-4.5',
            duration: Date.now() - startTime
          });
        } else if (seedreamData.output && seedreamData.output.results && seedreamData.output.results[0]) {
          // 备用格式检查
          const imageUrl = seedreamData.output.results[0].url;
          const imageResponse = await fetch(imageUrl);
          const imageBuffer = await imageResponse.buffer();
          const base64Image = 'data:image/png;base64,' + imageBuffer.toString('base64');

          console.log('[冰箱贴] Seedream 生成成功（备用格式），耗时:', (Date.now() - startTime) + 'ms');
          return res.json({
            success: true,
            image: base64Image,
            source: 'seedream-4.5',
            duration: Date.now() - startTime
          });
        }
      } else {
        const errorText = await seedreamResponse.text();
        console.error('[冰箱贴] Seedream 响应错误:', errorText);
      }
    } catch (seedreamError) {
      console.error('[冰箱贴] Seedream 调用失败:', seedreamError.message);
    }

    // 方案2: 使用DALL-E API（如果配置了API密钥）
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || req.body.apiKey;

    if (OPENAI_API_KEY) {
      try {
        console.log('[冰箱贴] 使用DALL-E API生成...');

        // 将base64转换为buffer
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // 使用DALL-E Edits API（基于原图编辑）
        const formData = new FormData();
        formData.append('image', new Blob([imageBuffer]), 'food.png');
        formData.append('prompt', `${STICKER_PROMPT}，${foodName}`);
        formData.append('n', '1');
        formData.append('size', '1024x1024');

        const dallEResponse = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: formData
        });

        if (dallEResponse.ok) {
          const dallEData = await dallEResponse.json();
          if (dallEData.data && dallEData.data[0]) {
            // 获取生成的图片
            const imageUrl = dallEData.data[0].url;
            const imageResponse = await fetch(imageUrl);
            const imageBlob = await imageResponse.buffer();
            const base64Image = 'data:image/png;base64,' + imageBlob.toString('base64');

            console.log('[冰箱贴] DALL-E生成成功');
            return res.json({
              success: true,
              image: base64Image,
              source: 'dalle'
            });
          }
        }
      } catch (dalleError) {
        console.error('[冰箱贴] DALL-E调用失败:', dalleError.message);
      }
    }

    // 方案3: 使用Stable Diffusion API（如果配置了）
    const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

    try {
      console.log('[冰箱贴] 尝试使用Stable Diffusion...');

      const sdResponse = await fetch(`${SD_API_URL}/sdapi/v1/img2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          init_images: [base64Data],
          prompt: `${STICKER_PROMPT}，${foodName || '美食食物'}`,
          negative_prompt: '低质量，模糊，变形，多余元素，复杂背景，非食物，文字，水印',
          steps: 30,
          cfg_scale: 7,
          width: 512,
          height: 512,
          denoising_strength: 0.6
        })
      });

      if (sdResponse.ok) {
        const sdData = await sdResponse.json();
        if (sdData.images && sdData.images[0]) {
          console.log('[冰箱贴] Stable Diffusion生成成功');
          return res.json({
            success: true,
            image: 'data:image/png;base64,' + sdData.images[0],
            source: 'stable-diffusion'
          });
        }
      }
    } catch (sdError) {
      console.error('[冰箱贴] Stable Diffusion调用失败:', sdError.message);
    }

    // 方案4: 降级 - 返回原图（带白色描边效果模拟）
    console.log('[冰箱贴] AI服务不可用，使用原图加描边效果');

    try {
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const processedImage = await addStickerEffect(imageBuffer);

      return res.json({
        success: true,
        image: 'data:image/png;base64,' + processedImage.toString('base64'),
        source: 'fallback',
        fallback: true
      });
    } catch (fallbackError) {
      console.error('[冰箱贴] 降级处理失败:', fallbackError.message);

      // 最终降级：返回原图
      return res.json({
        success: true,
        image: image.startsWith('data:') ? image : 'data:image/png;base64,' + base64Data,
        source: 'original',
        fallback: true
      });
    }

  } catch (error) {
    console.error('[冰箱贴] 生成失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 为冰箱贴添加描边效果的函数（使用sharp或pngjs）
async function addStickerEffect(imageBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const PNG = require('pngjs').PNG;
      const data = PNG.sync.read(imageBuffer);

      const width = data.width;
      const height = data.height;
      const borderSize = 8;

      // 创建新的PNG，添加白色边框
      const sticker = new PNG({
        width: width + borderSize * 2,
        height: height + borderSize * 2
      });

      // 填充透明背景
      for (let y = 0; y < sticker.height; y++) {
        for (let x = 0; x < sticker.width; x++) {
          const idx = (y * sticker.width + x) << 2;
          sticker.data[idx] = 0;     // R
          sticker.data[idx + 1] = 0; // G
          sticker.data[idx + 2] = 0; // B
          sticker.data[idx + 3] = 0; // A (透明)
        }
      }

      // 复制原图并添加白色描边
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (y * width + x) << 2;
          const alpha = data.data[srcIdx + 3];

          if (alpha > 0) {
            // 绘制白色描边
            const offsets = [
              [-1, -1], [-1, 0], [-1, 1],
              [0, -1],           [0, 1],
              [1, -1],  [1, 0],  [1, 1]
            ];

            for (const [dx, dy] of offsets) {
              const borderX = x + dx + borderSize;
              const borderY = y + dy + borderSize;

              if (borderX >= 0 && borderX < sticker.width &&
                  borderY >= 0 && borderY < sticker.height) {
                const borderIdx = (borderY * sticker.width + borderX) << 2;
                if (sticker.data[borderIdx + 3] === 0) {
                  sticker.data[borderIdx] = 255;     // 白色
                  sticker.data[borderIdx + 1] = 255;
                  sticker.data[borderIdx + 2] = 255;
                  sticker.data[borderIdx + 3] = 200; // 半透明
                }
              }
            }

            // 绘制原图像素
            const dstX = x + borderSize;
            const dstY = y + borderSize;
            const dstIdx = (dstY * sticker.width + dstX) << 2;

            sticker.data[dstIdx] = data.data[srcIdx];
            sticker.data[dstIdx + 1] = data.data[srcIdx + 1];
            sticker.data[dstIdx + 2] = data.data[srcIdx + 2];
            sticker.data[dstIdx + 3] = alpha;
          }
        }
      }

      resolve(PNG.sync.write(sticker));
    } catch (error) {
      reject(error);
    }
  });
}

// 从Buffer移除背景的函数（增强版，针对网格背景优化）
async function removeBackgroundFromBuffer(imageBuffer) {
  try {
    console.log('[背景移除] 开始处理...');

    // 将Buffer转换为base64
    const base64Data = 'data:image/png;base64,' + imageBuffer.toString('base64');

    // 调用抠图服务
    const bgRemoveResponse = await fetch(BG_REMOVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data }),
      timeout: 30000 // 30秒超时
    });

    if (bgRemoveResponse.ok) {
      const result = await bgRemoveResponse.json();
      if (result.success && result.image) {
        console.log('[背景移除] 成功');
        return result.image.startsWith('data:') ? result.image : 'data:image/png;base64,' + result.image;
      } else {
        console.error('[背景移除] 服务返回失败:', result);
      }
    } else {
      console.error('[背景移除] HTTP错误:', bgRemoveResponse.status);
    }
    return null;
  } catch (error) {
    console.error('[背景移除] 失败:', error.message);
    return null;
  }
}

const PORT = 3001;

// ========== 数据存储 API ==========

// 辅助函数：读取数据文件
function readDataFile() {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[存储] 读取数据文件失败:', error);
  }
  return { pk_users: {}, accounts: {}, records: {}, custom_foods: {}, custom_exercises: {}, nicknames: {}, setup_completed: {} };
}

// 辅助函数：写入数据文件
function writeDataFile(data) {
  try {
    fs.writeFileSync(SYNC_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[存储] 写入数据文件失败:', error);
    return false;
  }
}

// 获取所有数据
app.get('/api/data', (req, res) => {
  const data = readDataFile();
  res.json({ success: true, data });
});

// 保存所有数据
app.post('/api/data', (req, res) => {
  const data = req.body;
  if (writeDataFile(data)) {
    res.json({ success: true });
  } else {
    res.json({ success: false, error: '写入失败' });
  }
});

// 获取特定键的数据
app.get('/api/data/:key', (req, res) => {
  const key = req.params.key;
  const data = readDataFile();
  if (data[key] !== undefined) {
    res.json({ success: true, value: data[key] });
  } else {
    res.json({ success: true, value: null });
  }
});

// 设置特定键的数据
app.post('/api/data/:key', (req, res) => {
  const key = req.params.key;
  const value = req.body.value;
  const data = readDataFile();
  data[key] = value;
  if (writeDataFile(data)) {
    res.json({ success: true });
  } else {
    res.json({ success: false, error: '写入失败' });
  }
});

// 删除特定键的数据
app.delete('/api/data/:key', (req, res) => {
  const key = req.params.key;
  const data = readDataFile();
  delete data[key];
  if (writeDataFile(data)) {
    res.json({ success: true });
  } else {
    res.json({ success: false, error: '删除失败' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`代理服务运行在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://<你的IP>:${PORT}`);
});
