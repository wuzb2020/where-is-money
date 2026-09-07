# Assets 目录说明

此目录用于放置：

- icon.png (1024x1024) - App 图标
- splash.png (2048x2048) - 启动图
- adaptive-icon.png - Android 自适应图标前景
- notification-icon.png - Android 通知图标
- fonts/ - 自定义中文字体（如 PingFang SC）
- illustrations/ - SVG/PNG 插画（空状态页）
- category-icons/ - 自定义分类图标

**缺省行为**：app.json 未配置 icon/splash 时，Expo 使用默认蓝紫主题图标 + 启动背景色。
准备好了图片后替换同名文件，并在 app.json 恢复对应字段即可。
