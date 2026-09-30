/**
 * Web 端真实 OCR 引擎：Tesseract.js（WASM，纯浏览器内真实识别）
 *
 * 仅在 Web 平台打包此文件（Metro 的 .web.js 平台扩展解析）；
 * 原生端解析为同名占位文件 TesseractEngine.js，不会把 WASM/浏览器代码打进 APK。
 *
 * 运行时资源（首次运行从 CDN 下载，浏览器会缓存）：
 *  - worker 脚本 / WASM core：jsdelivr CDN
 *  - 中文语言包 chi_sim：tessdata CDN（简体中文 LSTM 模型，含数字与拉丁字母）
 *
 * v7 API：createWorker(langs, oem, options) 一次性完成 core 加载 + 语言加载 + 初始化，
 * 随后 worker.recognize(image) → { data: { text } }。
 *
 * 多策略识别（真实引擎，非 mock）：
 *  花呗/信用卡还款页的金额（如 254.83）字号极大，LSTM 在原始尺度上会整段漏读。
 *  这里在 canvas 上做灰度/二值化 + 多尺度缩放，并用不同 PSM 分段模式跑多轮，
 *  合并所有轮次的真实文本：
 *   - 缩小到 0.5 倍 + SPARSE_TEXT：让超大字号落到 LSTM 适宜的字高区间（首选）
 *   - 二值化 0.5 倍 + SPARSE_TEXT：浅灰背景/抗锯齿噪声下的兜底
 *   - 原始尺度 + SINGLE_BLOCK：常规账单文字识别最准（描述/日期等）
 *  任一轮失败不影响其他轮；全部失败才向调用方抛真实错误。
 */
import { createWorker, OEM, PSM } from 'tesseract.js';

// 中文账单截图：简体中文为主；叠加 eng 提升英文商家/备注识别（数字本身 chi_sim 已含）
const LANGS = 'chi_sim+eng';

/** Worker 全局单例：语言包只下载一次，多图串行识别复用 */
let workerPromise = null;

function logger(m) {
  // recognizing text 阶段才有 0~1 进度；加载阶段静默，避免刷屏
  if (m?.status === 'recognizing text') {
    console.debug('[Tesseract] 识别进度', Math.round((m.progress || 0) * 100) + '%');
  }
}

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = createWorker(LANGS, OEM.LSTM_ONLY, { logger });
  // 创建失败（断网/CDN 不可达）时清空单例，下次调用可重新尝试
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

/** 加载图片为 HTMLImageElement（data URI / blob URL 均可） */
function loadImageElement(uri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('图片加载失败，无法识别'));
    img.src = uri;
  });
}

/**
 * 生成预处理后的图片 data URI：缩放 + 灰度 + 可选二值化。
 * 灰度能去掉彩色图标/屏幕背景对 LSTM 的干扰；二值化进一步消除抗锯齿噪点。
 */
function makeVariant(img, { scale, threshold }) {
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    if (threshold != null) g = g >= threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * 识别策略列表（顺序即文本合并顺序）：
 * 金额提取器对「254.83 + 换行 + 还款成功」这类近邻组合优先级最高，
 * 所以把最可能读出大字金额的缩小稀疏模式放在最前面。
 */
const STRATEGIES = [
  { scale: 0.5, threshold: null, psm: PSM.SPARSE_TEXT, name: 'half-sparse' },
  { scale: 0.5, threshold: 170, psm: PSM.SPARSE_TEXT, name: 'half-binary-sparse' },
  { scale: 1, threshold: null, psm: PSM.SINGLE_BLOCK, name: 'origin-block' },
];

/**
 * 识别图片中的文字（多尺度 + 多分页模式，合并真实结果）
 * @param {string} imageUri data URI / blob URL
 * @returns {Promise<string>}
 */
export async function recognize(imageUri) {
  const worker = await getWorker();
  const img = await loadImageElement(imageUri);

  const texts = [];
  let lastError = null;
  for (const strategy of STRATEGIES) {
    try {
      const variantUri = makeVariant(img, strategy);
      await worker.setParameters({ tessedit_pageseg_mode: strategy.psm });
      const { data } = await worker.recognize(variantUri);
      const text = (data?.text || '').trim();
      if (text) {
        texts.push(text);
        console.info(`[Tesseract] 策略 ${strategy.name} 识别出 ${text.length} 字符`);
      } else {
        console.info(`[Tesseract] 策略 ${strategy.name} 未识别到文字`);
      }
    } catch (e) {
      lastError = e;
      console.warn(`[Tesseract] 策略 ${strategy.name} 失败：`, e?.message);
    }
  }

  if (texts.length === 0) {
    throw lastError || new Error('图片文字识别失败，请检查网络后重试（首次运行需下载语言包）');
  }
  return texts.join('\n\n');
}

export function isTesseractAvailable() {
  return typeof createWorker === 'function';
}
