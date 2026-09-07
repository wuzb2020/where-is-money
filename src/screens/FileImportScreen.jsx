import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Button from '../ui/primitives/Button';
import Chip from '../ui/primitives/Chip';
import Card from '../ui/primitives/Card';
import ProgressBar from '../ui/primitives/ProgressBar';
import Switch from '../ui/primitives/Switch';
import ImportPreviewList from '../ui/components/ImportPreviewList';
import CategoryPickerSheet from '../ui/components/CategoryPickerSheet';
import EmptyState from '../ui/primitives/EmptyState';
import Toast from '../ui/primitives/Toast';
import { useImportStore } from '../store/useImportStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useTransactionStore } from '../store/useTransactionStore';
import * as Haptic from '../core/utils/haptics';

/**
 * 文件导入流程页（4 步状态机）
 * step: 'parsing' | 'preview' | 'importing' | 'done'
 */
export default function FileImportScreen({ navigation }) {
  const { theme, insets } = useAppTheme();
  const styles = useStyles();
  const importStore = useImportStore();
  const txStore = useTransactionStore();
  const categories = useCategoryStore((s) => s.categories);
  const loadCats = useCategoryStore((s) => s.load);

  const { step, fileInfo, totalRows, previewRows, selected, duplicates, result } = importStore;

  const categoriesMap = React.useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const [saveTpl, setSaveTpl] = React.useState(true);
  const [skipDedup, setSkipDedup] = React.useState(false);

  // 分类选择器（手动调行的分类时）
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [pickerRowIdx, setPickerRowIdx] = React.useState(null);
  const [pickerType, setPickerType] = React.useState('expense');

  React.useEffect(() => {
    loadCats(false);
    if (step === 'idle' || step === 'parsing') {
      // 页面进入后自动开始解析
      if (fileInfo) importStore.startParsing();
    }
  }, []);

  // 确认导入
  const doImport = async () => {
    if (selected.size === 0) {
      Toast.show({ type: 'warning', message: '请至少勾选一条记录' });
      return;
    }
    Alert.alert(
      '确认导入',
      `将导入 ${selected.size} 条记录到账本（${saveTpl ? '并保存列模板' : '不保存模板'}）`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '开始导入', style: 'default',
          onPress: () => importStore.doImport({ saveTemplate: saveTpl, skipDedup }),
        },
      ],
    );
  };

  // 手动改分类
  const openPickCategory = (rowIdx) => {
    const row = previewRows[rowIdx];
    if (!row) return;
    setPickerRowIdx(rowIdx);
    setPickerType(row.type);
    setPickerVisible(true);
  };

  // step view
  let body = null;
  switch (step) {
    case 'parsing':
      body = <ParsingView fileInfo={fileInfo} />;
      break;
    case 'preview':
      body = (
        <ImportPreviewList
          rows={previewRows}
          selected={selected}
          duplicates={duplicates}
          onToggle={importStore.toggleSelect}
          onSelectAll={importStore.selectAll}
          onSelectNone={importStore.selectNone}
          onSelectNonDuplicates={importStore.selectNonDuplicates}
          onUpdateRow={(idx, patch) => importStore.updateRow(idx, patch)}
          onPickCategory={openPickCategory}
          categoriesMap={categoriesMap}
        />
      );
      break;
    case 'importing':
      body = <ImportingView selected={selected.size} />;
      break;
    case 'done':
      body = (
        <DoneView
          result={result}
          onBack={() => navigation.goBack()}
          onPreviewAll={() => navigation.navigate('AllRecords')}
          onRetry={() => { importStore.reset(); navigation.goBack(); }}
          onUndo={async () => {
            const ids = result?.insertedIds || [];
            for (const id of ids) {
              try { await txStore.remove(id); } catch (_) {}
            }
            Toast.show({ type: 'info', message: `已撤销导入 ${ids.length} 条记录` });
            importStore.reset();
            navigation.goBack();
          }}
        />
      );
      break;
    default:
      body = (
        <View style={{ flex: 1, padding: 24 }}>
          <EmptyState
            variant="empty"
            title="未选择文件"
            description="请从首页点击「导入文件」按钮重新选择"
            actionLabel="返回首页"
            onAction={() => navigation.goBack()}
          />
        </View>
      );
  }

  const showBottomActions = step === 'preview';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text900 }]}>文件导入</Text>
          <Text style={[styles.sub, { color: theme.text500 }]}>
            {fileInfo?.name || '未选择文件'}
            {totalRows ? ` · 共 ${totalRows} 行` : ''}
          </Text>
        </View>
        {/* 步骤指示器 */}
        <View style={styles.steps}>
          {['解析', '预览', '导入', '完成'].map((label, i) => {
            const stepIdx = ['parsing', 'preview', 'importing', 'done'].indexOf(step);
            const active = i <= stepIdx;
            return (
              <View key={label} style={{ alignItems: 'center' }}>
                <View style={[styles.stepDot, { backgroundColor: active ? theme.primary : theme.divider }]}>
                  {active ? <MaterialCommunityIcons name="check" size={12} color="#fff" /> : null}
                </View>
                <Text style={[styles.stepText, { color: active ? theme.primary : theme.text500 }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }}>{body}</View>

      {/* 预览底部：开关 + 导入按钮 */}
      {showBottomActions ? (
        <View style={[
          styles.footer, {
            backgroundColor: theme.bgCard, borderTopColor: theme.divider,
            paddingBottom: insets.bottom + 12,
          },
        ]}>
          <RowSwitch
            label="记住列模板（下次同表头自动对齐）"
            value={saveTpl}
            onChange={setSaveTpl}
          />
          {duplicates.size > 0 ? (
            <RowSwitch
              label="跳过疑似重复的记录（金额+日期+分类相同）"
              value={!skipDedup}
              onChange={(v) => setSkipDedup(!v)}
              warn
            />
          ) : null}
          <Button
            size="full"
            variant="primary"
            disabled={selected.size === 0}
            onPress={doImport}
          >
            确认导入（{selected.size} / {previewRows.length}）
          </Button>
        </View>
      ) : null}

      {/* done 页的底部返回 */}
      {step === 'done' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: theme.bgCard, borderTopColor: theme.divider }]}>
          <Button size="full" variant="primary" onPress={() => navigation.goBack()}>
            返回首页
          </Button>
        </View>
      ) : null}

      {/* 分类选择器 */}
      <CategoryPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        type={pickerType}
        onTypeChange={(t) => {
          setPickerType(t);
          if (pickerRowIdx != null) importStore.updateRow(pickerRowIdx, { type: t });
        }}
        onSelect={(cat) => {
          if (pickerRowIdx != null) importStore.updateRow(pickerRowIdx, { categoryId: cat.id });
        }}
        onNewCategory={() => {
          setPickerVisible(false);
          navigation.navigate('CategoryManage');
        }}
      />
    </SafeAreaView>
  );
}

// ---- 子视图组件 ----

function ParsingView({ fileInfo }) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setProgress((p) => Math.min(p + 12, 92)), 180);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' }}>
      <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.megaIcon, { backgroundColor: theme.primaryBg }]}>
        <MaterialCommunityIcons name="file-document-sync-outline" size={64} color={theme.primary} />
      </Animated.View>
      <Text style={[styles.bigText, { color: theme.text900 }]}>正在解析文件…</Text>
      <Text style={[styles.subText, { color: theme.text500, marginTop: 6 }]}>
        {fileInfo?.name}
      </Text>

      <Card variant="flat" style={{ width: '100%', marginTop: 24, padding: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ color: theme.text700, fontSize: 13, fontWeight: '600' }}>解析进度</Text>
          <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>{progress}%</Text>
        </View>
        <ProgressBar progress={progress / 100} height={8} />
        <View style={{ flexDirection: 'row', marginTop: 16, gap: 10 }}>
          <Chip label="读取文件" size="sm" variant="success" />
          <Chip label="匹配表头" size="sm" variant={progress >= 30 ? 'primary' : 'outline'} />
          <Chip label="OCR 内嵌图片" size="sm" variant={progress >= 60 ? 'primary' : 'outline'} />
          <Chip label="生成预览" size="sm" variant={progress >= 85 ? 'primary' : 'outline'} />
        </View>
      </Card>
    </View>
  );
}

function ImportingView({ selected }) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 60, alignItems: 'center' }}>
      <View style={[styles.megaIcon, { backgroundColor: theme.primaryBg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
      <Text style={[styles.bigText, { color: theme.text900 }]}>正在写入数据库…</Text>
      <Text style={[styles.subText, { color: theme.text500, marginTop: 6 }]}>
        {selected} 条记录正在保存，请稍候
      </Text>
    </View>
  );
}

function DoneView({ result, onBack, onPreviewAll, onRetry, onUndo }) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  if (result && result.ok) {
    return (
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 48, alignItems: 'center' }}>
        <Animated.View entering={ZoomIn.springify().damping(10)} style={[styles.megaIcon, { backgroundColor: theme.successBg }]}>
          <MaterialCommunityIcons name="check-circle-outline" size={64} color={theme.success} />
        </Animated.View>
        <Text style={[styles.bigText, { color: theme.success, marginTop: 12 }]}>导入成功！</Text>
        <Card variant="flat" style={{ width: '100%', marginTop: 28, padding: 16 }}>
          <ResultRow label="选中条数" value={String(result.selectedCount ?? '-')} />
          <ResultRow label="成功导入" value={`${result.inserted} 条`} accent={theme.success} />
          <ResultRow label="导入失败" value={`${result.failed} 条`} accent={result.failed > 0 ? theme.danger : theme.text900} />
          {result.skippedDuplicates > 0 ? (
            <ResultRow label="跳过疑似重复" value={`${result.skippedDuplicates} 条`} accent={theme.warning} />
          ) : null}
          {result.insertedIds?.length ? (
            <Button size="md" variant="ghost" style={{ marginTop: 10 }} onPress={onUndo}>
              <Text style={{ color: theme.text500, fontWeight: '600' }}>↩️ 撤销本次导入（{result.insertedIds.length} 条）</Text>
            </Button>
          ) : null}
          <Button size="md" variant="outline" style={{ marginTop: 8 }} onPress={onPreviewAll}>
            查看全部记录
          </Button>
        </Card>
      </View>
    );
  }
  // 失败
  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 48, alignItems: 'center' }}>
      <Animated.View entering={ZoomIn.springify().damping(10)} style={[styles.megaIcon, { backgroundColor: theme.dangerBg }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={64} color={theme.danger} />
      </Animated.View>
      <Text style={[styles.bigText, { color: theme.danger, marginTop: 12 }]}>导入失败</Text>
      <Text style={[styles.subText, { color: theme.text500, marginTop: 6, textAlign: 'center' }]}>
        {result?.error || '未知错误'}
      </Text>
      <Button size="lg" variant="primary" style={{ marginTop: 28 }} onPress={onRetry}>
        🔄 重新选择文件
      </Button>
    </View>
  );
}

function ResultRow({ label, value, accent }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: theme.divider }}>
      <Text style={{ flex: 1, color: theme.text500, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: accent || theme.text900, fontSize: 14, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function RowSwitch({ label, value, onChange, warn }) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={styles.rowSwitch}>
      <MaterialCommunityIcons name={warn ? 'alert-outline' : 'information-outline'} size={16} color={warn ? theme.warning : theme.primary} />
      <Text style={[styles.switchLabel, { color: theme.text700, flex: 1, marginLeft: 6 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    paddingHorizontal: 8, paddingTop: 6, paddingBottom: 10,
    borderBottomWidth: 0.5,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 17, fontWeight: '700', marginTop: -20, marginLeft: 44 },
  sub:      { fontSize: 12, marginLeft: 44, marginTop: 1 },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10, paddingHorizontal: 12,
  },
  stepDot:  { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 11, marginTop: 3, fontWeight: '600' },
  megaIcon: {
    width: 108, height: 108, borderRadius: 54,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  bigText: { fontSize: 20, fontWeight: '800' },
  subText: { fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: 8, borderRadius: 4 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 0.5,
  },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: { fontSize: 13, fontWeight: '500' },
}));
