"""Генерация иконок веб-приложения ОМА.

Запуск из папки сайта:

    python tools/make-icons.py

На входе — белый логотип img/logo.png, на выходе — квадратные иконки
с фирменным фиолетовым градиентом (в том числе maskable и apple-touch).
Нужен Pillow: `pip install pillow`.
"""
from pathlib import Path

from PIL import Image, ImageDraw

SITE = Path(__file__).resolve().parent.parent
LOGO = SITE / "img" / "logo.png"
OUT = SITE / "icons"

TOP = (42, 17, 80)       # #2a1150
BOTTOM = (90, 17, 120)   # #5a1178


def gradient(size: int) -> Image.Image:
    """Вертикальный градиент фирменных цветов."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        f = y / max(1, size - 1)
        r = round(TOP[0] + (BOTTOM[0] - TOP[0]) * f)
        g = round(TOP[1] + (BOTTOM[1] - TOP[1]) * f)
        b = round(TOP[2] + (BOTTOM[2] - TOP[2]) * f)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def make_icon(size: int, logo_share: float, name: str) -> None:
    """Иконка с логотипом по центру.

    logo_share — какую долю ширины занимает логотип; для maskable берём меньше,
    чтобы логотип попал в безопасную зону маски.
    """
    base = gradient(size).convert("RGBA")

    logo = Image.open(LOGO).convert("RGBA")
    target_w = int(size * logo_share)
    target_h = round(logo.height * target_w / logo.width)
    logo = logo.resize((target_w, target_h), Image.LANCZOS)
    base.alpha_composite(logo, ((size - target_w) // 2, (size - target_h) // 2))

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    base.save(path)
    print(f"{path.relative_to(SITE)}  {size}x{size}  logo={target_w}x{target_h}")


if __name__ == "__main__":
    make_icon(192, 0.72, "icon-192.png")
    make_icon(512, 0.72, "icon-512.png")
    make_icon(512, 0.46, "icon-maskable-512.png")
    make_icon(180, 0.72, "apple-touch-icon.png")
    make_icon(32, 0.72, "favicon-32.png")
