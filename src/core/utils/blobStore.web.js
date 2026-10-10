// 图片外置仓库（Web 实现）：
// localStorage 单 key 配额仅 5MB 级，expo-image-picker 在 web 端返回的是 base64 dataURI，
// 直接随交易记录入库必爆 QuotaExceededError。改为：
//  - 图片内容（dataURI 字符串）存 IndexedDB（配额通常数百 MB，浏览器持久化）
//  - 业务对象的 imagePaths 只存 idb://images/<uuid> 短引用
//  - 显示时 resolveImage(ref) 取回 dataURI（内存缓存 objectURL/dataURI）
// 注意：不能从 './blobStore' 导入——web 平台扩展会把它解析回本文件造成循环依赖
export const IDB_REF_PREFIX = 'idb://images/';

export function isExternalRef(uri) {
  return typeof uri === 'string' && uri.startsWith(IDB_REF_PREFIX);
}

export const isWebImageStore = true;

const DB_NAME = 'qqn_blob_store';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES); // keyPath 由 put(key, value) 指定
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
  });
  return dbPromise;
}

function tx(mode) {
  return openDB().then((db) => db.transaction(STORE_IMAGES, mode).objectStore(STORE_IMAGES));
}

function idbPut(key, value) {
  return new Promise((resolve, reject) => {
    tx('readwrite').then((store) => {
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }).catch(reject);
  });
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    tx('readonly').then((store) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(reject);
  });
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// resolve 结果缓存：同一引用不重复读 IDB
const cache = new Map();

/**
 * 外置内联图片（data: / blob:）→ idb:// 引用
 * http(s) / 文件路径 / 已是引用 → 原样返回
 */
export async function externalizeImage(uri) {
  if (typeof uri !== 'string') return uri;
  if (uri.startsWith(IDB_REF_PREFIX) || /^https?:\/\//.test(uri)) return uri;
  if (!uri.startsWith('data:') && !uri.startsWith('blob:')) return uri;
  const key = uuid();
  await idbPut(key, uri);
  return `${IDB_REF_PREFIX}${key}`;
}

/** idb:// 引用 → 可渲染 URI（dataURI），其余原样返回 */
export async function resolveImage(uri) {
  if (typeof uri !== 'string' || !uri.startsWith(IDB_REF_PREFIX)) return uri;
  if (cache.has(uri)) return cache.get(uri);
  const key = uri.slice(IDB_REF_PREFIX.length);
  const value = await idbGet(key);
  if (value == null) return uri; // 图片已被清掉时退回引用（渲染失败显示占位）
  cache.set(uri, value);
  return value;
}
