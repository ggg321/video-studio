"""Draw one emoji as a transparent PNG using Windows' Segoe UI Emoji (colour). usage: emoji_render.py <emoji> <out.png>"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

emoji, out = sys.argv[1], sys.argv[2]
if sys.platform == 'darwin':
    font = ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc', 160)    # Apple's colour bitmaps exist at size 160 only
else:
    font = ImageFont.truetype(r'C:\Windows\Fonts\seguiemj.ttf', 109)      # 109 is the size the colour bitmaps are made for
canvas = Image.new('RGBA', (220, 220), (0, 0, 0, 0))
ImageDraw.Draw(canvas).text((40, 40), emoji, font=font, embedded_color=True)
box = canvas.getbbox()
if not box:
    sys.exit(2)
img = canvas.crop(box)
side = max(img.size)
square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
square.resize((256, 256), Image.LANCZOS).save(out)
