# Генерирует ui/tn-icons.js из векторных иконок Android (res/drawable/*.xml) + несколько своих в том же стиле.
import re, sys, json, xml.etree.ElementTree as ET
A = '{http://schemas.android.com/apk/res/android}'
# Использование: python3 tools/gen_tn_icons.py <racenav-android>/app/src/main/res/drawable ui/tn-icons.js
SRC = sys.argv[1].rstrip('/') + '/'
MAP = {  # имя на десктопе: файл Android
 'folder':'ic_folder','pin':'ic_set_pin','add-wp':'ic_add_waypoint','track':'ic_set_record','route':'ic_set_route',
 'flag':'ic_sym_flag','edit':'ic_ui_edit','lock':'ic_lock','compass':'ic_set_compass','navigation':'ic_set_navigation',
 'download':'ic_set_download','signal':'ic_set_signal','server':'ic_server_status','eye':'ic_ui_visibility',
 'eye-off':'ic_ui_visibility_off','delete':'ic_ui_delete','settings':'ic_settings','info':'ic_set_info',
 'more':'ic_more_vert','layers':'ic_layers','close':'ic_close','sun':'ic_tb_sun','moon':'ic_tb_moon',
 'monitor':'ic_set_monitor','sliders':'ic_set_sliders','map':'ic_set_map','layers-o':'ic_set_layers',
 'user':'ic_set_user','add':'ic_add','open':'ic_ui_open','help':'ic_set_help','gauge':'ic_set_gauge',
 'my-location':'ic_my_location',
}
def conv(name, fn):
    root = ET.parse(SRC + fn + '.xml').getroot()
    vw, vh = root.get(A+'viewportWidth'), root.get(A+'viewportHeight')
    out = []
    for p in root.iter('path'):
        d = p.get(A+'pathData'); fill = p.get(A+'fillColor'); stroke = p.get(A+'strokeColor')
        attrs = [f'd="{d}"']
        transparent = lambda c: c is None or c in ('#00000000', '@android:color/transparent')
        attrs.append('fill="none"' if transparent(fill) else 'fill="currentColor"')
        if not transparent(stroke):
            attrs.append('stroke="currentColor"')
            for k, a in (('strokeWidth','stroke-width'),('strokeLineCap','stroke-linecap'),('strokeLineJoin','stroke-linejoin')):
                v = p.get(A+k)
                if v: attrs.append(f'{a}="{v}"')
        if p.get(A+'fillType') == 'evenOdd': attrs.append('fill-rule="evenodd"')
        out.append('<path ' + ' '.join(attrs) + '/>')
    return f'<symbol id="tn-i-{name}" viewBox="0 0 {vw} {vh}">' + ''.join(out) + '</symbol>'
S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
OWN = {  # свои — штрихом 2, как ic_set_* в Android (tools/gen_settings_icons.py)
 'lock-open': f'<path {S} d="M6,11 h12 a1,1 0 0 1 1,1 v8 a1,1 0 0 1 -1,1 h-12 a1,1 0 0 1 -1,-1 v-8 a1,1 0 0 1 1,-1 z M8,11 v-4 a4,4 0 0 1 7.6,-1.7"/>',
 'ruler': f'<path {S} d="M3,15.5 L15.5,3 L21,8.5 L8.5,21 z M7,11.5 l2,2 M10,8.5 l2,2 M13,5.5 l2,2"/>',
 'cloud-sync': f'<path {S} d="M7,18 h10.5 a4,4 0 0 0 0.5,-7.97 a6,6 0 0 0 -11.5,1.2 a3.4,3.4 0 0 0 0.5,6.77 z"/>',
 'search': f'<path {S} d="M4,10.5 a6.5,6.5 0 1,0 13,0 a6.5,6.5 0 1,0 -13,0 M15.2,15.2 L20,20"/>',
 'road': f'<path {S} d="M8,3 L4,21 M16,3 L20,21 M12,4 v3 M12,10.5 v3 M12,17 v3"/>',
 'palette': f'<path {S} d="M12,3 a9,9 0 0 0 0,18 c1.2,0 1.6,-0.9 1.2,-1.8 c-0.5,-1 0.2,-2.2 1.3,-2.2 H17 a4,4 0 0 0 4,-4 c0,-5.5 -4,-10 -9,-10 z"/><path fill="currentColor" d="M7,11.5 a1.3,1.3 0 1,0 2.6,0 a1.3,1.3 0 1,0 -2.6,0 M10.2,7.6 a1.3,1.3 0 1,0 2.6,0 a1.3,1.3 0 1,0 -2.6,0 M14.6,8.6 a1.3,1.3 0 1,0 2.6,0 a1.3,1.3 0 1,0 -2.6,0"/>',
 'chevron-down': f'<path {S} d="M6,9 l6,6 l6,-6"/>',
 # кнопки-значки вместо эмодзи (07.10.2026): тот же штрих 2, скругления, сетка 24
 'chevron-up': f'<path {S} d="M6,15 l6,-6 l6,6"/>',
 'cloud-download': f'<path {S} d="M7,18 h10.5 a4,4 0 0 0 0.5,-7.97 a6,6 0 0 0 -11.5,1.2 a3.4,3.4 0 0 0 0.5,6.77 z M12,9.5 v6 M9.5,13 L12,15.5 L14.5,13"/>',
 'cloud-upload': f'<path {S} d="M7,18 h10.5 a4,4 0 0 0 0.5,-7.97 a6,6 0 0 0 -11.5,1.2 a3.4,3.4 0 0 0 0.5,6.77 z M12,15.5 v-6 M9.5,12 L12,9.5 L14.5,12"/>',
 'cloud-check': f'<path {S} d="M7,18 h10.5 a4,4 0 0 0 0.5,-7.97 a6,6 0 0 0 -11.5,1.2 a3.4,3.4 0 0 0 0.5,6.77 z M9.3,12.8 l2,2 l3.6,-3.6"/>',
 'refresh': f'<path {S} d="M20,12 a8,8 0 1,1 -2.34,-5.66 L20,8.5 M20,3.5 v5 h-5"/>',
 'rotate-left': f'<path {S} d="M4,12 a8,8 0 1,0 2.34,-5.66 L4,8.5 M4,3.5 v5 h5"/>',
 'check': f'<path {S} d="M5,12.5 l4.5,4.5 L19,7.5"/>',
 'undo': f'<path {S} d="M9,14 L4,9 l5,-5 M4,9 h10.5 a5.5,5.5 0 0 1 0,11 H11"/>',
 'swap-vert': f'<path {S} d="M8,19 V5 M4.5,8.5 L8,5 l3.5,3.5 M16,5 v14 M12.5,15.5 L16,19 l3.5,-3.5"/>',
 'swap-horiz': f'<path {S} d="M5,8 h14 M15.5,4.5 L19,8 l-3.5,3.5 M19,16 H5 M8.5,12.5 L5,16 l3.5,3.5"/>',
 'scissors': f'<path {S} d="M4,6.5 a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0 M4,17.5 a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0 M8.4,8.2 L20,18 M8.4,15.8 L20,6"/>',
 'move': f'<path {S} d="M12,3 v18 M3,12 h18 M9.5,5.5 L12,3 l2.5,2.5 M9.5,18.5 L12,21 l2.5,-2.5 M5.5,9.5 L3,12 l2.5,2.5 M18.5,9.5 L21,12 l-2.5,2.5"/>',
 'pause': f'<path {S} d="M9,5 v14 M15,5 v14"/>',
 'stop': f'<path {S} d="M6,6 h12 v12 h-12 z"/>',
 'save': f'<path {S} d="M6,4 h10 l4,4 v10 a2,2 0 0 1 -2,2 h-12 a2,2 0 0 1 -2,-2 v-12 a2,2 0 0 1 2,-2 z M8,4 v4 h7 v-4 M8,20 v-6 h8 v6"/>',
 'file': f'<path {S} d="M6,3 h8 l4,4 v13 a1,1 0 0 1 -1,1 h-11 a1,1 0 0 1 -1,-1 v-16 a1,1 0 0 1 1,-1 z M14,3 v4 h4"/>',
 'copy': f'<path {S} d="M9,9 h11 v11 h-11 z M5,15 H4 V4 h11 v1"/>',
 'globe': f'<path {S} d="M3,12 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0 M3,12 h18 M12,3 a14,14 0 0 1 0,18 a14,14 0 0 1 0,-18"/>',
 'chat': f'<path {S} d="M5,5 h14 a1.5,1.5 0 0 1 1.5,1.5 v9 a1.5,1.5 0 0 1 -1.5,1.5 h-8 l-4.5,3.5 v-3.5 h-1.5 a1.5,1.5 0 0 1 -1.5,-1.5 v-9 a1.5,1.5 0 0 1 1.5,-1.5 z"/>',
 'group': f'<path {S} d="M6,8.5 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0 M3,19 a6,6 0 0 1 12,0 M15,5.6 a3,3 0 0 1 0,5.8 M17.5,13.6 a6,6 0 0 1 3.5,5.4"/>',
 'satellite': f'<path {S} transform="rotate(-45 12 12)" d="M9.5,9.5 h5 v5 h-5 z M2.5,10 h5 v4 h-5 z M16.5,10 h5 v4 h-5 z M7.5,12 h2 M14.5,12 h2 M10,17.5 a2.5,2.5 0 0 0 4,0"/>',
 'terrain': f'<path {S} d="M2.5,19 L8.5,8 L13,15.5 L15.5,11.5 L21.5,19 Z"/>',
 'bike': f'<path {S} d="M3,16 a3.5,3.5 0 1,0 7,0 a3.5,3.5 0 1,0 -7,0 M14,16 a3.5,3.5 0 1,0 7,0 a3.5,3.5 0 1,0 -7,0 M6.5,16 L9.5,9.5 h6 L17.5,16 M9.5,9.5 L12,16 L15.5,9.5 M8,6.5 h3"/>',
}
syms = [conv(n, f) for n, f in MAP.items()] + [f'<symbol id="tn-i-{n}" viewBox="0 0 24 24">{b}</symbol>' for n, b in OWN.items()]
sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' + ''.join(syms) + '</svg>'
js = f"""// Trophy Navigator Desktop — набор иконок (SVG-спрайт).
// Сгенерировано из векторных иконок Android RaceNav (res/drawable/ic_*.xml: Material Icons, Apache 2.0,
// и собственные ic_set_* штрихом 2) + свои в том же стиле (штрих 2, viewBox 24): lock-open, ruler, cloud-*, search,
// road, palette, chevron-*, кнопки-значки вместо эмодзи (refresh, check, undo, save, …). Цвет — currentColor,
// т. е. берётся из темы. Не править руками: python3 tools/gen_tn_icons.py <android>/res/drawable ui/tn-icons.js
(function () {{
  'use strict';
  const SPRITE = {json.dumps(sprite, ensure_ascii=False)};
  function inject() {{
    if (document.getElementById('tn-icon-sprite')) return;
    const holder = document.createElement('div');
    holder.id = 'tn-icon-sprite';
    holder.hidden = true;
    holder.innerHTML = SPRITE;
    document.body.prepend(holder);
  }}
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject);
  /** Разметка иконки: tnIcon('folder') → <svg class="tn-ico">…</svg> */
  window.tnIcon = function (name, cls) {{
    return `<svg class="tn-ico${{cls ? ' ' + cls : ''}}" aria-hidden="true" focusable="false"><use href="#tn-i-${{name}}"></use></svg>`;
  }};
  window.TN_ICON_NAMES = {json.dumps(list(MAP) + list(OWN))};
}})();
"""
open(sys.argv[2], 'w', encoding='utf-8').write(js)
print(len(syms), 'icons', len(js), 'bytes')
