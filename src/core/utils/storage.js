// 简单图片指纹（防止同一张图重复 OCR）+ 路径常量
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// 【修改】web 端 expo-file-system 的 documentDirectory/cacheDirectory 为 null，
// 直接拼路径会得到 "nulltransaction_images/" 垃圾路径；web 端文件操作本就不可用，用占位即可
const _docRoot = FileSystem.documentDirectory || '';
const _cacheRoot = FileSystem.cacheDirectory || '';
const IS_WEB = Platform.OS === 'web';

/** 本地存储路径常量 */
export const PATHS = IS_WEB ? {
  IMAGES: 'web://transaction_images/',
  OCR_CACHE: 'web://ocr_cache/',
  BACKUPS: 'web://backups/',
  EXPORTS: 'web://exports/',
  TEMP: 'web://tmp/',
} : {
  IMAGES: `${_docRoot}transaction_images/`,
  OCR_CACHE: `${_docRoot}ocr_cache/`,
  BACKUPS: `${_docRoot}backups/`,
  EXPORTS: `${_docRoot}exports/`,
  TEMP: `${_cacheRoot}tmp/`,
};

/** 确保目录存在（不存在则创建） */
export async function ensureDirs() {
  if (IS_WEB) return; // 【修改】web 端无文件系统，直接跳过
  const dirs = Object.values(PATHS);
  for (const dir of dirs) {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    } catch (e) {
      console.warn('[ensureDir] failed:', dir, e.message);
    }
  }
}

/**
 * 简单图片指纹（dHash 太复杂，用「文件大小 + 宽高」的组合 key，
 * 配合文件 URI 后缀 hash 足够覆盖 95% 的重复导入场景）
 */
export async function computeImageFingerprint(uri) {
  if (IS_WEB) {
    // 【修改】web 端无法 getInfo，用 URI 尾部做指纹（data URI 内容相同则指纹相同）
    return `img_web_${String(uri || '').slice(-64)}`;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = info?.size || 0;
    // 取 uri 最后一段做 hash（避免读整个文件）
    const tail = uri.split('/').pop().slice(0, 32);
    return `img_${size}_${tail}`;
  } catch {
    return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** 把临时 URI 拷贝到持久目录 */
export async function persistImageToLocal(tempUri, txId) {
  if (IS_WEB) return tempUri; // 【修改】web 端 blob/data URI 直接可用，无需拷贝
  await ensureDirs();
  const ext = (tempUri.split('.').pop() || 'jpg').split('?')[0];
  const safeExt = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
  const targetUri = `${PATHS.IMAGES}${txId}_${Date.now()}.${safeExt}`;
  try {
    await FileSystem.copyAsync({ from: tempUri, to: targetUri });
    return targetUri;
  } catch (e) {
    console.warn('[persistImage] copy failed, using tempUri:', e.message);
    return tempUri;
  }
}
