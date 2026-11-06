# Adds 草莓牛奶 colour versions: same pattern (polka dots + hearts), font, dashed cards,
# mascot and wording as 草莓牛奶 — only the colours change.
import json, os, re

SRC = r'C:\Users\user\Desktop\Bus app\src'

# id, name, mascot, title emoji, sample text, light palette, dark palette
V = [
    ('berryBlue', '粉藍牛奶', '🐰', '🫐', '粉藍波點 · 圓圓字體',
     dict(bg='#f1f7ff', text='#2a3f5a', muted='#7b93b3', accent='#4a9ff0', soft='#dcecff', acc2='#ffb36b', on='#ffffff',
          border='#cfe3fa', shadow='74, 159, 240', g1='#4a9ff0', g2='#9b8cf5', dot='#cfe2fb', h1='#a9d0f7', h2='#ffd1a8'),
     dict(bg='#121c2a', card='#1b2838', text='#e3eeff', muted='#8fa6c4', accent='#78b9f5', soft='#22364d', border='#2a3d55')),
    ('berryApple', '青蘋果', '🐰', '🍏', '蘋果綠波點 · 圓圓字體',
     dict(bg='#f3fbec', text='#33502a', muted='#7e9c70', accent='#5bb236', soft='#e1f5d4', acc2='#ffb36b', on='#ffffff',
          border='#d3edc2', shadow='91, 178, 54', g1='#5bb236', g2='#b7d94a', dot='#d6efc6', h1='#b4e39b', h2='#ffe08a'),
     dict(bg='#141f12', card='#1d2c1a', text='#e6f6dc', muted='#93b285', accent='#8fd66b', soft='#2a4122', border='#30472a')),
    ('berryTaro', '香芋紫', '🐰', '💜', '香芋紫波點 · 圓圓字體',
     dict(bg='#f7f2fd', text='#4a3563', muted='#9a86b7', accent='#9b6ddc', soft='#ece0fb', acc2='#ffb36b', on='#ffffff',
          border='#e2d4f7', shadow='155, 109, 220', g1='#9b6ddc', g2='#e08ac4', dot='#e4d7f8', h1='#d2bdf3', h2='#ffc7dc'),
     dict(bg='#1b1426', card='#271e36', text='#efe6fb', muted='#a898c4', accent='#bb98ee', soft='#38294f', border='#3c2f55')),
    ('berryLemon', '檸檬黃', '🐰', '🍋', '檸檬黃波點 · 圓圓字體',
     dict(bg='#fffbea', text='#5a4a14', muted='#a08c50', accent='#d99a00', soft='#fff1c2', acc2='#ff9f6b', on='#3d2c00',
          border='#f5e3a0', shadow='217, 154, 0', g1='#e8a800', g2='#ff8f5a', dot='#f8e9ad', h1='#ffe27a', h2='#ffc2a8'),
     dict(bg='#1f1a0c', card='#2c2512', text='#fbf2d4', muted='#b9a874', accent='#f2c440', soft='#43381a', border='#46391c')),
    ('berryPeach', '蜜桃橙', '🐰', '🍑', '蜜桃橙波點 · 圓圓字體',
     dict(bg='#fff4ee', text='#5c3426', muted='#b0806c', accent='#f57a4a', soft='#ffe2d4', acc2='#ffc46b', on='#ffffff',
          border='#ffd6c4', shadow='245, 122, 74', g1='#f57a4a', g2='#ff6f91', dot='#ffdccd', h1='#ffbfa3', h2='#ffd98a'),
     dict(bg='#24160f', card='#331f16', text='#ffe9de', muted='#c59580', accent='#ff9c72', soft='#4d2c1f', border='#4e3023')),
]

def enc(c):  # colour inside a data: URI
    return c.replace('#', '%23')

def light(id_, p):
    hearts = ("url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E"
              f"%3Cpath fill='{enc(p['h1'])}' d='M30 46s-10-6-13-12a7 7 0 0 1 13-5a7 7 0 0 1 13 5c-3 6-13 12-13 12z'/%3E"
              f"%3Cpath fill='{enc(p['h2'])}' d='M90 106s-7-4-9-8a5 5 0 0 1 9-3.5a5 5 0 0 1 9 3.5c-2 4-9 8-9 8z'/%3E"
              "%3C/svg%3E\") 0 0 / 120px 120px")
    return f"""[data-theme='{id_}'] {{
  --font: 'Huninn', 'Chiron GoRound TC', -apple-system, 'PingFang HK', 'Noto Sans HK', 'Noto Sans TC', sans-serif;
  --bg: {p['bg']};
  --card: #ffffff;
  --text: {p['text']};
  --muted: {p['muted']};
  --accent: {p['accent']};
  --accent-soft: {p['soft']};
  --accent-2: {p['acc2']};
  --on-accent: {p['on']};
  --border: {p['border']};
  --shadow: 0 6px 18px rgba({p['shadow']}, 0.16);
  --radius: 22px;
  --title-grad: linear-gradient(90deg, {p['g1']}, {p['g2']});
  --pattern-opacity: 0.55;
  --pattern: radial-gradient({p['dot']} 2.6px, transparent 3px) 0 0 / 26px 26px,
    radial-gradient({p['dot']} 2.6px, transparent 3px) 13px 13px / 26px 26px,
    {hearts};
}}
"""

def dark_tokens(d):
    return f"""    --bg: {d['bg']};
    --card: {d['card']};
    --text: {d['text']};
    --muted: {d['muted']};
    --accent: {d['accent']};
    --accent-soft: {d['soft']};
    --border: {d['border']};
    --shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    --pattern-opacity: 0.12;
"""

css = ["\n/* ============================================================\n"
       "   草莓牛奶 colour versions: same polka dots + hearts, Huninn font, dashed cards,\n"
       "   mascot and wording as 草莓牛奶 — only the colours differ.\n"
       "   ============================================================ */\n"]
for id_, name, *_rest in V:
    pass
for id_, name, mascot, emoji, sample, lp, dp in V:
    css.append(light(id_, lp))
    css.append(f"[data-mode='dark'][data-theme='{id_}'] {{\n{dark_tokens(dp).replace('    ', '  ')}}}\n")
    css.append(f"@media (prefers-color-scheme: dark) {{\n  [data-mode='auto'][data-theme='{id_}'] {{\n{dark_tokens(dp)}  }}\n}}\n")
# dashed cards, exactly like 草莓牛奶
css.append(",\n".join(f"[data-theme='{v[0]}'] .card" for v in V) + " {\n  border-style: dashed;\n}\n")
# the lemon accent is a dark-text colour: keep the big "8 分鐘" readable on white
css.append("[data-theme='berryLemon'] .eta.first .eta-min,\n[data-theme='berryLemon'] .eta.first .eta-min b {\n  color: #b07c00;\n}\n")
p = os.path.join(SRC, 'styles.css')
s = open(p, encoding='utf-8').read()
if "草莓牛奶 colour versions" not in s:
    open(p, 'a', encoding='utf-8').write(''.join(css))

# ---- themes.ts ----
p = os.path.join(SRC, 'themes.ts')
s = open(p, encoding='utf-8').read()
ids = ' | '.join(f"'{v[0]}'" for v in V)
s = s.replace("export type ThemeId = 'strawberry' | 'mint' | 'rainbow' | 'mono' | 'navy' | 'concrete';",
              f"export type ThemeId = 'strawberry' | 'mint' | 'rainbow' | 'mono' | 'navy' | 'concrete' | {ids};", 1)
s = s.replace("""  /** 可愛 (cute) or 型格 (stylish) — groups the picker */
  style: 'cute' | 'cool';""", """  /** 可愛 (cute) or 型格 (stylish) */
  style: 'cute' | 'cool';
  /** picker group; defaults to the style. 'berry' = 草莓牛奶 in other colours */
  group?: 'cute' | 'berry' | 'cool';""", 1)
# share 草莓牛奶's wording with its colour versions
m = re.search(r"(\{\n    id: 'strawberry',.*?\n    text: )(\{.*?\n    \}),", s, re.S)
assert m, 'strawberry entry'
if 'const BERRY_TEXT' not in s:
    s = s.replace(m.group(0), m.group(1) + 'BERRY_TEXT,', 1)
    s = s.replace('export const THEMES: Theme[] = [', 'const BERRY_TEXT: Record<string, string> = ' + m.group(2).replace('\n    ', '\n') + ';\n\nexport const THEMES: Theme[] = [', 1)
    entries = ''.join(f"""  {{
    id: '{id_}',
    style: 'cute',
    group: 'berry',
    name: '{name}',
    mascot: '{mascot}',
    titleEmoji: '{emoji}',
    font: 'Huninn',
    sample: '{sample}',
    text: BERRY_TEXT,
  }},
""" for id_, name, mascot, emoji, sample, _l, _d in V)
    i = s.index("  {\n    id: 'mint',")
    s = s[:i] + entries + s[i:]
open(p, 'w', encoding='utf-8').write(s)

# ---- Settings picker: three groups ----
p = os.path.join(SRC, 'features', 'Settings.tsx')
s = open(p, encoding='utf-8').read()
s = s.replace("{(['cute', 'cool'] as const).map((style) => (", "{(['cute', 'berry', 'cool'] as const).map((style) => (", 1)
s = s.replace("{THEMES.filter((th) => th.style === style).map((th) => (", "{THEMES.filter((th) => (th.group ?? th.style) === style).map((th) => (", 1)
open(p, 'w', encoding='utf-8').write(s)

p = os.path.join(SRC, 'i18n', 'zh-HK.json')
d = json.load(open(p, encoding='utf-8'))
d['settings.themeGroup.berry'] = '🍓 草莓牛奶 · 其他顏色'
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('ok')
