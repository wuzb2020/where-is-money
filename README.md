# 钱去哪了 · 千群乐记账 App

> **状态**：✅ Metro 打包验证通过（1258 modules / 0 error），首启动即为空账本，不注入任何 Mock/演示数据。

## 📦 技术栈

| 层级 | 方案 |
|---|---|
| 跨端框架 | **Expo SDK 51 + React Native 0.74**（Expo Go 直接跑，无需原生编译） |
| 本地数据库 | **expo-sqlite**（完全离线，交易/分类/模板 4 张表 + 索引） |
| 状态管理 | **Zustand 4** + AsyncStorage 持久化（主题/设置/最近分类） |
| 图表 | **react-native-chart-kit**（甜甜圈饼图 + 分类图例） |
| 手势 | **react-native-gesture-handler**（列表滑动删除/复制/编辑 + Swipeable） |
| 动画 | **react-native-reanimated 3**（骨架屏呼吸光效） |
| OCR | 真实识别：原生 **Google ML Kit Chinese** 离线 SDK；Web 端 **Tesseract.js**（多策略+图像预处理）；环境不可用时直接抛错 |
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
2. 创建 SQLite 数据库 + 默认分类（支出 16/ 收入 6）
3. **不注入任何演示数据**，账本为空 → 点底部「🖼️拍照/相册」或「✏️手动记账」开始记第一笔！

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

### 1. 真实 OCR 说明

OCR 全部为真实识别，无任何假数据降级：

- **原生 App（自定义 Dev/Release 构建）**：Google ML Kit 中文离线识别，完全离线、不联网。
  需要原生模块，请使用 Dev Client 而非 Expo Go：

```bash
npx expo install @react-native-ml-kit/text-recognition
npx expo prebuild && npx expo run:android    # 或 run:ios
```

- **Web 预览**：Tesseract.js（chi_sim 语言包），内置缩放/灰度/二值化预处理与多策略识别。
- **Expo Go**：无原生 ML Kit 模块，识别会直接抛错，页面展示真实失败原因与重试入口（绝不造假数据）。

### 2. 本地构建 Android APK（含悬浮球等原生功能）

> ⚠️ 悬浮球等手写原生代码已提交到 `android/` 目录，**本地构建才能包含原生功能**。
> GitHub Actions 的 `expo prebuild --clean` 会抹掉原生代码，故 CI 构建的包不含悬浮球。

#### 前置准备（首次构建必做）

**① 把 Gradle 缓存迁移到 D 盘**（C 盘空间不足时必须，否则 `java.io.IOException: 磁盘空间不足`）

```powershell
New-Item -ItemType Directory -Force -Path "D:\gradle-home" | Out-Null
$env:GRADLE_USER_HOME = "D:\gradle-home"
```

> 每次新开终端构建都要重新设置 `$env:GRADLE_USER_HOME`，或永久设置：
> 「系统属性 → 环境变量 → 新建用户变量 `GRADLE_USER_HOME` = `D:\gradle-home`」

**② 配置阿里云 Maven 镜像**（已写入 `android/build.gradle`，国内网络下载依赖快 10 倍）

镜像地址已配置在 `android/build.gradle` 的 `buildscript.repositories` 和 `allprojects.repositories` 中：
```gradle
maven { url 'https://maven.aliyun.com/repository/google' }
maven { url 'https://maven.aliyun.com/repository/central' }
maven { url 'https://maven.aliyun.com/repository/public' }
```

**③ 网络超时配置**（已写入 `android/gradle.properties`）

```properties
systemProp.org.gradle.internal.http.connectionTimeout=120000
systemProp.org.gradle.internal.http.socketTimeout=120000
```

#### 构建命令

**Debug 包**（含调试符号，体积大 ~210MB，适合开发调试）：

```powershell
cd d:\ai\qianqunale\android
$env:GRADLE_USER_HOME = "D:\gradle-home"
.\gradlew.bat assembleDebug --no-daemon
```

**Release 包**（strip 调试符号 + PNG 压缩，体积小 ~100MB，和 CI 一致）：

```powershell
cd d:\ai\qianqunale\android
$env:GRADLE_USER_HOME = "D:\gradle-home"
.\gradlew.bat assembleRelease --no-daemon
```

#### 产物路径

| 构建类型 | 路径 |
|---|---|
| Debug | `android\app\build\outputs\apk\debug\app-debug.apk` |
| Release | `android\app\build\outputs\apk\release\app-release.apk` |

#### 安装到手机

```powershell
# 覆盖安装（保留本地数据，推荐）
adb install -r "d:\ai\qianqunale\android\app\build\outputs\apk\debug\app-debug.apk"
```

> ⚠️ 若报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，是签名不一致。**不要卸载**（会清空记账数据），
> 先在 App 内导出 JSON 备份，再处理。

#### Debug vs Release 体积差异说明

Debug 包比 Release 包大 100MB+ 是正常现象：

| 对比项 | Debug APK | Release APK |
|---|---|---|
| 原生库 .so | 保留完整符号表（未 strip） | strip 调试符号，体积缩水 3-5 倍 |
| JS Bundle | Metro 打包，未压缩 | Hermes 编译为优化字节码 |
| PNG 资源 | 不压缩 | `crunchPngs=true` 压缩 |
| 调试代码 | 包含调试断言、DevSupport | 剥离 |

#### 构建常见问题

| 问题 | 解决 |
|---|---|
| `Could not read workspace metadata ... metadata.bin` | 删除 `%GRADLE_USER_HOME%\caches\8.8\transforms` 后重试 |
| `java.io.IOException: 磁盘空间不足` | C 盘至少留 5GB，或设置 `GRADLE_USER_HOME` 到 D 盘 |
| `Read timed out`（Maven 下载超时） | 确认 `android/build.gradle` 已配置阿里云镜像 |
| `NDK 25.1 is corrupted` | `gradle.properties` 已指定 `android.ndkVersion=26.1.10909125` |
| **APK 安装后代码没变化（JS 改动不生效）** | Gradle 把 `bundleReleaseJsAndAssets` 标为 UP-TO-DATE，旧 bundle 没重打。构建时加 `--rerun-tasks` 强制所有任务重跑，或先删除 `android/app/build/intermediates/assets` |
| **手机安装后提示「已是最新版本」，实际是旧包** | `versionCode` 没变，系统认为是同一版本。每次交付前递增 `android/app/build.gradle` 里的 `versionCode` |

#### 构建后验证（必做！避免装了旧包还以为没修好）

每次构建完成后，**先验证 APK 确实包含了最新代码**，再传到手机安装：

```powershell
# 1. 确认 APK 时间戳是刚刚生成的
Get-Item "android\app\build\outputs\apk\release\app-release.apk" | Select-Object LastWriteTime, Length

# 2. 验证 JS bundle 包含了本次新增的关键字（例如此次新增的 flexBasis 样式）
#    如果返回 0 匹配，说明 bundle 是旧的，必须重新构建
Select-String -Path "android\app\build\intermediates\assets\release\index.android.bundle" -Pattern "flexBasis" | Measure-Object
```

只有关键字能在 bundle 里搜到、APK 时间戳是最新的，才说明构建产物正确。

### 3. 云端打包（EAS Build，不含原生悬浮球）

```bash
# 用 EAS Build（Expo 官方云端打包，不需要 Mac/Android Studio）
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview     # Android APK
eas build --platform ios --profile preview         # iOS IPA（需要 Apple 开发者账号）
```

> ⚠️ EAS 云端构建会执行 `expo prebuild`，抹掉 `android/` 目录下的手写原生代码，
> **不包含悬浮球功能**。需要悬浮球请用本地构建。

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
├── App.js                      入口（初始化DB+Providers，不注入演示数据）
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

**Q：怎么清空所有交易记录重新开始？**
A：设置 → 最底部「清空所有交易记录」（分类设置会保留），全部交易记录会被删除。
