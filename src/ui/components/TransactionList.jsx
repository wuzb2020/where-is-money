import React from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import TransactionItem from './TransactionItem';
import EmptyState from '../primitives/EmptyState';
import Skeleton from '../primitives/Skeleton';
import { useAppTheme, makeStyles } from '../themeHelper';

/**
 * 交易列表组件
 * - 下拉刷新 + 加载更多（分页）
 * - 滑动删除（由 TransactionItem 实现）
 * - 空状态展示
 */
const PAGE_SIZE = 20;

export default function TransactionList({
  transactions,           // 当前页的数据
  total,                  // 总条数
  loading,                // 是否首次加载中
  loadingMore,            // 是否加载更多中
  hasMore: hasMoreProp,   // 【修改】外部可显式传入 hasMore；不传则按 total 推导
  onRefresh,              // 下拉刷新
  onLoadMore,             // 加载更多
  onItemPress,
  onItemEdit,
  onItemDelete,
  onItemDuplicate,
  showViewAll,
  onViewAll,
  emptyVariant = 'empty',
  emptyDesc,
  headerComponent,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();

  // 【修改 P1】data 兜底空数组，transactions 为 undefined 时 FlatList 直接报错白屏
  const data = transactions || [];

  if (loading && data.length === 0) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        {headerComponent}
        <Skeleton variant="list" lines={5} />
      </View>
    );
  }

  // 【修改】hasMore 优先取外部显式值；否则 total 已知时按长度推导；total 未知默认 false（避免无底洞触发）
  const hasMore = hasMoreProp != null
    ? hasMoreProp
    : total == null ? false : data.length < total;

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item, index }) => (
        <Animated.View
          entering={FadeInDown.delay(Math.min(index, 10) * 45)
            .springify()
            .damping(20)
            .stiffness(260)}
        >
          <TransactionItem
            tx={item}
            onPress={onItemPress}
            onEdit={onItemEdit}
            onDelete={onItemDelete}
            onDuplicate={onItemDuplicate}
          />
        </Animated.View>
      )}
      ItemSeparatorComponent={() => null}
      ListHeaderComponent={headerComponent}
      ListEmptyComponent={
        <View style={{ paddingHorizontal: 16, paddingTop: 32 }}>
          <EmptyState variant={emptyVariant} description={emptyDesc} />
        </View>
      }
      ListFooterComponent={
        <>
          {showViewAll && data.length > 0 ? (
            <TouchableOpacity activeOpacity={0.6} onPress={onViewAll} style={styles.viewAllBtn}>
              <Text style={[styles.viewAllText, { color: theme.primary }]}>查看全部 →</Text>
            </TouchableOpacity>
          ) : null}
          {loadingMore ? (
            <View style={{ paddingVertical: 20 }}>
              <Skeleton variant="card-line" lines={2} width="90%" />
            </View>
          ) : null}
          {!loadingMore && data.length > 0 && !hasMore ? (
            <Text style={[styles.endHint, { color: theme.text500 }]}>— 没有更多记录了 —</Text>
          ) : null}
        </>
      }
      refreshControl={
        <RefreshControl
          refreshing={!!loading}
          onRefresh={onRefresh}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }
      onEndReached={() => {
        // 【修改】首次 loading 中也不触发，防止首屏数据未到位时连环调用
        if (!loading && !loadingMore && hasMore && data.length > 0) onLoadMore?.();
      }}
      onEndReachedThreshold={0.2}
      contentContainerStyle={{ paddingBottom: 160 }}
      removeClippedSubviews
      maxToRenderPerBatch={10}
      initialNumToRender={8}
      windowSize={5}
    />
  );
}

const useStyles = makeStyles((theme) => ({
  viewAllBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16,
  },
  viewAllText: { fontSize: 14, fontWeight: '700' },
  endHint:    { textAlign: 'center', paddingVertical: 16, fontSize: 12 },
}));
