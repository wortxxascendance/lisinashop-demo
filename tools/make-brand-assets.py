"""Готовит фирменные файлы из исходников бренда (запускается вручную, при смене логотипа или шрифта):
  - логотип-лиса: из растровой картинки делает векторный SVG (assets/logo-fox.svg) и путь для спрайта в index.html;
  - шрифт Bebas Neue: из .otf делает компактный woff2 (assets/fonts/bebas-neue.woff2).
Запуск:  python tools/make-brand-assets.py "путь\\к\\логотипу.jpg" "путь\\к\\bebas-neue.otf"
Нужны пакеты: pillow, numpy, potracer, fonttools, brotli.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
import potrace
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
logo_path, font_path = sys.argv[1], sys.argv[2]


def trace_logo():
    img = Image.open(logo_path).convert('RGB')
    arr = np.asarray(img).astype(int)
    # «чернила» логотипа: насколько пиксель отличается от белого фона (розовый даёт большое значение)
    ink = 255 - arr[:, :, 1]
    mask = ink > 90
    h, w = mask.shape
    bm = potrace.Bitmap(~mask)  # potracer считает «чернилами» False, поэтому передаём инвертированную маску
    plist = bm.trace(turdsize=30, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.4)
    parts = []
    for curve in plist:
        s = curve.start_point
        d = [f'M{s.x:.1f} {s.y:.1f}']
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f'L{seg.c.x:.1f} {seg.c.y:.1f}L{seg.end_point.x:.1f} {seg.end_point.y:.1f}')
            else:
                d.append(f'C{seg.c1.x:.1f} {seg.c1.y:.1f} {seg.c2.x:.1f} {seg.c2.y:.1f} {seg.end_point.x:.1f} {seg.end_point.y:.1f}')
        d.append('Z')
        parts.append(''.join(d))
    path = ''.join(parts)
    pink = '#f05692'
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><path fill="{pink}" fill-rule="evenodd" d="{path}"/></svg>\n')
    (ROOT / 'assets' / 'logo-fox.svg').write_text(svg, encoding='utf-8')
    (ROOT / 'assets' / 'logo-fox.json').write_text(json.dumps({'w': w, 'h': h, 'd': path}), encoding='utf-8')
    # значок вкладки: логотип на тёмном скруглённом квадрате, с полями
    scale = 44 / max(w, h)
    ox, oy = (64 - w * scale) / 2, (64 - h * scale) / 2
    fav = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#171214"/>'
           f'<path fill="{pink}" fill-rule="evenodd" transform="translate({ox:.2f} {oy:.2f}) scale({scale:.5f})" d="{path}"/></svg>\n')
    (ROOT / 'assets' / 'favicon.svg').write_text(fav, encoding='utf-8')
    print(f'логотип: {w}x{h}, контуров {len(plist)}, путь {len(path) // 1024} КБ')


def convert_font():
    out = ROOT / 'assets' / 'fonts'
    out.mkdir(parents=True, exist_ok=True)
    font = TTFont(font_path)
    font.flavor = 'woff2'
    font.save(out / 'bebas-neue.woff2')
    cmap = font.getBestCmap()
    has_latin = all(ord(c) in cmap for c in 'PILULYA')
    has_cyr = all(ord(c) in cmap for c in 'АБВГД')
    print(f'шрифт: {font["name"].getDebugName(4)}, латиница {"есть" if has_latin else "НЕТ"}, кириллица {"есть" if has_cyr else "нет"}, '
          f'{(out / "bebas-neue.woff2").stat().st_size // 1024} КБ')


trace_logo()
convert_font()
