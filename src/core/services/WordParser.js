// Word 解析（mammoth）：文本段落抽记录 + 内嵌图片交给 OCRService
// 【修改】真实文件解析失败时必须抛错给上层提示，绝不允许把内置 Mock 样例冒充用户文件结果入库
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { recognizeAndParse } from './OcrService';
import { extractPrimaryAmount } from './AmountExtractor';
import { extractBestDate } from './DateExtractor';
import { classifyType, matchCategory } from './CategoryMatcher';
import { composeDescription } from './DescriptionComposer';
import { PATHS, ensureDirs } from '../utils/storage';

/** 文本段落 → 候选交易（含金额的段落才算） */
async function parseParagraphToCandidate(text) {
  if (!text || text.trim().length < 4) return null;
  const amount = await extractPrimaryAmount(text);
  if (!amount) return null;
  const date = await extractBestDate(text);
  const type = await classifyType(text);
  const cat = await matchCategory(text, type);
  const description = await composeDescription(text, amount.value, cat.categoryName, amount.raw); // 【修改】透传金额原文
  return {
    date: date || Date.now(),
    type,
    categoryId: cat.categoryId,
    amount: amount.value,
    description,
    source: 'file',
    imagePaths: [],
  };
}

/**
 * 真实 mammoth 解析（RN 端需要 Blob/Buffer 支持，可能降级）
 * 成功返回 {text, images: []}，失败抛错
 */
async function realMammothParse(fileUri) {
  // 【修改】web 端 expo-file-system 不可用，直接给出友好错误
  if (Platform.OS === 'web') {
    throw new Error('Word 解析仅支持手机 App 端，请在手机上导入 .docx 文件');
  }
  let mammoth;
  try {
    // 【修改】修正重复动态 import：先取 default，没有再用命名空间
    const mod = await import('mammoth');
    mammoth = mod.default || mod;
  } catch (e) {
    throw new Error('Word 解析组件未安装（mammoth）');
  }
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // 【修改】Hermes/RN 不保证全局 atob 存在，用手写 base64 解码兜底
  const binary = typeof atob === 'function'
    ? atob(base64)
    : decodeBase64Fallback(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const arrayBuffer = bytes.buffer;

  const result = await mammoth.extractRawText({ arrayBuffer });
  // mammoth 在 RN 环境拿不到图片（依赖 Node buffer）
  return { text: result.value || '', images: [] };
}

/** base64 解码兜底（无 atob 环境） */
function decodeBase64Fallback(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let str = b64.replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  for (let i = 0; i < str.length; i += 4) {
    const n = (chars.indexOf(str[i]) << 18) | (chars.indexOf(str[i + 1]) << 12) |
      ((chars.indexOf(str[i + 2]) & 63) << 6) | (chars.indexOf(str[i + 3]) & 63);
    out += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return out.replace(/\0+$/, '');
}

export async function parseWord(fileUri) {
  let parseResult;
  try {
    parseResult = await realMammothParse(fileUri);
  } catch (e) {
    // 【修改 P1】解析失败直接抛错给上层（useImportStore 会进入错误结果页），
    // 绝不能把内置样例当用户文件结果——否则假账会被确认入库
    throw new Error(e.message || 'Word 文件解析失败，请确认是 .docx 格式');
  }
  const { text, images } = parseResult;

  const previewRows = [];
  // 文本记录：按换行拆分段落
  const paragraphs = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  for (const p of paragraphs) {
    const candidate = await parseParagraphToCandidate(p);
    if (candidate) previewRows.push(candidate);
  }

  // 图片 → OCR（并发 2）
  await ensureDirs();
  let imageResults = [];
  if (images && images.length > 0) {
    for (let i = 0; i < images.length; i += 2) {
      const batch = images.slice(i, i + 2);
      const batchResults = await Promise.all(batch.map(async (img) => {
        try {
          // 【修改】只有真实存在的图片路径/缓冲才识别，避免对从未写入的 tmpPath 调 OCR
          if (img.path) return recognizeAndParse(img.path);
          if (img.buffer) {
            const tmpPath = `${PATHS.TEMP}word_img_${Date.now()}_${i}.${img.contentType?.includes('png') ? 'png' : 'jpg'}`;
            await FileSystem.writeAsStringAsync(tmpPath, img.buffer, { encoding: FileSystem.EncodingType.Base64 });
            return recognizeAndParse(tmpPath);
          }
          return { parsed: [] };
        } catch {
          return { parsed: [] };
        }
      }));
      imageResults = imageResults.concat(batchResults);
    }
  }
  for (const r of imageResults) {
    for (const p of r.parsed) previewRows.push(p);
  }

  return { previewRows, totalTextRows: paragraphs.length, totalImages: images?.length || 0 };
}
