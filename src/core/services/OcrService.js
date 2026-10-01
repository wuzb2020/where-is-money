/**
 * OCR 服务：图片 → 文字 → 解析为记账实体数组
 *
 * 识别引擎（按平台选择，全部为真实识别，无任何 mock 降级）：
 *  1) Web：Tesseract.js（WASM，浏览器内真实识别；引擎内含多尺度/二值化/多 PSM 策略，
 *     首次运行需从 CDN 下载语言包）
 *  2) 原生端（iOS/Android dev build）：Google ML Kit 文字识别（离线、免费）
 *  3) Expo Go / 未装 ML Kit：识别直接抛错，由页面展示失败原因与重试入口（绝不造假数据）
 *
 * ML Kit 含原生代码，无法在 Expo Go 中运行。要使用真实识别需：
 *   npm i @react-native-ml-kit/text-recognition
 *   npx expo prebuild && npx expo run:android   （或 EAS build dev client）
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
// 命名空间导入（live binding）：Metro 会正确填充 _dependencyMap，
// 且 live binding 在循环依赖 / HMR 下比解构导入更健壮
import * as db from '../db';
import * as amountExtractor from './AmountExtractor';
import * as dateExtractor from './DateExtractor';
import * as categoryMatcher from './CategoryMatcher';
import * as descriptionComposer from './DescriptionComposer';
// ML Kit 真实识别（静态导入，Metro 才能把模块打进 dev client bundle）。
// 纯 JS 层：Expo Go 中原生模块缺失时得到的是 Proxy，调用时抛真实 LINKING_ERROR；
// web 端导入无副作用（NativeModules.TextRecognition 为空 → Proxy），且不会被调用。
import MlKitTextRecognition from '@react-native-ml-kit/text-recognition';
// Web 平台解析为 TesseractEngine.web.js（真实 Tesseract.js）；原生端为占位实现
import * as tesseractEngine from './TesseractEngine';
import TransactionEntry, { TX_SOURCE } from '../entities/TransactionEntry';
import { dayStart } from '../utils/date';
import { persistImageToLocal } from '../utils/storage';

/**
 * 图片指纹：用于 OCR 缓存去重。
 * 内联实现避免跨模块导入导致的加载顺序问题。
 * - web 端：取 URI 尾部（data URI 内容相同则指纹相同）
 * - 原生端：文件大小 + URI 尾部
 * 前缀 CACHE_VERSION：识别/解析策略升级后旧缓存（可能含错误结果）自动失效。
 */
const CACHE_VERSION = 'v3';

async function computeImageFingerprint(uri) {
  if (Platform.OS === 'web') {
    return `img_${CACHE_VERSION}_web_${String(uri || '').slice(-64)}`;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = info?.size || 0;
    const tail = String(uri).split('/').pop().slice(0, 32);
    return `img_${CACHE_VERSION}_${size}_${tail}`;
  } catch {
    // 指纹失败时用随机值：宁可重复识别，也不能让不同图片共享缓存
    return `img_${CACHE_VERSION}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * OCR 识别前的图片预处理：缩放到安全宽度并转存为本地 JPEG。
 *
 * 为什么必须做：
 *  - 相册原图普遍 4000x3000（ARGB_8888 约 48MB/张），高像素机型更大；
 *  - ML Kit 原生端 InputImage.fromFilePath → MediaStore.Images.Media.getBitmap
 *    会「全尺寸、无降采样」解码原图，极易抛 OutOfMemoryError；
 *  - OutOfMemoryError 属于 Error，而原生模块只 catch(IOException) 捕获不到，
 *    未捕获异常直接导致 app 闪退（release APK 上表现为选完图就退出）。
 *
 * OCR 识别小票文字无需原始分辨率，宽度压到 1280 后：
 *  - 最坏情况（竖图 1280x1707）解码约 8.7MB，彻底避开 OOM；
 *  - expo-image-manipulator 内部对 resize 做了 inSampleSize 降采样，
 *    其自身处理大图也不会 OOM。
 *
 * web 端不压缩原图：Tesseract 引擎需要多尺度图像（含放大/缩小），由引擎内部处理。
 */
const OCR_MAX_WIDTH = 1280;

async function prepareImageForOcr(uri) {
  if (Platform.OS === 'web') return uri;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: OCR_MAX_WIDTH } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri || uri;
  } catch (e) {
    console.warn('[OcrService] 图片预处理失败，回退原图：', e?.message);
    return uri;
  }
}

// ===================== ML Kit 真实识别 =====================

/**
 * 获取 ML Kit 文字识别器（原生端）。
 * - Dev/Release 构建（含原生模块）：返回真实 recognizer
 * - Expo Go：原生模块缺失，库导出的是会抛 LINKING_ERROR 的 Proxy；
 *   访问 recognize 时抛错被捕获，返回 null，由上层抛真实错误提示
 * - Web：直接返回 null（web 走 Tesseract 链路）
 * 只检测一次，结果缓存。
 */
let _mlKitModule = null;
let _mlKitTried = false;
function loadMlKit() {
  if (_mlKitTried) return _mlKitModule;
  _mlKitTried = true;
  if (Platform.OS === 'web') return null;
  try {
    const recognizer = MlKitTextRecognition?.default || MlKitTextRecognition;
    if (recognizer && typeof recognizer.recognize === 'function') {
      _mlKitModule = recognizer;
    } else {
      console.warn('[OcrService] ML Kit 模块格式不识别。');
    }
  } catch (e) {
    console.warn(
      '[OcrService] ML Kit 在当前环境不可用（Expo Go 或原生模块未链接）：' + e?.message
    );
  }
  return _mlKitModule;
}

/** 使用 ML Kit 真实识别图片文字；引擎不可用或识别失败时抛错（无 mock 降级） */
async function realMlKitRecognize(imageUri) {
  const recognizer = loadMlKit();
  if (!recognizer) {
    throw new Error('当前环境不支持真实文字识别（Expo Go 或未安装 ML Kit），请使用 dev client 构建');
  }
  // 库 API：recognize(uri, script)，script 必须是字符串枚举
  // （'Latin' | 'Chinese' | 'Japanese' | 'Korean' | 'Devanagari'），
  // 不是 { languages } 对象。中文账单必须用 Chinese 识别器
  // （bundled 模型随 APK 分发、完全离线），Latin 识别器读不出汉字。
  let result;
  try {
    result = await recognizer.recognize(imageUri, 'Chinese');
  } catch (e1) {
    console.warn('[OcrService] Chinese 识别失败，尝试 Latin：', e1?.message);
    result = await recognizer.recognize(imageUri, 'Latin');
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
  if (!text || !text.trim()) {
    throw new Error('未从图片中识别到文字，请换一张更清晰的图片');
  }
  return text;
}

/** 对外暴露：当前是否在使用真实 OCR（设置页可据此展示引擎状态） */
export function isRealOcrAvailable() {
  if (Platform.OS === 'web') return tesseractEngine.isTesseractAvailable();
  return loadMlKit() !== null;
}

// ===================== Web：Tesseract.js 真实识别 =====================

/**
 * Web 端使用 Tesseract.js 真实识别图片文字。
 * 引擎内部已做多尺度/二值化/多 PSM 重试；整体仍失败时直接抛错，绝不返回假文本。
 */
async function webTesseractRecognize(imageUri) {
  if (!tesseractEngine.isTesseractAvailable()) {
    throw new Error('浏览器不支持 Tesseract 文字识别引擎');
  }
  const { texts, text } = await tesseractEngine.recognize(imageUri);
  if (!text || !text.trim()) {
    throw new Error('未从图片中识别到文字，请换一张更清晰的图片');
  }
  // texts：各策略独立文本（金额投票用）；text：合并文本（其他字段用）
  return { texts, text };
}

// ===================== 主流程 =====================

/**
 * 识别单张图片并解析为记账实体数组（多金额 → 多笔）
 * @param {string} imageUri 本地图片 URI
 * @returns {Promise<{rawText: string, parsed: TransactionEntry[], fromCache: boolean}>}
 */
export async function recognizeAndParse(imageUri) {
  // 1. 查缓存（相同指纹的图片直接复用解析结果；指纹基于原图）
  const hash = await computeImageFingerprint(imageUri);
  const cached = await db.OcrCacheDao.getByHash(hash);
  if (cached) {
    const parsed = Array.isArray(cached.parsedResult)
      ? cached.parsedResult.map((p) => TransactionEntry.fromParsed(p))
      : [];
    return { rawText: cached.rawText, parsed, fromCache: true };
  }

  // 2. 预处理：压缩图片，避免 ML Kit 全尺寸解码原图触发 OOM 闪退
  const safeUri = await prepareImageForOcr(imageUri);

  // 3. 识别文字：Web 用 Tesseract.js（多策略真实识别）/ 原生用 ML Kit；失败抛错
  let rawText;
  let strategyTexts = null;
  if (Platform.OS === 'web') {
    const r = await webTesseractRecognize(safeUri);
    rawText = r.text;
    strategyTexts = r.texts;
  } else {
    rawText = await realMlKitRecognize(safeUri);
  }

  // 4. 解析：金额 / 日期 / 类型 / 分类
  // 金额：web 多策略各自提取后跨策略投票，剔除「丢小数点」噪声（17.05 → 1705）；
  // 原生单文本走原路径（投票函数单策略时原样返回）
  let amounts;
  if (strategyTexts && strategyTexts.length > 0) {
    const perStrategy = [];
    for (const t of strategyTexts) {
      perStrategy.push(await amountExtractor.extractAllAmounts(t));
    }
    amounts = amountExtractor.mergeAmountsByVote(perStrategy);
  } else {
    amounts = await amountExtractor.extractAllAmounts(rawText);
  }

  // 凭证图片引用化：web 端把大图 dataURI 外置到 IndexedDB，实体只存 idb:// 引用
  // （OCR 缓存随之只存引用，不撑 localStorage）；原生端保持原图 URI（入库时 store 层拷贝）
  const imageRef = Platform.OS === 'web'
    ? await persistImageToLocal(imageUri, `ocr_${hash.slice(-16)}`)
    : imageUri;

  // 记账日期只精确到天：识别出的时间部分（时分）统一丢弃；缺日期时取今天
  const txDate = dayStart((await dateExtractor.extractBestDate(rawText)) || Date.now());
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
      date: txDate,
      type,
      categoryId,
      amount: 0,
      description: await descriptionComposer.composeDescription(rawText, 0, matched.categoryName || '', null),
      source: TX_SOURCE.IMAGE,
      imagePaths: [imageRef],
      categoryName: matched.categoryName || '',
    })];
  } else {
    // 每个金额生成一条记账实体
    parsed = [];
    for (const amt of amounts) {
      const desc = await descriptionComposer.composeDescription(rawText, amt.value, matched.categoryName || '', amt.raw);
      parsed.push(new TransactionEntry({
        date: txDate,
        type,
        categoryId,
        amount: amt.value,
        description: desc,
        source: TX_SOURCE.IMAGE,
        imagePaths: [imageRef],
        categoryName: matched.categoryName || '',
      }));
    }
  }

  // 4. 写缓存（存纯对象，保证可序列化）
  await db.OcrCacheDao.put(hash, rawText, parsed.map((e) => e.toPlain()));
  return { rawText, parsed, fromCache: false };
}
