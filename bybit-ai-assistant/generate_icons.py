#!/usr/bin/env python3
"""Generate extension icons: robot head with chart bars, dark blue theme."""
from PIL import Image, ImageDraw
import math, os

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size

    # Background circle - dark blue gradient approximation
    bg_color = (15, 23, 50)
    accent   = (99, 102, 241)   # indigo
    green    = (16, 185, 129)   # emerald
    red_c    = (239, 68, 68)

    # Rounded square background
    r = s // 6
    d.rounded_rectangle([0, 0, s-1, s-1], radius=r, fill=bg_color)

    # ── Robot head (center top area) ──────────────────────────────────────
    head_margin = s * 0.12
    head_w = s * 0.56
    head_h = s * 0.38
    hx = (s - head_w) / 2
    hy = s * 0.08
    head_r = s * 0.07
    d.rounded_rectangle([hx, hy, hx+head_w, hy+head_h], radius=head_r, fill=(28, 38, 80))

    # Antenna
    ant_x = s / 2
    ant_y_top = hy - s * 0.10
    ant_y_bot = hy
    lw = max(1, int(s * 0.04))
    d.line([(ant_x, ant_y_bot), (ant_x, ant_y_top)], fill=accent, width=lw)
    dot_r = s * 0.04
    d.ellipse([ant_x - dot_r, ant_y_top - dot_r, ant_x + dot_r, ant_y_top + dot_r], fill=accent)

    # Eyes
    eye_y = hy + head_h * 0.35
    eye_r = s * 0.07
    left_eye_x  = hx + head_w * 0.28
    right_eye_x = hx + head_w * 0.72
    for ex in [left_eye_x, right_eye_x]:
        d.ellipse([ex - eye_r, eye_y - eye_r, ex + eye_r, eye_y + eye_r], fill=(200, 210, 255))
        pupil_r = eye_r * 0.45
        d.ellipse([ex - pupil_r, eye_y - pupil_r, ex + pupil_r, eye_y + pupil_r], fill=accent)

    # Mouth / speaker grille (3 small lines)
    mouth_y = hy + head_h * 0.72
    mouth_w = head_w * 0.4
    mouth_x = hx + (head_w - mouth_w) / 2
    seg = mouth_w / 4
    for i in range(3):
        x1 = mouth_x + i * seg
        x2 = x1 + seg * 0.65
        d.rectangle([x1, mouth_y - s*0.015, x2, mouth_y + s*0.015], fill=accent)

    # ── Candlestick bars (bottom area) ────────────────────────────────────
    bar_area_top    = hy + head_h + s * 0.06
    bar_area_bottom = s * 0.94
    bar_area_h = bar_area_bottom - bar_area_top

    bars = [
        # (relative_x_center, relative_height, is_green, has_wick_top, has_wick_bot)
        (0.18, 0.45, False, True,  True),
        (0.36, 0.65, True,  True,  True),
        (0.54, 0.50, True,  True,  False),
        (0.72, 0.80, True,  True,  True),
        (0.86, 0.60, False, True,  True),
    ]
    bar_w = s * 0.09
    wick_w = max(1, int(s * 0.025))

    for rel_x, rel_h, is_green, wt, wb in bars:
        cx   = s * rel_x + hx * 0.1
        bh   = bar_area_h * rel_h
        by   = bar_area_bottom - bh
        bx   = cx - bar_w / 2
        col  = green if is_green else red_c

        # Body
        d.rectangle([bx, by, bx + bar_w, bar_area_bottom], fill=col)

        # Wicks
        if wt:
            wick_top = by - bar_area_h * 0.12
            d.line([(cx, wick_top), (cx, by)], fill=col, width=wick_w)
        if wb:
            wick_bot = bar_area_bottom + bar_area_h * 0.05
            d.line([(cx, bar_area_bottom), (cx, wick_bot)], fill=col, width=wick_w)

    return img

sizes = [16, 32, 48, 128]
out_dir = os.path.dirname(os.path.abspath(__file__))

for sz in sizes:
    icon = draw_icon(sz)
    path = os.path.join(out_dir, f'icon{sz}.png')
    icon.save(path, 'PNG')
    print(f'Saved {path}')

print('Done!')
