import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Share as RnShare, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Card from '../ui/primitives/Card';
import Chip from '../ui/primitives/Chip';
import Button from '../ui/primitives/Button';
import SegmentedControl from '../ui/primitives/SegmentedControl';
import Switch from '../ui/primitives/Switch';
import ConfirmDialog from '../ui/primitives/ConfirmDialog';
import Toast from '../ui/primitives/Toast';
import { useThemeStore } from '../store/useThemeStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { exportBackupJson, exportToExcel, importBackupJson, shareFile } from '../core/services/ExportService';
import { getMonthlyReport } from '../core/services/AnalyticsService';
import { dayjs } from '../core/utils/date';
import * as Haptic from '../core/utils/haptics';

/**
 * 设置页：数据管理/分类管理/主题/通知/关于
 */
export default function SettingsScreen({ navigation }) {
  const { theme, insets, isDark } = useAppTheme();
  const styles = useStyles();

  const s = useThemeStore();
  const txStore = useTransactionStore();
  const [recordCount, setRecordCount] = React.useState(0);
  const [busy, setBusy] = React.useState(''); // '' | 'excel' | 'backup'
  // 统一确认弹窗：null | 'restore' | 'overwrite' | 'clear'
  const [dialog, setDialog] = React.useState(null);

  React.useEffect(() => {
    // 【修改】count 异常捕获，避免 DB 未就绪时未处理 Promise 拒绝
    (async () => {
      try { setRecordCount(await txStore.count()); }
      catch (e) { console.warn('count failed', e); }
    })();
  }, []);

  const onExportExcel = async () => {
    if (busy) return;
    setBusy('excel');
    try {
      const { path, filename } = await exportToExcel();
      Toast.show({ type: 'success', message: `${filename} 已导出` });
      await shareFile(path, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      Toast.show({ type: 'error', message: e.message });
    } finally {
      setBusy('');
    }
  };

  const onExportBackup = async () => {
    if (busy) return;
    setBusy('backup');
    try {
      const { path, filename, size } = await exportBackupJson();
      Toast.show({ type: 'success', message: `备份完成，共 ${size} 条记录` });
      await shareFile(path, 'application/json');
    } catch (e) {
      Toast.show({ type: 'error', message: e.message });
    } finally {
      setBusy('');
    }
  };

  // 选文件并按模式恢复
  const pickAndRestore = async (mode) => {
    setDialog(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (r.canceled) return;
      const res = await importBackupJson(r.assets[0].uri, mode);
      Toast.show({
        type: 'success',
        message: mode === 'overwrite'
          ? `覆盖完成：共 ${res.inserted} 条`
          : `恢复完成：导入 ${res.inserted}/${res.total} 条`,
      });
      setRecordCount(await txStore.count());
    } catch (e) {
      Toast.show({ type: 'error', message: e.message });
    }
  };

  const doClearAll = async () => {
    setDialog(null);
    // 【修改 P2】清空操作包 try/catch，失败给提示而非静默
    try {
      await txStore.clearAll();
      Haptic.notificationError();
      Toast.show({ type: 'info', message: '已清空所有记录' });
      setRecordCount(0);
    } catch (e) {
      Toast.show({ type: 'error', message: '清空失败：' + e.message });
    }
  };

  // 上月报告弹窗 { title, message }
  const [report, setReport] = React.useState(null);

  const monthBtn = async () => {
    // 【修改 P2】月报加载包 try/catch；无记录时 income/expense 可能为 undefined，兜底 0 防止显示 NaN
    try {
      const d = dayjs().subtract(1, 'month');
      const r = await getMonthlyReport(d.year(), d.month() + 1);
      const income = r?.income || 0;
      const msg = r?.txCount
        ? `收入 ¥${(income / 100).toFixed(2)}\n支出 ¥${(r.expense / 100).toFixed(2)}\n结余 ¥${((income - (r.expense || 0)) / 100).toFixed(2)}`
        : '上月暂无记账记录';
      setReport({ title: `${d.month() + 1} 月报告`, message: msg });
    } catch (e) {
      Toast.show({ type: 'error', message: '月报生成失败：' + e.message });
    }
  };

  const Item = ({ icon, iconBg, iconColor, title, sub, right, onPress, danger }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}
      style={[styles.item, { borderBottomColor: theme.divider }]} disabled={!onPress}
    >
      <View style={[styles.itemIcon, { backgroundColor: iconBg || theme.primaryBg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor || theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, { color: danger ? theme.danger : theme.text900 }]}>{title}</Text>
        {sub ? <Text style={[styles.itemSub, { color: theme.text500 }]}>{sub}</Text> : null}
      </View>
      <View style={{ marginLeft: 10 }}>{right}</View>
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text300} /> : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text900} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text900 }]}>设置</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* 账户概览 */}
        <Card variant="default" style={{ marginHorizontal: 16, marginTop: 16 }} padding="lg">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.avatar, { backgroundColor: theme.primaryGradient[1] }]}>
              <MaterialCommunityIcons name="wallet" size={26} color="#fff" />
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={[styles.walletName, { color: theme.text900 }]}>随手记 Lite</Text>
              <Text style={{ color: theme.text500, fontSize: 12 }}>
                本地账本 · {recordCount} 条记录 · 完全离线
              </Text>
            </View>
            <Chip label={s.palette === 'blue' ? '蓝紫主题' : '暖米主题'} size="sm" variant="primary" />
          </View>
        </Card>

        {/* 数据管理 */}
        <SectionHeader title="📂 数据管理" />
        <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 6 }}>
          <Item icon="microsoft-excel" iconBg="#ECFDF5" iconColor="#059669"
            title="导出为 Excel" sub={busy === 'excel' ? '正在导出…' : '账单明细导出 xlsx，可在电脑查看'}
            right={busy === 'excel' ? <ActivityIndicator size="small" color={theme.primary} /> : null}
            onPress={busy ? undefined : onExportExcel}
          />
          <Item icon="backup-restore" iconBg="#EEF2FF" iconColor="#6366F1"
            title="备份为 JSON 文件" sub={busy === 'backup' ? '正在备份…' : '包含所有交易+分类，可用于恢复'}
            right={busy === 'backup' ? <ActivityIndicator size="small" color={theme.primary} /> : null}
            onPress={busy ? undefined : onExportBackup}
          />
          <Item icon="cloud-upload-outline" iconBg="#FFFBEB" iconColor="#D97706"
            title="从备份文件恢复" sub="支持 合并 或 覆盖 两种模式"
            onPress={() => setDialog('restore')}
          />
          <Item icon="delete-sweep" iconBg="#FEF2F2" iconColor="#EF4444"
            title="清空所有交易记录" sub="分类设置会保留" danger
            onPress={() => setDialog('clear')}
          />
        </Card>

        {/* 个性化 */}
        <SectionHeader title="🎨 个性化" />
        <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 6 }}>
          <Item icon="tune-variant"
            title="分类管理" sub={`添加/删除/排序 收入 支出分类`}
            onPress={() => navigation.navigate('CategoryManage')}
          />
          <Item icon="palette-outline" title="主题配色方案"
            right={
              <SegmentedControl
                options={[
                  { key: 'blue', label: '蓝紫', value: 'blue' },
                  { key: 'warm', label: '暖米', value: 'warm' },
                ]}
                value={s.palette}
                onChange={(v) => { Haptic.selectionClick(); s.setPalette(v); }}
              />
            }
          />
          <Item icon="theme-light-dark" title="深色模式"
            right={
              <SegmentedControl
                options={[
                  { key: 'auto',  label: '跟随系统', value: 'auto'  },
                  { key: 'light', label: '浅色', value: 'light' },
                  { key: 'dark',  label: '深色', value: 'dark'  },
                ]}
                value={s.darkMode}
                onChange={(v) => { Haptic.selectionClick(); s.setDarkMode(v); }}
              />
            }
          />
        </Card>

        {/* OCR 偏好 */}
        <SectionHeader title="🧠 识别偏好" />
        <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 6 }}>
          <Item
            icon="flash-outline" iconBg={s.quickOcr ? '#ECFDF5' : '#F3F4F6'} iconColor={s.quickOcr ? '#059669' : '#6B7280'}
            title="快速识别模式" sub="识别完成后自动保存，Toast 可撤销（5秒内）"
            right={
              <Switch
                value={s.quickOcr}
                onValueChange={(v) => s.setQuickOcr(v)}
              />
            }
          />
        </Card>

        {/* 统计工具 */}
        <SectionHeader title="📊 统计工具" />
        <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 6 }}>
          <Item icon="file-chart-outline" title="生成上月报告（纯文本）" sub="快速查看上月收支摘要"
            onPress={monthBtn} />
        </Card>

        {/* 关于 */}
        <SectionHeader title="ℹ️ 关于" />
        <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 6 }}>
          <Item icon="information-outline" title="版本号" right={<Chip label="v1.0.0" size="sm" />} />
          <Item icon="shield-check-outline" title="隐私说明"
            sub="纯本地存储，不联网、不收集任何数据，所有权限仅用于本地功能"
          />
          <Item icon="github" title="作者"
            right={<Chip label="千群乐出品" size="sm" variant="primary" />}
          />
        </Card>

        <View style={{ paddingHorizontal: 32, paddingTop: 30 }}>
          <Button size="full" variant="ghost"
            onPress={() => {
              s.setOnboardingDone(false);
              Toast.show({ type: 'success', message: '下次启动将重新显示引导页' });
            }}>
            重置引导页
          </Button>
        </View>
      </ScrollView>

      {/* 恢复备份：选择合并/覆盖 */}
      <ConfirmDialog
        visible={dialog === 'restore'}
        icon="cloud-upload-outline"
        iconColor={theme.warning}
        title="从备份文件恢复"
        message="合并恢复会保留现有数据并追加备份内容；覆盖恢复会先清空当前所有交易记录再导入（分类保留）。"
        confirmText="合并恢复（选文件）"
        cancelText="取消"
        extraAction={{
          label: '覆盖恢复（危险，先清空再导入）',
          danger: true,
          onPress: () => setDialog('overwrite'),
        }}
        onCancel={() => setDialog(null)}
        onConfirm={() => pickAndRestore('merge')}
      />
      <ConfirmDialog
        visible={dialog === 'overwrite'}
        icon="alert-circle-outline"
        title="二次确认：覆盖恢复"
        message="这会永久删除当前账本的所有交易记录，然后导入你选择的备份文件。此操作无法撤销。"
        confirmText="我已知晓风险，选文件覆盖"
        cancelText="取消"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => pickAndRestore('overwrite')}
      />

      {/* 清空全部 */}
      <ConfirmDialog
        visible={dialog === 'clear'}
        icon="delete-sweep"
        title="清空所有交易数据"
        message="该操作会永久删除所有交易记录，且无法恢复（分类设置保留）。真的要继续吗？"
        confirmText="我确定清空"
        cancelText="取消"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={doClearAll}
      />

      {/* 上月报告 */}
      <ConfirmDialog
        visible={!!report}
        icon="file-chart-outline"
        title={report?.title || ''}
        message={report?.message || ''}
        confirmText="知道了"
        cancelText="关闭"
        onCancel={() => setReport(null)}
        onConfirm={() => setReport(null)}
      />
    </SafeAreaView>
  );
}

function SectionHeader({ title }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 8 }}>
      <Text style={{ color: theme.text500, fontSize: 13, fontWeight: '700' }}>{title}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title:   { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },

  avatar: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  walletName: { fontSize: 17, fontWeight: '800' },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  itemIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  itemTitle: { fontSize: 15, fontWeight: '600' },
  itemSub:   { fontSize: 12, marginTop: 2 },
}));
