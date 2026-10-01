// 图片外置仓库（原生/默认实现）：
// 原生端图片走文件系统（persistImageToLocal 用 expo-file-system 拷贝），本模块全部透传。
// Web 端解析为 blobStore.web.js：IndexedDB 存 dataURI/blob，业务库（localStorage）只存 idb:// 引用。
import { Platform } from 'react-native';

export const IDB_REF_PREFIX = 'idb://images/';

export function isExternalRef(uri) {
  return typeof uri === 'string' && uri.startsWith(IDB_REF_PREFIX);
}

/** 把 data/blob URI 外置持久化，返回引用；非内联 URI（http/文件路径/引用）原样返回 */
export async function externalizeImage(uri) {
  return uri;
}

/** 引用 → 可渲染 URI；非引用原样返回 */
export async function resolveImage(uri) {
  return uri;
}

export const isWebImageStore = Platform.OS === 'web';
