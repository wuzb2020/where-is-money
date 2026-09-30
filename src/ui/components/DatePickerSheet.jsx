// 日期选择底部弹层：年/月/日 滚轮 + 快捷选项
// 记账日期只精确到天（不再选择时分）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import BottomSheet from '../primitives/BottomSheet';
import Button from '../primitives/Button';
import { useAppTheme, makeStyles } from '../themeHelper';

const ITEM_H = 40;
const VISIBLE_COUNT = 5;

/** 单列滚轮：ScrollView 吸附 + 点选 */
function Wheel({ data, value, onChange, unit = '', width = 64 }) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const ref = useRef(null);
  const index = Math.max(0, data.indexOf(value));

  // 挂载时定位到当前值
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo?.({ y: index * ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据长度变化（月份切换导致天数变化）时校正位置
  useEffect(() => {
    ref.current?.scrollTo?.({ y: index * ITEM_H, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length]);

  const handleStop = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_H)));
    if (data[i] !== value) onChange(data[i]);
  };

  return (
    <View style={[styles.wheelWrap, { width, height: ITEM_H * VISIBLE_COUNT }]}>
      <View style={[styles.selectedBand, { top: ITEM_H * 2 }]} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={handleStop}
        onScrollEndDrag={handleStop}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      >
        {data.map((d, i) => {
          const active = i === index;
          return (
            <TouchableOpacity
              key={`${d}-${unit}`}
              activeOpacity={0.7}
              style={styles.wheelItem}
              onPress={() => {
                ref.current?.scrollTo?.({ y: i * ITEM_H, animated: true });
                onChange(d);
              }}
            >
              <Text
                style={[
                  styles.wheelText,
                  { color: active ? theme.text900 : theme.text500, fontWeight: active ? '800' : '600' },
                ]}
              >
                {d}
                <Text style={styles.wheelUnit}>{unit}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function range(start, end) {
  const arr = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

const QUICK_OPTIONS = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'beforeYesterday', label: '前天' },
];

export default function DatePickerSheet({ visible, value, title = '选择日期', onClose, onConfirm }) {
  const { theme } = useAppTheme();
  const styles = useStyles();

  const initial = useMemo(() => dayjs(value || Date.now()), [visible, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const [year, setYear] = useState(initial.year());
  const [month, setMonth] = useState(initial.month() + 1);
  const [day, setDay] = useState(initial.date());

  // 每次打开时用 value 重置
  useEffect(() => {
    if (visible) {
      const d = dayjs(value || Date.now());
      setYear(d.year());
      setMonth(d.month() + 1);
      setDay(d.date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const now = new Date();
  const years = range(now.getFullYear() - 6, now.getFullYear() + 1);
  const months = range(1, 12);
  const daysInMonth = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).daysInMonth();
  const days = range(1, daysInMonth);
  const safeDay = Math.min(day, daysInMonth);

  const applyQuick = (key) => {
    let d = dayjs();
    if (key === 'yesterday') d = d.subtract(1, 'day');
    else if (key === 'beforeYesterday') d = d.subtract(2, 'day');
    setYear(d.year());
    setMonth(d.month() + 1);
    setDay(d.date());
  };

  const handleConfirm = () => {
    const ts = dayjs()
      .year(year).month(month - 1).date(safeDay)
      .startOf('day')
      .valueOf();
    onConfirm?.(ts);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.quickRow}>
        {QUICK_OPTIONS.map((q) => (
          <TouchableOpacity
            key={q.key}
            activeOpacity={0.7}
            style={[styles.quickChip, { backgroundColor: theme.primaryBg, borderColor: theme.divider }]}
            onPress={() => applyQuick(q.key)}
          >
            <Text style={[styles.quickText, { color: theme.primary }]}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.wheelsRow}>
        <Wheel data={years} value={year} onChange={setYear} unit="年" width={90} />
        <Wheel data={months} value={month} onChange={setMonth} unit="月" width={80} />
        <Wheel data={days} value={safeDay} onChange={setDay} unit="日" width={80} />
      </View>

      <View style={styles.btnRow}>
        <Button variant="ghost" style={styles.flex1} onPress={onClose}>取消</Button>
        <Button variant="primary" style={styles.flex1} onPress={handleConfirm}>确定</Button>
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  quickText: { fontSize: 12, fontWeight: '700' },
  wheelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  wheelWrap: { position: 'relative' },
  selectedBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_H,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.divider,
    backgroundColor: t.bgCard,
    borderRadius: 10,
  },
  wheelItem: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: { fontSize: 17 },
  wheelUnit: { fontSize: 11, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  flex1: { flex: 1 },
}));
