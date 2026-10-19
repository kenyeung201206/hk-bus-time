// Three cute colour patterns. Each one changes colours, background pattern,
// font, mascot and some of the wording.
export type ThemeId = 'strawberry' | 'mint' | 'rainbow' | 'neon' | 'gold' | 'racing';

export interface Theme {
  id: ThemeId;
  /** 可愛 (cute) or 型格 (stylish) — groups the picker */
  style: 'cute' | 'cool';
  name: string;
  mascot: string;
  /** emoji next to the home title (kept outside the gradient text) */
  titleEmoji: string;
  font: string; // Google Fonts family name
  /** a short sample shown on the theme picker */
  sample: string;
  /** wording that replaces the default zh-HK strings */
  text: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: 'strawberry',
    style: 'cute',
    name: '草莓牛奶',
    mascot: '🐰',
    titleEmoji: '🍓',
    font: 'Huninn',
    sample: '粉紅波點 · 圓圓字體',
    text: {
      arriving: '就嚟到站囉',
      arrived: '已經到站喇',
      'fav.empty': '仲未有巴士呀～ 🐰',
      'fav.add': '＋ 加第一架巴士 💕',
      'fav.added': '加咗入我的巴士 💕',
      'tripf.none': '搵唔到直達巴士 🥺',
      'search.noResult': '搵唔到喎 🥺',
      'nearby.none': '附近冇巴士站呀 🐰',
      updatedJust: '啱啱更新 ✨',
    },
  },
  {
    id: 'mint',
    style: 'cute',
    name: '薄荷汽水',
    mascot: '🐳',
    titleEmoji: '🫧',
    font: 'Chiron GoRound TC',
    sample: '清新泡泡 · 圓角黑體',
    text: {
      arriving: '就嚟到喇',
      arrived: '到咗站喇',
      'fav.empty': '空空如也～ 🐳',
      'fav.add': '＋ 加第一架巴士 🫧',
      'fav.added': '加咗入我的巴士 🐳',
      'tripf.none': '冇直達巴士 🐳💦',
      'search.noResult': '咩都搵唔到 🫧',
      'nearby.none': '附近冇巴士站 🐳',
      updatedJust: '啱啱更新 💦',
    },
  },
  {
    id: 'rainbow',
    style: 'cute',
    name: '彩虹糖果',
    mascot: '🦄',
    titleEmoji: '🌈',
    font: 'LXGW WenKai TC',
    sample: '彩虹星星 · 手寫字體',
    text: {
      arriving: '就快到喇',
      arrived: '已經到站',
      'fav.empty': '仲未有心水巴士 🦄',
      'fav.add': '＋ 加一架巴士 ✨',
      'fav.added': '加咗入我的巴士 ✨',
      'tripf.none': '搵唔到直達巴士 🌧️',
      'search.noResult': '搵唔到喎 🦄',
      'nearby.none': '附近冇巴士站 🌈',
      updatedJust: '啱啱更新 🌟',
    },
  },
  {
    id: 'neon',
    style: 'cool',
    name: '霓虹夜城',
    mascot: '😎',
    titleEmoji: '🌃',
    font: 'Chiron Hei HK',
    sample: '深夜藍 · 霓虹光',
    text: {
      arriving: '就到喇',
      arrived: '車到喇，上車！',
      'fav.empty': '未有收藏巴士 😎',
      'fav.add': '＋ 加架巴士',
      'fav.added': '已收藏 ⚡',
      'tripf.none': '冇直達車',
      'search.noResult': '搵唔到',
      'nearby.none': '附近冇車站',
      updatedJust: '啱啱更新 ⚡',
    },
  },
  {
    id: 'gold',
    style: 'cool',
    name: '黑金尊尚',
    mascot: '🦁',
    titleEmoji: '👑',
    font: 'Noto Serif HK',
    sample: '黑金配色 · 宋體',
    text: {
      arriving: '即將抵達',
      arrived: '已經到站',
      'fav.empty': '尚未收藏巴士',
      'fav.add': '＋ 收藏巴士',
      'fav.added': '已收藏 👑',
      'tripf.none': '找不到直達巴士',
      'search.noResult': '找不到結果',
      'nearby.none': '附近沒有巴士站',
      updatedJust: '剛剛更新',
    },
  },
  {
    id: 'racing',
    style: 'cool',
    name: '極速賽車',
    mascot: '🏎️',
    titleEmoji: '🏁',
    font: 'Chiron Hei HK',
    sample: '賽車紅 · 格仔旗',
    text: {
      arriving: '衝緊埋站',
      arrived: '到站！上車！',
      'fav.empty': '未有收藏巴士 🏁',
      'fav.add': '＋ 加架巴士',
      'fav.added': '已收藏 🏁',
      'tripf.none': '冇直達車',
      'search.noResult': '搵唔到',
      'nearby.none': '附近冇車站',
      updatedJust: '啱啱更新 🏁',
    },
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export function fontsHref() {
  // Huninn only ships one weight; the others have regular + bold.
  const fams = [...new Set(THEMES.map((t) => t.font))]
    .map((f) => `family=${f.replace(/ /g, '+')}${f === 'Huninn' ? '' : ':wght@400;700'}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}
