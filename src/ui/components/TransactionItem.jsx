import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';
import { formatAmount } from '../../core/utils/amount';
import { formatFriendly } from '../../core/utils/date';

/**
 * 单条交易卡片（支持左滑=复制+删除 / 右滑=编辑）
 *
 * tx: Transaction object (from normalizeTx)
 * onPress / onEdit / onDelete / onDuplicate（复制一条新的）
 */
export default function TransactionItem({
  tx, onPress, onEdit, onDelete, onDuplicate,
  showDate = true,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();

  // 【修改 P2】Swipeable 引用：点击滑出的操作按钮后必须手动收起，
  // 否则行保持展开状态，删除/复制后列表里留下一个敞开的操作区
  const swipeRef = React.useRef(null);
  const closeRow = () => swipeRef.current?.close?.();

  const isIncome = tx.type === 'income';
  const amountColor = isIncome ? theme.success : theme.danger;

  const sourceBadge = {
    manual: { icon: 'pencil-outline',      label: '手动', bg: theme.infoBg,       color: theme.info },
    image:  { icon: 'image-outline',       label: '图片', bg: theme.successBg,    color: theme.success },
    file:   { icon: 'file-document-outline',label:'文件', bg: theme.warningBg,    color: theme.warning },
  }[tx.source] || {};

  // 左滑出现的右侧操作区（复制+删除）
  const renderRightActions = (_, dragX) => (
    <View style={styles.rightActions}>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
        onPress={async () => {
          await Haptic.impactMedium();
          closeRow(); // 【修改】
          onDuplicate?.(tx);
        }}
      >
        <MaterialCommunityIcons name="content-copy" size={20} color="#fff" />
        <Text style={styles.actionText}>复制</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.danger }]}
        onPress={async () => {
          await Haptic.notificationError();
          closeRow(); // 【修改】
          onDelete?.(tx);
        }}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={20} color="#fff" />
        <Text style={styles.actionText}>删除</Text>
      </TouchableOpacity>
    </View>
  );

  // 右滑出现的左侧操作区（编辑）
  const renderLeftActions = () => (
    <View style={styles.leftActions}>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.primary }]}
        onPress={async () => {
          await Haptic.impactMedium();
          closeRow(); // 【修改】
          onEdit?.(tx);
        }}
      >
        <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
        <Text style={styles.actionText}>编辑</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      friction={2}
      overshootRight={false}
      overshootLeft={false}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPress?.(tx)}
        style={cx(styles.item, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider })}
      >
        {/* 左：分类圆图标 */}
        <View style={[styles.iconCircle, { backgroundColor: tx.categoryColor + '22' }]}>
          <MaterialCommunityIcons name={tx.categoryIcon || 'circle'} size={20} color={tx.categoryColor} />
        </View>

        {/* 中：分类名 + 描述 */}
        <View style={styles.mid}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={cx(styles.categoryName, { color: theme.text900 })} numberOfLines={1}>
              {tx.categoryName}
            </Text>
            {tx.imagePaths && tx.imagePaths.length > 0 ? (
              <Image source={{ uri: tx.imagePaths[0] }} style={styles.thumb} />
            ) : null}
          </View>
          {tx.description ? (
            <Text style={cx(styles.desc, { color: theme.text500 })} numberOfLines={2}>
              {tx.description}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {showDate ? (
              <Text style={cx(styles.date, { color: theme.text500 })}>
                {formatFriendly(tx.date)}
              </Text>
            ) : null}
            <View style={cx(styles.sourceBadge, { backgroundColor: sourceBadge.bg })}>
              <MaterialCommunityIcons name={sourceBadge.icon || 'circle'} size={10} color={sourceBadge.color} />
              <Text style={[styles.sourceText, { color: sourceBadge.color }]}>{sourceBadge.label}</Text>
            </View>
          </View>
        </View>

        {/* 右：金额 */}
        <View style={styles.right}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {isIncome ? '+' : '-'}
            {/* 【修改 P1】单位是分：≥1,000,000 分（¥10,000）才隐藏小数；旧值 100000 分 = ¥1,000 */}
            {formatAmount(tx.amount, { prefix: '', decimals: Math.abs(tx.amount) >= 1_000_000 ? 0 : 2 })}
          </Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const useStyles = makeStyles((theme) => ({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  mid: { flex: 1, justifyContent: 'center' },
  categoryName: { fontSize: 15, fontWeight: '700' },
  desc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 4,
  },
  date: { fontSize: 11, marginRight: 8 },
  sourceBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  sourceText: { fontSize: 10, fontWeight: '600', marginLeft: 2 },
  thumb: {
    width: 20, height: 20, borderRadius: 4, marginLeft: 6,
  },
  right: { minWidth: 100, alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '800' },
  rightActions: { flexDirection: 'row', width: 140, justifyContent: 'flex-end' },
  leftActions:  { flexDirection: 'row', width: 70 },
  actionBtn: {
    width: 70, height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
}));
