import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, TextInput, FlatList, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Card from '../ui/primitives/Card';
import Button from '../ui/primitives/Button';
import Chip from '../ui/primitives/Chip';
import Input from '../ui/primitives/Input';
import SegmentedControl from '../ui/primitives/SegmentedControl';
import ConfirmDialog from '../ui/primitives/ConfirmDialog';
import Toast from '../ui/primitives/Toast';
import { useCategoryStore } from '../store/useCategoryStore';
import { categoryColors } from '../core/constants/theme';
import * as Haptic from '../core/utils/haptics';

/**
 * 分类管理页
 * - 收入/支出 切换
 * - 长按可拖拽排序（简化为上下箭头）
 * - 每行编辑名称/图标/颜色
 * - 新增/删除 自定义分类
 */
const ICON_POOL = [
  'noodles','shopping','car','home-city','silverware-variant','tshirt-crew',
  'medical-bag','gamepad-variant','cart','cellphone','book-open-page-variant',
  'airplane','paw','gift','cash-multiple','chart-line','briefcase','refresh',
  'dots-horizontal','plus-circle','food','drink','cup','hanger','shoe-formal',
  'basketball','dumbbell','ticket','flower','cat','dog','fish','baby','school',
  'lipstick','bottle-tonic-plus','hospital','wallet','credit-card','coin',
  'piggy-bank','hand-coin','currency-usd','sack','rocket','star','heart','crown',
];

export default function CategoryManageScreen({ navigation }) {
  const { theme, insets } = useAppTheme();
  const styles = useStyles();
  const catStore = useCategoryStore();
  const categories = catStore.categories;

  const [type, setType] = React.useState('expense');
  const [editModal, setEditModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // 正在编辑的分类对象 / 新建
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  React.useEffect(() => { catStore.load(true); }, []);

  const list = type === 'expense'
    ? catStore.expenseCategories()
    : catStore.incomeCategories();

  const openEdit = (cat) => {
    setEditing(cat ? {
      ...cat,
      keywords: cat.keywords?.join('、') || '',
    } : {
      type, name: '', icon: ICON_POOL[0], colorIndex: 0, keywords: '',
    });
    setEditModal(true);
  };

  const saveEditing = async () => {
    if (!editing.name.trim()) { Toast.show({ type: 'warning', message: '请填写分类名称' }); return; }
    await Haptic.notificationSuccess();
    const patch = {
      name: editing.name.trim(),
      icon: editing.icon,
      color_index: editing.colorIndex,
      keywords: editing.keywords ? editing.keywords.split(/[、,，\s]+/).filter(Boolean) : [],
    };
    if (editing.id && !editing.isDefault) {
      await catStore.update(editing.id, patch);
      Toast.show({ type: 'success', message: '已修改分类' });
    } else if (editing.id && editing.isDefault) {
      // 系统默认分类：只能改图标/颜色/关键词，不能改名和删除
      const { name, ...rest } = patch; // 忽略 name
      await catStore.update(editing.id, rest);
      Toast.show({ type: 'success', message: '系统分类名称不可修改，其他已保存' });
    } else {
      const id = await catStore.create({
        type: editing.type,
        ...patch,
        sort_order: list.length + 1,
      });
      Toast.show({ type: 'success', message: '已新建分类' });
    }
    await catStore.load(true);
    setEditModal(false);
  };

  const onDelete = (cat) => {
    if (cat.isDefault) {
      Toast.show({ type: 'warning', message: '系统内置分类不能删除' });
      return;
    }
    setDeleteTarget(cat);
  };

  const confirmDelete = async () => {
    const cat = deleteTarget;
    setDeleteTarget(null);
    if (!cat) return;
    await catStore.remove(cat.id);
    await catStore.load(true);
    Haptic.notificationError();
    Toast.show({ type: 'info', message: `已删除分类「${cat.name}」` });
  };

  const moveSort = async (cat, delta) => {
    const idx = list.findIndex((c) => c.id === cat.id);
    const target = idx + delta;
    if (target < 0 || target >= list.length) return;
    const swapWith = list[target];
    await catStore.update(cat.id, { sort_order: swapWith.sortOrder });
    await catStore.update(swapWith.id, { sort_order: cat.sortOrder });
    await catStore.load(true);
    Haptic.selectionClick();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text900} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text900 }]}>分类管理</Text>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => openEdit(null)}>
          <MaterialCommunityIcons name="plus" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={{ padding: 12 }}>
        <SegmentedControl
          variant="income-expense"
          options={[
            { key: 'expense', label: `支出（${catStore.expenseCategories().length}）`, value: 'expense' },
            { key: 'income',  label: `收入（${catStore.incomeCategories().length}）`,  value: 'income'  },
          ]}
          value={type}
          onChange={setType}
        />
      </View>

      <FlatList
        data={list}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item: cat, index }) => (
          <Card variant="flat" style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: cat.color + '22' }]}>
                <MaterialCommunityIcons name={cat.icon || 'circle'} size={20} color={cat.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.name, { color: theme.text900 }]}>{cat.name}</Text>
                  {cat.isDefault ? (
                    <Chip label="内置" size="sm" variant="outline" style={{ marginLeft: 6 }} />
                  ) : null}
                </View>
                {cat.keywords && cat.keywords.length > 0 ? (
                  <Text style={{ color: theme.text500, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    关键词：{cat.keywords.slice(0, 5).join('、')}{cat.keywords.length > 5 ? '…' : ''}
                  </Text>
                ) : null}
              </View>
              {/* 上下移动 */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity activeOpacity={0.6} style={styles.moveBtn}
                  disabled={index === 0}
                  onPress={() => moveSort(cat, -1)}
                >
                  <MaterialCommunityIcons name="chevron-up" size={16} color={index === 0 ? theme.text300 : theme.text700} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.6} style={styles.moveBtn}
                  disabled={index === list.length - 1}
                  onPress={() => moveSort(cat, 1)}
                >
                  <MaterialCommunityIcons name="chevron-down" size={16} color={index === list.length - 1 ? theme.text300 : theme.text700} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.6} style={styles.moveBtn} onPress={() => openEdit(cat)}>
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.primary} />
                </TouchableOpacity>
                {!cat.isDefault ? (
                  <TouchableOpacity activeOpacity={0.6} style={styles.moveBtn} onPress={() => onDelete(cat)}>
                    <MaterialCommunityIcons name="delete-outline" size={16} color={theme.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </Card>
        )}
      />

      {/* 新增/编辑 Modal */}
      <Modal visible={editModal} animationType="slide" onRequestClose={() => setEditModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
          <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
            <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => setEditModal(false)}>
              <MaterialCommunityIcons name="close" size={22} color={theme.text900} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.text900 }]}>{editing?.id ? '编辑分类' : '新建分类'}</Text>
            <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={saveEditing}>
              <MaterialCommunityIcons name="check" size={22} color={theme.primary} />
            </TouchableOpacity>
          </View>
          {editing ? (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <View style={{ marginBottom: 16 }}>
                <SegmentedControl
                  options={[
                    { key: 'expense', label: '支出', value: 'expense' },
                    { key: 'income',  label: '收入', value: 'income'  },
                  ]}
                  value={editing.type}
                  onChange={(v) => setEditing({ ...editing, type: v })}
                />
              </View>
              <Input
                label="分类名称"
                value={editing.name}
                onChangeText={(t) => setEditing({ ...editing, name: t })}
                editable={!editing.isDefault}
                placeholder={editing.isDefault ? '（系统内置分类不可改名）' : '如：宠物、数码、健身'}
              />
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.label, { color: theme.text500 }]}>选择图标</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 6, paddingVertical: 4 }}>
                  {ICON_POOL.map((ic) => (
                    <TouchableOpacity key={ic} activeOpacity={0.6}
                      onPress={() => setEditing({ ...editing, icon: ic })}
                      style={cx(
                        styles.iconOpt, { backgroundColor: theme.inputBg, borderColor: theme.divider },
                        editing.icon === ic && { borderColor: theme.primary, backgroundColor: theme.primaryBg },
                      )}
                    >
                      <MaterialCommunityIcons name={ic} size={22}
                        color={editing.icon === ic ? theme.primary : theme.text700} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.label, { color: theme.text500 }]}>选择颜色</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                  {categoryColors.map((col, i) => (
                    <TouchableOpacity key={col} activeOpacity={0.7}
                      onPress={() => setEditing({ ...editing, colorIndex: i })}
                    >
                      <View style={[styles.colorDot, { backgroundColor: col }]}>
                        {editing.colorIndex === i ? (
                          <MaterialCommunityIcons name="check" size={14} color="#fff" />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ marginTop: 14 }}>
                <Input
                  label="智能匹配关键词（用顿号、空格或逗号分隔）"
                  value={editing.keywords}
                  onChangeText={(t) => setEditing({ ...editing, keywords: t })}
                  placeholder="例如：宠物医院、猫粮、狗粮、宠物用品"
                  multiline
                />
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* 删除分类确认 */}
      <ConfirmDialog
        visible={!!deleteTarget}
        icon="alert-circle-outline"
        iconColor={theme.danger}
        title="删除分类"
        message={`「${deleteTarget?.name || ''}」删除后，历史记录中的该分类会显示为「未分类」，是否继续？`}
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title:   { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700' },
  moveBtn: {
    paddingHorizontal: 8, paddingVertical: 6,
  },
  label: { fontSize: 12, fontWeight: '700', marginLeft: 2, marginBottom: 4 },
  iconOpt: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginRight: 8,
  },
  colorDot: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2,
    elevation: 1,
  },
}));
