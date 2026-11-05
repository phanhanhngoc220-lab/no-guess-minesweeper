import math
from PIL import Image, ImageDraw

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded background
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=96, fill=(15, 26, 51, 255),
                    outline=(87, 124, 210, 255), width=6)

cx, cy = S // 2, S // 2 + 10
r = 120
# spikes
for k in range(8):
    a = math.radians(k * 45 + 22.5)
    x1, y1 = cx + math.cos(a) * (r + 18), cy + math.sin(a) * (r + 18)
    x2, y2 = cx + math.cos(a) * (r + 62), cy + math.sin(a) * (r + 62)
    d.line([(x1, y1), (x2, y2)], fill=(232, 238, 252, 255), width=26)

# body
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(30, 47, 86, 255),
          outline=(232, 238, 252, 255), width=10)
# highlight
d.ellipse([cx - r + 42, cy - r + 34, cx - r + 104, cy - r + 96], fill=(120, 160, 235, 180))

# fuse spark
d.ellipse([cx + 96, cy - 190, cx + 150, cy - 136], fill=(255, 176, 32, 255))

img.save(r"E:\dk1\minesweeper-app\build\icon.png")
img.save(r"E:\dk1\minesweeper-app\build\icon.ico",
         sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print("icon written")
