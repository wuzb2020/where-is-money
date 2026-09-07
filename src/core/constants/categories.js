// 默认分类定义（收入/支出分开，首启动自动写入DB）
// 每个分类含：name（名称）、icon（expo/vector-icons的MaterialCommunityIcons key）、keywords（智能匹配关键词）

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: '外卖', icon: 'noodles', keywords: ['美团', '饿了么', '外卖', '麦当劳', '肯德基', 'KFC', '餐', '饭'], colorIndex: 0 },
  { name: '网购', icon: 'shopping', keywords: ['淘宝', '天猫', '京东', '拼多多', '淘', '网购', '订单', '发货'], colorIndex: 1 },
  { name: '交通', icon: 'car', keywords: ['滴滴', '高德打车', '出租车', '地铁', '公交', '加油', '过路费', '打车', '高铁', '火车'], colorIndex: 2 },
  { name: '房租', icon: 'home-city', keywords: ['房租', '物业', '水电', '燃气', '电费', '水费'], colorIndex: 3 },
  { name: '餐饮', icon: 'silverware-variant', keywords: ['餐厅', '饭店', '火锅', '烧烤', '奶茶', '咖啡', '星巴克', '聚餐'], colorIndex: 4 },
  { name: '购物', icon: 'tshirt-crew', keywords: ['衣服', '鞋子', '优衣库', 'ZARA', 'HM', '护肤', '美妆', '屈臣氏'], colorIndex: 5 },
  { name: '医疗', icon: 'medical-bag', keywords: ['医院', '挂号', '药', '药店', '体检', '诊所'], colorIndex: 6 },
  { name: '娱乐', icon: 'gamepad-variant', keywords: ['电影', 'KTV', '游戏', 'Steam', '网吧', '演唱会', '门票'], colorIndex: 7 },
  { name: '日用', icon: 'cart', keywords: ['超市', '便利店', '沃尔玛', '盒马', '永辉', '纸巾', '洗漱'], colorIndex: 8 },
  { name: '通讯', icon: 'cellphone', keywords: ['话费', '流量', '移动', '联通', '电信', '宽带'], colorIndex: 9 },
  { name: '学习', icon: 'book-open-page-variant', keywords: ['书', '课程', '培训', '得到', '极客', '买书', '学费'], colorIndex: 10 },
  { name: '旅行', icon: 'airplane', keywords: ['机票', '酒店', '景点', '携程', '去哪儿', '民宿', '门票'], colorIndex: 11 },
  { name: '宠物', icon: 'paw', keywords: ['宠物', '猫粮', '狗粮', '宠物医院'], colorIndex: 0 },
  { name: '红包', icon: 'gift', keywords: ['红包', '份子钱', '送礼'], colorIndex: 1 },
  { name: '其他支出', icon: 'dots-horizontal', keywords: [], colorIndex: 3 },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: '工资', icon: 'cash-multiple', keywords: ['工资', '薪资', '月薪', '发薪', '奖金', '绩效'], colorIndex: 0 },
  { name: '红包', icon: 'gift', keywords: ['红包', '压岁钱', '礼金'], colorIndex: 1 },
  { name: '理财', icon: 'chart-line', keywords: ['利息', '分红', '股票', '基金', '理财收益'], colorIndex: 2 },
  { name: '兼职', icon: 'briefcase', keywords: ['兼职', '外快', '私活', '接单'], colorIndex: 3 },
  { name: '退款', icon: 'refresh', keywords: ['退款', '退货', '返现'], colorIndex: 4 },
  { name: '其他收入', icon: 'plus-circle', keywords: [], colorIndex: 6 },
];

// 快捷金额（数字键盘顶部 Chip）
export const QUICK_AMOUNTS = [10, 20, 50, 100, 500];

// 快捷时间范围选项（首页筛选）
export const DATE_RANGE_PRESETS = [
  { key: 'week7', label: '近7天' },
  { key: 'month', label: '本月' },
  { key: 'prevMonth', label: '上月' },
  { key: 'day30', label: '近30天' },
  { key: 'custom', label: '自定义' },
];
