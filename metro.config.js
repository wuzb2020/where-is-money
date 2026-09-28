const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);

// 屏蔽小程序子工程（Taro），不进入 RN 打包图（"." 同时匹配 / 与 \ 分隔符）
config.resolver.blockList = exclusionList([/miniprogram./]);

// 兼容 xlsx / mammoth 的 cjs 模块
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs', 'mjs'];
config.resolver.assetExts = [...config.resolver.assetExts, 'bin'];

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
