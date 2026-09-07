const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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
