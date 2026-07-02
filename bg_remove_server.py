from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import io
import os
import rembg
from PIL import Image, ImageFilter, ImageEnhance
import time
import numpy as np

os.environ['U2NET_HOME'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.u2net')

app = Flask(__name__)
CORS(app)

_session = None

# 使用 u2net 模型以获得最佳背景移除效果
# 可选: 'u2net' (最慢最准), 'u2netp' (平衡), 'u2net_human_seg' (人像), 'silueta' (最快)
MODEL_NAME = 'u2net'  # 使用最准确的模型

def get_session():
    global _session
    if _session is None:
        print(f'正在加载抠图模型 ({MODEL_NAME})...')
        start_time = time.time()
        _session = rembg.new_session(MODEL_NAME)
        elapsed = time.time() - start_time
        print(f'抠图模型加载完成 (耗时 {elapsed:.2f} 秒)')
    return _session

# 启动时预加载模型
print('服务器启动中，预加载模型...')
get_session()


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    start_time = time.time()
    try:
        data = request.json
        image_b64 = data.get('image', '')
        no_border = data.get('no_border', False)  # 是否不添加边框

        if ',' in image_b64:
            image_b64 = image_b64.split(',')[1]

        # 修复base64 padding问题
        image_b64 = image_b64.strip()
        missing_padding = len(image_b64) % 4
        if missing_padding:
            image_b64 += '=' * (4 - missing_padding)

        t_decode = time.time()
        image_bytes = base64.b64decode(image_b64)
        print(f'[抠图] 解码耗时: {(time.time() - t_decode)*1000:.0f}ms')

        session = get_session()
        input_image = Image.open(io.BytesIO(image_bytes)).convert('RGBA')

        print(f'[抠图] 原始尺寸: {input_image.size}, 不添加边框: {no_border}')

        # 限制图片尺寸以加速处理
        max_size = 2048
        if max(input_image.size) > max_size:
            ratio = max_size / max(input_image.size)
            new_size = tuple(int(dim * ratio) for dim in input_image.size)
            input_image = input_image.resize(new_size, Image.LANCZOS)
            print(f'[抠图] 缩放至: {new_size}')

        # 使用rembg移除背景
        t_rembg = time.time()
        output_image = rembg.remove(input_image, session=session)
        print(f'[抠图] AI抠图耗时: {(time.time() - t_rembg)*1000:.0f}ms')

        # 如果不需要边框，直接返回
        if no_border:
            # 额外处理：移除可能残留的浅色背景（如网格）
            t_bg = time.time()
            output_image = remove_light_background(output_image)
            print(f'[抠图] 背景清理耗时: {(time.time() - t_bg)*1000:.0f}ms')

            buf = io.BytesIO()
            output_image.save(buf, format='PNG')
            processed_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

            total = time.time() - start_time
            print(f'[抠图] 处理成功（无边框），最终尺寸: {output_image.size}, 总耗时: {total*1000:.0f}ms ({total:.2f}秒)')
            return jsonify({'image': 'data:image/png;base64,' + processed_b64, 'duration': int(total*1000)})

        # 额外处理：移除可能残留的浅色背景（如网格）
        t_bg = time.time()
        output_image = remove_light_background(output_image)
        print(f'[抠图] 背景清理耗时: {(time.time() - t_bg)*1000:.0f}ms')

        alpha = output_image.split()[-1]

        # 白边宽度设置（最小 80px，或图片短边的 1/150，取较大值）
        stroke_width = max(80, int(min(output_image.size) / 150))

        t_stroke = time.time()
        # 优化：只在需要时应用滤镜，减少迭代次数
        if stroke_width > 10:
            dilated = alpha.filter(ImageFilter.MaxFilter(stroke_width + 1))
            # 减少高斯模糊半径
            dilated = dilated.filter(ImageFilter.GaussianBlur(radius=min(stroke_width * 0.05, 3)))
        else:
            dilated = alpha

        white_layer = Image.new('RGBA', output_image.size, (255, 255, 255, 255))
        outline = Image.composite(white_layer, Image.new('RGBA', output_image.size, (0, 0, 0, 0)), dilated)

        result = Image.alpha_composite(outline, output_image)
        print(f'[抠图] 描边处理耗时: {(time.time() - t_stroke)*1000:.0f}ms')

        t_crop = time.time()
        bbox = result.getbbox()
        if bbox:
            padding = stroke_width * 2
            bbox = (
                max(0, bbox[0] - padding),
                max(0, bbox[1] - padding),
                min(result.width, bbox[2] + padding),
                min(result.height, bbox[3] + padding)
            )
            result = result.crop(bbox)
        print(f'[抠图] 裁剪耗时: {(time.time() - t_crop)*1000:.0f}ms')

        t_save = time.time()
        buf = io.BytesIO()
        result.save(buf, format='PNG')
        processed_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        print(f'[抠图] 编码耗时: {(time.time() - t_save)*1000:.0f}ms')

        total = time.time() - start_time
        print(f'[抠图] 处理成功，最终尺寸: {result.size}, 总耗时: {total*1000:.0f}ms ({total:.2f}秒)')
        return jsonify({'image': 'data:image/png;base64,' + processed_b64, 'duration': int(total*1000)})

    except Exception as e:
        print(f'[抠图] 错误: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


def remove_light_background(image):
    """
    移除可能残留的浅色背景（如AI生成的网格背景）
    使用更强大的算法来检测和移除网格背景
    """
    try:
        # 转换为numpy数组处理
        img_array = np.array(image)

        # 获取RGB通道
        rgb = img_array[:, :, :3]
        alpha = img_array[:, :, 3]

        # 计算每个像素的亮度
        brightness = np.mean(rgb, axis=2)

        # 使用边缘检测来识别前景物体
        # 有明显边缘的地方是前景，平坦区域可能是背景
        from scipy.ndimage import sobel

        # 计算每个通道的边缘强度
        edge_strength = np.zeros_like(brightness)
        for i in range(3):
            edge_x = sobel(rgb[:, :, i], axis=0)
            edge_y = sobel(rgb[:, :, i], axis=1)
            edge_strength = np.maximum(edge_strength, np.sqrt(edge_x**2 + edge_y**2))

        # 使用高斯模糊平滑边缘强度
        from scipy.ndimage import gaussian_filter
        edge_smooth = gaussian_filter(edge_strength, sigma=3)

        # 检测网格背景的特征：
        # 1. 边缘强度低（平坦区域）
        # 2. 亮度适中到偏高（网格通常是浅色）
        # 3. 或者有规律的网格纹理

        # 条件1：低边缘强度（可能是背景）
        low_edge = edge_smooth < 5

        # 条件2：高亮度（浅色背景）
        high_brightness = brightness > 180

        # 条件3：检测有规律的网格纹理
        # 使用FFT检测周期性图案
        from scipy.fft import fft2

        # 对亮度进行FFT变换
        fft_result = np.abs(fft2(brightness))
        # 检查是否有明显的周期性频率分量
        has_grid_pattern = np.mean(fft_result[1:10, 1:10]) > np.mean(fft_result) * 0.1

        # 组合条件
        if has_grid_pattern:
            # 如果检测到网格图案，使用更激进的移除策略
            background_mask = (low_edge) & (brightness > 150)
        else:
            # 普通浅色背景
            background_mask = low_edge & high_brightness

        # 同时检查原始alpha通道，如果有不透明区域但符合背景特征，也移除
        already_transparent = alpha < 50
        suspicious_background = background_mask & ~already_transparent

        # 将背景区域设为透明
        alpha[suspicious_background] = 0

        # 更新图像
        img_array[:, :, 3] = alpha

        print(f'[背景移除] 检测到网格图案: {has_grid_pattern}, 移除了 {np.sum(suspicious_background)} 个像素')
        return Image.fromarray(img_array)

    except ImportError as e:
        # 如果scipy不可用，使用简单方法
        print(f'[警告] scipy不可用，使用简单背景移除: {e}')
        return simple_remove_light_background(image)
    except Exception as e:
        print(f'[警告] 高级背景移除失败: {e}')
        import traceback
        traceback.print_exc()
        return image


def simple_remove_light_background(image):
    """
    简单的浅色背景移除方法（不依赖scipy）
    使用颜色阈值和区域分析
    """
    try:
        pixels = image.load()
        width, height = image.size

        # 统计图像的颜色分布
        color_counts = {}
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                if a > 200:  # 只统计不透明像素
                    # 量化颜色（减少精度）
                    color_key = (r//16*16, g//16*16, b//16*16)
                    color_counts[color_key] = color_counts.get(color_key, 0) + 1

        # 找出最常见的颜色（可能是背景色）
        if color_counts:
            bg_color = max(color_counts, key=color_counts.get)
            bg_r, bg_g, bg_b = bg_color

            print(f'[简单背景移除] 检测到可能的背景色: RGB({bg_r}, {bg_g}, {bg_b})')

            # 移除接近背景色的像素
            for y in range(height):
                for x in range(width):
                    r, g, b, a = pixels[x, y]

                    if a > 0:
                        # 计算与背景色的距离
                        color_dist = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)

                        # 如果颜色接近背景色且位置边缘，可能是背景
                        is_edge = x < 10 or x > width - 10 or y < 10 or y > height - 10
                        if color_dist < 60 and (is_edge or a < 250):
                            pixels[x, y] = (r, g, b, 0)  # 设为完全透明

        return image
    except Exception as e:
        print(f'[警告] 简单背景移除失败: {e}')
        return image


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8765, debug=False)
