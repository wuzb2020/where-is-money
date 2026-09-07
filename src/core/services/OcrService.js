// OCR 服务：
// - 默认运行在 MOCK 模式（无需原生SDK，直接返回假数据，保证 App 先跑通）
// - 真实环境：注释里给出 Google ML Kit 集成代码，装上 @react-native-ml-kit/text-recognition 后替换即可
import { OcrCacheDao, CategoryDao } from '../db';
import { computeImageFingerprint } from '../utils/storage';
import { extractAllAmounts, extractPrimaryAmount } from './AmountExtractor';
import { extractBestDate } from './DateExtractor';
import { classifyType, matchCategory } from './CategoryMatcher';
import { composeDescription } from './DescriptionComposer';

/** MOCK 模式：返回一些模拟的识别文本样例 */
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

/** 真实 OCR（ML Kit）—— 占位，有 SDK 时启用 */
async function realMlKitRecognize(imageUri) {
  // try {
  //   const TextRecognition = require('@react-native-ml-kit/text-recognition').default;
  //   await require('@react-native-ml-kit/text-recognition-chinese'); // 加载中文包
  //   const result = await TextRecognition.recognize(imageUri, { languages: ['zh', 'en'] });
  //   return result.text || '';
  // } catch (e) {
  //   console.warn('[MLKit] failed, fallback to mock:', e.message);
  //   return mockRecognize(imageUri);
  // }
  return mockRecognize(imageUri);
}

/** Mock 识别（纯随机样例，300ms 延迟模拟耗时） */
function mockRecognize(/* imageUri */) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const sample = MOCK_SAMPLES[mockIndex % MOCK_SAMPLES.length];
      mockIndex++;
      resolve(sample);
    }, 300 + Math.random() * 400);
  });
}

const USE_REAL_ML_KIT = false; // TODO: 集成 SDK 后改 true

/**
 * 识别单张图片并解析为交易数组（多金额多笔）
 * @returns {Promise<{rawText: string, parsed: ParsedTx[]}>}
 */
export async function recognizeAndParse(imageUri) {
  // 1. 查缓存
  const hash = await computeImageFingerprint(imageUri);
  const cached = await OcrCacheDao.getByHash(hash);
  if (cached) {
    return { rawText: cached.rawText, parsed: cached.parsedResult, fromCache: true };
  }

  // 2. 识别文字
  const rawText = USE_REAL_ML_KIT
    ? await realMlKitRecognize(imageUri)
    : await mockRecognize(imageUri);

  // 3. 抽取多个金额 → 每条生成一条记录
  const amounts = await extractAllAmounts(rawText);
  const date = await extractBestDate(rawText);
  const type = await classifyType(rawText);
  const matched = await matchCategory(rawText, type);
  let categoryId = matched.categoryId;
  // 【修改】未命中分类时按类型取默认分类兜底（transactions.category_id 为 NOT NULL，
  // 旧代码把 null 透传给 DAO，原生端插入会直接抛约束错误）
  if (!categoryId) {
    const fallbackCats = await CategoryDao.listByType(type);
    categoryId = fallbackCats[0]?.id || null;
  }

  if (amounts.length === 0) {
    // 抽不到金额 → 返回一条空模板，让用户手动填
    const parsed = [{
      date: date || Date.now(),
      type,
      categoryId,
      amount: 0,
      description: (await composeDescription(rawText, 0, matched.categoryName || '', null)),
      source: 'image',
      imagePaths: [imageUri],
    }];
    return { rawText, parsed };
  }

  const parsed = [];
  for (const amt of amounts) {
    // 【修改】透传分类名与金额原文 raw，描述摘要才能带上分类前缀、商品名定位才命中
    const desc = await composeDescription(rawText, amt.value, matched.categoryName || '', amt.raw);
    parsed.push({
      date: date || Date.now(),
      type,
      categoryId,
      amount: amt.value,
      description: desc,
      source: 'image',
      imagePaths: [imageUri],
    });
  }

  // 4. 写缓存
  await OcrCacheDao.put(hash, rawText, parsed);
  return { rawText, parsed };
}
