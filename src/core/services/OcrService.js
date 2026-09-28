/**
 * OCR 服务：图片 → 文字 → 解析为记账实体数组
 *
 * 识别引擎（按可用性自动选择）：
 *  1) 原生端（iOS/Android dev build）：Google ML Kit 文字识别（离线、免费）
 *  2) Web / Expo Go / 未装 SDK：回退 Mock 样例（保证流程可跑通，仅用于演示）
 *
 * ML Kit 含原生代码，无法在 Expo Go 中运行。要使用真实识别需：
 *   npm i @react-native-ml-kit/text-recognition
 *   npx expo prebuild && npx expo run:android   （或 EAS build dev client）
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
// 命名空间导入（live binding）：Metro 会正确填充 _dependencyMap，
// 且 live binding 在循环依赖 / HMR 下比解构导入更健壮
import * as db from '../db';
import * as amountExtractor from './AmountExtractor';
import * as dateExtractor from './DateExtractor';
import * as categoryMatcher from './CategoryMatcher';
import * as descriptionComposer from './DescriptionComposer';
import TransactionEntry, { TX_SOURCE } from '../entities/TransactionEntry';

/**
 * 图片指纹：用于 OCR 缓存去重。
 * 内联实现避免跨模块导入导致的加载顺序问题。
 * - web 端：取 URI 尾部（data URI 内容相同则指纹相同）
 * - 原生端：文件大小 + URI 尾部
 */
async function computeImageFingerprint(uri) {
  if (Platform.OS === 'web') {
    return `img_web_${String(uri || '').slice(-64)}`;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = info?.size || 0;
    const tail = String(uri).split('/').pop().slice(0, 32);
    return `img_${size}_${tail}`;
  } catch {
    return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ===================== Mock 样例（降级用） =====================
const MOCK_SAMPLES = [
  `【美团外卖】订单号 2026090214320001
商家：麻辣香锅（望京店）
支付时间：2026-09-02 12:30
实付：¥38.50
支付方式：微信支付`,
  `淘宝订单
订单号 TB20260901001
发货时间：2026-09-01 18:20
商品：vivo官方旗舰店 iQOO 5e 5G手机 8+256GB 蓝色 1件
支付宝支付成功 ￥2,999.00
收货：北京市朝阳区xxx街道xxx小区`,
  `滴滴出行 电子凭证
开始时间：2026-09-02 19:05
行程：公司 → 家
行程金额：¥25.80
已支付 25.80元，微信支付`,
  `8月工资条
基本工资：10000.00
绩效奖金：2500.00
社保公积金：-1200.00
个税：-330.00
实发工资：¥10,970.00
到账日期：2026-08-31`,
  `星巴克 消费小票
门店：望京SOHO店
时间：2026/09/02 15:20
商品：
1. 冰美式（大杯）      ¥28.00
2. 抹茶拿铁（中杯）    ¥32.00
合计：¥60.00
支付宝付款成功`,
];

let mockIndex = 0;

function mockRecognize() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const sample = MOCK_SAMPLES[mockIndex % MOCK_SAMPLES.length];
      mockIndex++;
      resolve(sample);
    }, 300 + Math.random() * 400);
  });
}

// ===================== ML Kit 真实识别 =====================

/**
 * 尝试加载 ML Kit 文字识别模块（原生端）。
 * 动态 require：未安装 / 在 Expo Go / Web 端都会抛错，调用方据此降级。
 * 只尝试一次，结果缓存。
 */
let _mlKitModule = null;
let _mlKitTried = false;
function loadMlKit() {
  if (_mlKitTried) return _mlKitModule;
  _mlKitTried = true;
  // Web 端无原生模块，直接跳过
  if (Platform.OS === 'web') return null;
  try {
    // 用变量拼接阻止 Metro 静态解析模块路径：
    // 未安装时不会在构建期报 "Unable to resolve"，而是运行时 require 抛错被 try/catch 捕获降级
    const pkgName = '@react-native-ml-kit/text-recognition';
    const mod = require(pkgName);
    const recognizer = mod?.default || mod;
    if (recognizer && typeof recognizer.recognize === 'function') {
      _mlKitModule = recognizer;
    } else {
      console.warn('[OcrService] ML Kit 模块格式不识别，降级 Mock。');
    }
  } catch (e) {
    console.warn(
      '[OcrService] ML Kit 未安装或在 Expo Go 中不可用，将使用 Mock 识别。' +
      '真实识别需要 npm i @react-native-ml-kit/text-recognition 并打 dev client。'
    );
  }
  return _mlKitModule;
}

/** 使用 ML Kit 真实识别图片文字；失败自动降级 Mock */
async function realMlKitRecognize(imageUri) {
  const recognizer = loadMlKit();
  if (!recognizer) return mockRecognize();
  try {
    // 不同版本 API 签名略有差异：优先传 languages 配置，失败则用最简签名
    let result;
    try {
      result = await recognizer.recognize(imageUri, { languages: ['zh', 'en'] });
    } catch {
      result = await recognizer.recognize(imageUri);
    }
    // 兼容不同返回结构：{ text } 或 { blocks: [{ text }] }
    let text = '';
    if (typeof result === 'string') {
      text = result;
    } else if (result?.text) {
      text = result.text;
    } else if (Array.isArray(result?.blocks)) {
      text = result.blocks.map((b) => b.text).filter(Boolean).join('\n');
    }
    return text || '';
  } catch (e) {
    console.warn('[OcrService] ML Kit 识别失败，降级 Mock：', e?.message);
    return mockRecognize();
  }
}

/** 对外暴露：当前是否在使用真实 OCR（设置页可据此展示引擎状态） */
export function isRealOcrAvailable() {
  return loadMlKit() !== null;
}

// ===================== 主流程 =====================

/**
 * 识别单张图片并解析为记账实体数组（多金额 → 多笔）
 * @param {string} imageUri 本地图片 URI
 * @returns {Promise<{rawText: string, parsed: TransactionEntry[], fromCache: boolean}>}
 */
export async function recognizeAndParse(imageUri) {
  // 1. 查缓存（相同指纹的图片直接复用解析结果）
  const hash = await computeImageFingerprint(imageUri);
  const cached = await db.OcrCacheDao.getByHash(hash);
  if (cached) {
    const parsed = Array.isArray(cached.parsedResult)
      ? cached.parsedResult.map((p) => TransactionEntry.fromParsed(p))
      : [];
    return { rawText: cached.rawText, parsed, fromCache: true };
  }

  // 2. 识别文字（ML Kit 真实 / Mock 降级）
  const rawText = await realMlKitRecognize(imageUri);

  // 3. 解析：金额 / 日期 / 类型 / 分类
  const amounts = await amountExtractor.extractAllAmounts(rawText);
  const date = await dateExtractor.extractBestDate(rawText);
  const type = await categoryMatcher.classifyType(rawText);
  const matched = await categoryMatcher.matchCategory(rawText, type);
  let categoryId = matched.categoryId;
  if (!categoryId) {
    const fallbackCats = await db.CategoryDao.listByType(type);
    categoryId = fallbackCats[0]?.id || null;
  }

  let parsed;
  if (amounts.length === 0) {
    // 抽不到金额 → 返回一条空模板实体，让用户手动填金额
    parsed = [new TransactionEntry({
      date: date || Date.now(),
      type,
      categoryId,
      amount: 0,
      description: await descriptionComposer.composeDescription(rawText, 0, matched.categoryName || '', null),
      source: TX_SOURCE.IMAGE,
      imagePaths: [imageUri],
      categoryName: matched.categoryName || '',
    })];
  } else {
    // 每个金额生成一条记账实体
    parsed = [];
    for (const amt of amounts) {
      const desc = await descriptionComposer.composeDescription(rawText, amt.value, matched.categoryName || '', amt.raw);
      parsed.push(new TransactionEntry({
        date: date || Date.now(),
        type,
        categoryId,
        amount: amt.value,
        description: desc,
        source: TX_SOURCE.IMAGE,
        imagePaths: [imageUri],
        categoryName: matched.categoryName || '',
      }));
    }
  }

  // 4. 写缓存（存纯对象，保证可序列化）
  await db.OcrCacheDao.put(hash, rawText, parsed.map((e) => e.toPlain()));
  return { rawText, parsed, fromCache: false };
}
