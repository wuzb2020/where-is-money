import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from '../primitives/Card';
import Button from '../primitives/Button';
import Input from '../primitives/Input';
import SegmentedControl from '../primitives/SegmentedControl';
import Chip from '../primitives/Chip';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import { fenToYuan, yuanToFen } from '../../core/utils/amount'; // 【修改】formatAmount 已不再使用
import { formatDateTime } from '../../core/utils/date';

/**
 * OCR 识别结果：单张图片的 N 条 parsed 可编辑卡片列表
 *
 * image: { uri, status, rawText, parsed, fromCache, errorMsg }
 * parsed: [{ idStub, date, type, categoryId, categoryName, amount, description }]
 * onChange(parsedIdx, patch)  onRemove(parsedIdx)
 * onPickCategory(parsedIdx)   （让外层弹分类选择器）
 * onPickDate(parsedIdx)      （让外层弹日期选择器）【修改】
 */
export default function OcrResultEditor({
  image, index, totalCount,
  onChange, onRemove, onPickCategory, onPickDate, onRetry,
  categoriesMap,     // id → category object （含 color/icon/name）
}) {
  const { theme, width } = useAppTheme();
  const styles = useStyles();

  if (image.status === 'processing') {
    return (
      <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
          <MaterialCommunityIcons name="magic-staff" size={20} color={theme.primary} />
          <Text style={cx(styles.processText, { color: theme.text700, marginLeft: 8 })}>
            正在识别第 {index + 1}/{totalCount} 张图的文字…
          </Text>
        </View>
      </Card>
    );
  }

  if (image.status === 'error') {
    return (
      <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: theme.dangerBg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={theme.danger} />
          <Text style={cx(styles.processText, { color: theme.danger, marginLeft: 8, flex: 1 })}>
            识别失败：{image.errorMsg || '请重试或手动输入'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 6 }}>
          <Button size="sm" variant="outline" onPress={() => onRetry?.(index)} style={{ borderColor: theme.danger }}>
            <Text style={{ color: theme.danger, fontWeight: '700' }}>🔄 重试识别</Text>
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <View>
      {/* 图片缩略图 + 原文预览 */}
      <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 12 }}>
        <View style={styles.imageRow}>
          <Image source={{ uri: image.uri }} style={styles.thumb} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.indexLabel, { color: theme.text500 }]}>
                图 {index + 1} / {totalCount}
              </Text>
              {image.fromCache ? (
                <Chip label="缓存命中" variant="success" size="sm" style={{ marginLeft: 8 }} />
              ) : null}
            </View>
            <Text style={[styles.rawText, { color: theme.text500 }]} numberOfLines={3}>
              {image.rawText || '（无文本内容）'}
            </Text>
          </View>
        </View>
      </Card>

      {/* 多条识别结果卡片 */}
      {image.parsed.length === 0 ? (
        <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 10, backgroundColor: theme.warningBg }}>
          <View style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
            <Text style={{ color: theme.warning, fontSize: 13, fontWeight: '600' }}>
              ⚠️ 没识别到金额，请手动补充或点击「+ 添加一条」
            </Text>
          </View>
        </Card>
      ) : null}

      {image.parsed.map((tx, i) => (
        <ParsedCard
          key={tx.idStub || i}
          tx={tx}
          idx={i}
          theme={theme}
          styles={styles}
          cat={categoriesMap[tx.categoryId] || {}}
          onChange={onChange}
          onRemove={onRemove}
          onPickCategory={onPickCategory}
          onPickDate={onPickDate}
        />
      ))}
    </View>
  );
}

/**
 * 【修改 P1】单条识别结果卡片抽成独立组件：
 * 金额 TextInput 需要本地字符串编辑态（旧代码 value 强制 toFixed(2) 回写，
 * 输入 "12." 立刻被还原成 "12.00"，小数点和中间编辑全部失效）。
 * 日期旧代码 editable={false} 且无任何点击通道，识别错日期无法修改，现接 onPickDate。
 */
function ParsedCard({ tx, idx, theme, styles, cat, onChange, onRemove, onPickCategory, onPickDate }) {
  const [amtText, setAmtText] = React.useState(() =>
    tx.amount ? String(fenToYuan(tx.amount)) : '',
  );

  return (
    <Card variant="default" style={{ marginHorizontal: 16, marginTop: 10 }}>
      <View style={styles.recordHeader}>
        <View style={{ flex: 1, maxWidth: 220 }}>
          <SegmentedControl
            variant="income-expense"
            options={[
              { key: 'expense', label: '支出', value: 'expense' },
              { key: 'income',  label: '收入', value: 'income'  },
            ]}
            value={tx.type}
            onChange={(v) => onChange(idx, { type: v })}
          />
        </View>
        <TouchableOpacity
          activeOpacity={0.6}
          style={[styles.delBtn, { backgroundColor: theme.dangerBg }]}
          onPress={() => onRemove(idx)}
        >
          <MaterialCommunityIcons name="delete-outline" size={16} color={theme.danger} />
          <Text style={[styles.delText, { color: theme.danger }]}>删除</Text>
        </TouchableOpacity>
      </View>

      {/* 金额 */}
      <View style={{ marginTop: 12 }}>
        <Text style={[styles.fieldLabel, { color: theme.text700 }]}>金额</Text>
        <View style={[styles.amountBox, { backgroundColor: tx.type === 'income' ? theme.successBg : theme.dangerBg }]}>
          <Text style={{ color: tx.type === 'income' ? theme.success : theme.danger, fontSize: 15, marginRight: 6 }}>¥</Text>
          <TextInput
            style={{
              flex: 1, color: tx.type === 'income' ? theme.success : theme.danger,
              fontSize: 22, fontWeight: '800', padding: 0,
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={tx.type === 'income' ? theme.success : theme.danger}
            value={amtText}
            onChangeText={(t) => {
              // 【修改】只接受数字和单个小数点；本地态自由编辑，合法数字才同步到上层
              if (!/^\d*\.?\d{0,2}$/.test(t)) return;
              setAmtText(t);
              const n = parseFloat(t);
              onChange(idx, { amount: isNaN(n) ? 0 : yuanToFen(n) });
            }}
          />
        </View>
      </View>

      {/* 分类 */}
      <View style={{ marginTop: 10 }}>
        <Text style={[styles.fieldLabel, { color: theme.text700 }]}>分类</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.catRow, { backgroundColor: theme.inputBg, borderColor: cat.color || theme.divider }]}
          onPress={() => onPickCategory(idx)}
        >
          <View style={[styles.catIconPill, { backgroundColor: (cat.color || theme.primary) + '22' }]}>
            <MaterialCommunityIcons name={cat.icon || 'circle'} size={18} color={cat.color || theme.primary} />
          </View>
          <Text style={[styles.catNameText, { color: theme.text900, flex: 1 }]}>
            {cat.name || '未分类（点击选择）'}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text500} />
        </TouchableOpacity>
      </View>

      {/* 日期时间【修改】包 TouchableOpacity 接通 onPickDate，可修改识别错误的日期 */}
      <View style={{ marginTop: 10 }}>
        <Text style={[styles.fieldLabel, { color: theme.text700 }]}>日期时间</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onPickDate?.(idx)}
          style={[styles.catRow, { backgroundColor: theme.inputBg, borderColor: theme.divider }]}
        >
          <MaterialCommunityIcons name="calendar-edit" size={18} color={theme.primary} style={{ marginRight: 10 }} />
          <Text style={[styles.catNameText, { color: theme.text900, flex: 1 }]}>
            {formatDateTime(tx.date)}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text500} />
        </TouchableOpacity>
      </View>

      {/* 描述 */}
      <View style={{ marginTop: 10 }}>
        <Text style={[styles.fieldLabel, { color: theme.text700 }]}>描述</Text>
        <Input
          placeholder="例如：淘宝买 iQOO 5e 手机 8+256G 蓝色"
          value={tx.description || ''}
          onChangeText={(t) => onChange(idx, { description: t })}
          multiline
          containerStyle={{ marginVertical: 4 }}
        />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  processText: { fontSize: 14, fontWeight: '500' },
  imageRow: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: theme.divider },
  indexLabel: { fontSize: 12, fontWeight: '600' },
  rawText: { fontSize: 12, marginTop: 6, lineHeight: 16 },

  recordHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 10,
  },
  delBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, gap: 4,
  },
  delText: { fontSize: 12, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4, marginLeft: 2 },
  amountBox: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
  },
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  catIconPill: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  catNameText: { fontSize: 14, fontWeight: '600' },
}));
