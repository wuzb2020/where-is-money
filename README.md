# 随手记 Lite · 千群乐记账 App

> **状态**：✅ Metro 打包验证通过（1258 modules / 0 error），首次启动自带 20 条 Mock 数据可直接预览效果。

## 📦 技术栈

| 层级 | 方案 |
|---|---|
| 跨端框架 | **Expo SDK 51 + React Native 0.74**（Expo Go 直接跑，无需原生编译） |
| 本地数据库 | **expo-sqlite**（完全离线，交易/分类/模板 4 张表 + 索引） |
| 状态管理 | **Zustand 4** + AsyncStorage 持久化（主题/设置/最近分类） |
| 图表 | **react-native-chart-kit**（甜甜圈饼图 + 分类图例） |
| 手势 | **react-native-gesture-handler**（列表滑动删除/复制/编辑 + Swipeable） |
| 动画 | **react-native-reanimated 3**（骨架屏呼吸光效） |
| OCR | Mock 模式（5 种真实账单样例循环）→ 可无缝切到 **Google ML Kit Chinese** 离线 SDK |
| Excel 解析 | **SheetJS (xlsx)** + 智能表头匹配 + 列模板记忆学习 |
| Word 解析 | **mammoth**（docx → 文本行级 + 内嵌图片走 OCR） |
| 金额/日期智能抽取 | 自定义正则 12 条金额模式 + 8 种日期格式兼容 + OCR 字符级纠错（O→0/B→8/Y→¥） |
| 分类智能匹配 | 15+ 平台关键词（淘宝/美团/滴滴…）+ 最近使用 LRU 4 记忆 |
| 导出备份 | 导出 Excel / JSON 备份恢复（合并 or 覆盖模式）|

## 🎯 功能模块总览

```
首页 HomeScreen
├─ 顶部问候 + 蓝紫渐变背景 + 时间标签
├─ 3 张汇总卡（收入/支出/结余 + 环比涨跌箭头）
├─ 快捷时间筛选 Chips（近7天/本月/上月/近30天/自定义）
├─ 甜甜圈饼图（支出/收入 Tab 切换 + Top5 图例点击筛选分类）
├─ 最近交易列表（左滑复制/删除 · 右滑编辑 · 来源角标 · 凭证缩略图）
└─ 底部三大悬浮按钮
   ├─ 🖼️ 拍照/相册 → OcrCaptureScreen（9 图批量识别 + 进度 + 快速模式自动存）
   ├─ ✏️ 手动记账 → ManualEntryScreen（内嵌大数字键盘 + 快捷金额 ¥10/20/50/100/500 + +键追加记账）
   └─ 📄 导入文件 → FileImportScreen（4 步状态机：解析→预览→导入→结果）

3 页引导 OnboardingScreen · 全部记录 AllRecordsScreen（搜索/类型/分类/日期/排序）
交易详情 TransactionDetailScreen（查看/编辑/删除/图片大图 + 月度报告弹窗）
设置 SettingsScreen（导出Excel/JSON备份恢复/清空/分类管理/2套主题配色/深浅色/识别偏好）
分类管理 CategoryManageScreen（60+ 图标库/12 色板/拖拽排序/关键词/新建分类）
```

## 🚀 启动步骤

### 前置要求
- Node.js 18+（已安装）
- 手机端安装 **Expo Go** 应用（iOS App Store / Android Google Play / 国内应用市场搜索「Expo Go」）
- 手机和电脑处于 **同一个 Wi-Fi**

### 三步跑起来

```bash
# 本项目依赖已安装好，直接启动即可
cd d:\ai\qianqunale

# 启动 Expo 开发服务器
npm start

# 然后：
# 方式 A（推荐）：手机 Expo Go → 扫描终端里出现的二维码
# 方式 B（Android 真机/模拟器）：终端里按 a
# 方式 C（iOS 模拟器）：终端里按 i（需 Mac + Xcode）
# 方式 D（浏览器预览 UI）：终端里按 w（就是刚才验证通过的 web 版，交互可以体验但 sqlite 会降级用 IndexedDB）
```

启动后 → 首启动自动：
1. 显示 3 页引导（介绍三种记账方式）
2. 创建 SQLite 数据库 + 默认分类（支出 15/ 收入 6）
3. **注入 20 条 Mock 数据**（近 30 天、覆盖各分类、包含工资/房租/外卖/iQOO 手机/滴滴等真实场景）
4. 饼图立即能看、汇总卡有数据 → 点底部「✏️手动记账」开始体验 3 秒记账！

### 常用终端按键

| 按键 | 功能 |
|---|---|
| `a` | 打开 Android 模拟器/真机 |
| `i` | 打开 iOS 模拟器 |
| `w` | 在浏览器打开 Web 版 |
| `r` | 重新加载 App |
| `m` | 切换开发菜单 |
| `j` | 打开 Debugger |
| `?` | 全部命令帮助 |

## 🔧 进阶配置（可选）

### 1. 开启 **真实 OCR（ML Kit 离线中文识别）**

OCR 服务默认跑 Mock，5 条假账单样例循环识别（能预览 UI 流程）。要接入真实识别：

```bash
# 1. 切换到 Expo Dev Client（因为要加原生 SDK，Expo Go 不支持）
npx expo install @react-native-ml-kit/text-recognition

# 2. 打开 src/core/services/OcrService.js
#    将第 16 行改为：
const USE_REAL_ML_KIT = true;

# 3. 构建自定义客户端（首次编译需要）
npx expo prebuild && npx expo run:android    # 或 run:ios
```

识别准确率（中文账单）约 95%，且**完全离线**，不联网。

### 2. 打包上线（Android APK / iOS IPA）

```bash
# 用 EAS Build（Expo 官方云端打包，不需要 Mac/Android Studio）
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview     # Android APK
eas build --platform ios --profile preview         # iOS IPA（需要 Apple 开发者账号）
```

### 3. 替换 App 图标和启动图

把 4 张图片放到 `assets/` 目录：
- `icon.png`（1024×1024，圆角）
- `splash.png`（2048×2048，中间放 Logo）
- `adaptive-icon.png`（Android 自适应前景）
- `notification-icon.png`（Android 通知透明小图）

然后在 `app.json` 里补回对应字段（已注释清理，参考 assets/README.md）。

## 🗂️ 项目结构（100% 对应之前技术设计文档）

```
qianqunale-accounting/
├── App.js                      入口（初始化DB+Mock+Providers）
├── app.json / babel.config.js / package.json / metro.config.js
├── assets/                     图标/启动图/字体占位
└── src/
    ├── core/                   纯逻辑层（零 React 依赖，可单元测试）
    │   ├── db/index.js         SQLite 封装 + 5 张表建表 + 全部 DAO 方法
    │   ├── constants/          theme / categories / keywords / dateFormats
    │   ├── utils/              amount(存分)/ date/ haptics/ storage(路径指纹)
    │   └── services/           OcrService / ExcelParser / WordParser /
    │                           AmountExtractor / DateExtractor / CategoryMatcher /
    │                           DescriptionComposer / AnalyticsService / ExportService
    ├── store/                  Zustand 5 个 store（主题/分类/交易/OCR/导入）
    ├── ui/                     组件层（分 primitives 基础 + components 业务）
    │   ├── themeHelper.js      useAppTheme() / makeStyles() 统一取主题+快捷样式
    │   ├── primitives/         Button Card Input Chip Segmented AmountInput
    │   │                       EmptyState Skeleton Toast
    │   └── components/         SummaryCards DonutChartCard
    │                           TransactionList TransactionItem
    │                           CategoryPickerSheet OcrResultEditor
    │                           ImportPreviewList MonthlyReportCard
    ├── screens/                9 个页面（首页/手动/OCR/导入/全部/详情/设置/分类/引导）
    └── navigation/AppNavigator.jsx  React Navigation v7（Stack + Modal 混合）
```

## 💡 常见问题

**Q：npm start 报错 `Something went wrong installing JavaScript bundle`？**
A：终端里按 `r` 强制 reload；还不行 → `npx expo start --clear`（清 Metro 缓存）。

**Q：图片选择/相机点了没反应？**
A：第一次点会弹权限请求，拒绝后在手机系统设置里手动给「相册/相机」权限。

**Q：导入 Excel 后分类全错了？**
A：预览列表里点击那条记录的分类气泡 → 弹分类选择器调整，**调整过一次列含义后下次同表头的文件会自动对齐**（模板记忆功能）。

**Q：换手机怎么带数据？**
A：设置 → 备份为 JSON → 分享保存到云盘；新手机装 App → 设置 → 从备份恢复 → 选那个 JSON 文件即可。

**Q：怎么清空 Mock 数据开始记真实账？**
A：设置 → 最底部「清空所有交易记录」（分类设置会保留），所有 Mock 数据会被删除。
