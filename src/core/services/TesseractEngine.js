/**
 * Tesseract 引擎占位实现（仅原生端）。
 *
 * 原生端（iOS/Android）OCR 使用 Google ML Kit，不需要 Tesseract.js；
 * 此文件让 OcrService 中的静态 import 在原生平台有可解析的模块，
 * Web 平台则通过 .web.js 扩展解析到真实的 TesseractEngine.web.js。
 */
export async function recognize() {
  return '';
}

export function isTesseractAvailable() {
  return false;
}
