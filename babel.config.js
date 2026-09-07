module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      // 注意：去掉了 module-resolver，因为 Windows Metro 与 Babel 双解析会冲突
      // jsconfig.json 里的路径别名仅用于 IDE 智能提示，运行时全部走相对路径
    ],
  };
};
