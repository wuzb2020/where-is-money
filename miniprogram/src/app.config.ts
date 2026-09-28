export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/records/index',
    'pages/stats/index',
    'pages/mine/index',
    'pages/add/index',
    'pages/detail/index',
    'pages/category/index'
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#6366f1',
    navigationBarTitleText: '钱去哪儿了',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f5f6fa'
  },
  tabBar: {
    color: '#86909c',
    selectedColor: '#6366f1',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.svg',
        selectedIconPath: 'assets/tabbar/home-selected.svg'
      },
      {
        pagePath: 'pages/records/index',
        text: '明细',
        iconPath: 'assets/tabbar/records.svg',
        selectedIconPath: 'assets/tabbar/records-selected.svg'
      },
      {
        pagePath: 'pages/stats/index',
        text: '统计',
        iconPath: 'assets/tabbar/stats.svg',
        selectedIconPath: 'assets/tabbar/stats-selected.svg'
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tabbar/mine.svg',
        selectedIconPath: 'assets/tabbar/mine-selected.svg'
      }
    ]
  }
})
