#!/usr/bin/env python3
"""Dessine le logo (balance de la justice dorée sur fond bleu marine) et ses déclinaisons :
icônes de l'appli web, icône iPhone et écran de démarrage.

Usage : python3 tools/make_icons.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAVY_1, NAVY_2 = (27, 42, 99), (61, 52, 143)
GOLD = (232, 188, 62)
S = 1024


def gradient(size, c1, c2):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))
    return img


def scale_mark(size):
    """Balance dessinée sur un calque transparent de size × size."""
    k = size / S
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    g = GOLD + (255,)
    w = lambda v: max(1, round(v * k))
    cx = size / 2
    # Colonne, socle et fléau
    d.rounded_rectangle([cx - w(22), w(250), cx + w(22), w(790)], radius=w(14), fill=g)
    d.rounded_rectangle([cx - w(170), w(770), cx + w(170), w(820)], radius=w(25), fill=g)
    d.rounded_rectangle([cx - w(110), w(730), cx + w(110), w(780)], radius=w(20), fill=g)
    d.rounded_rectangle([cx - w(330), w(300), cx + w(330), w(338)], radius=w(19), fill=g)
    d.ellipse([cx - w(46), w(212), cx + w(46), w(304)], fill=g)
    # Plateaux suspendus
    for side in (-1, 1):
        px = cx + side * w(300)
        top = w(330)
        d.line([(px, top), (px - w(110), w(560))], fill=g, width=w(12))
        d.line([(px, top), (px + w(110), w(560))], fill=g, width=w(12))
        d.pieslice([px - w(140), w(470), px + w(140), w(650)], 0, 180, fill=g)
        d.ellipse([px - w(20), top - w(20), px + w(20), top + w(20)], fill=g)
    return layer


def icon(size, radius=0.0):
    img = gradient(S, NAVY_1, NAVY_2).convert("RGBA")
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([S * 0.45, -S * 0.35, S * 1.35, S * 0.55], fill=(122, 92, 199, 120))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(S * 0.08)))
    mark = scale_mark(S)
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.putalpha(mark.getchannel("A").point(lambda a: a * 0.35))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(14)).transform((S, S), Image.AFFINE, (1, 0, 0, 0, 1, -12)))
    img = Image.alpha_composite(img, mark)
    img = img.resize((size, size), Image.LANCZOS)
    if radius:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * radius), fill=255)
        img.putalpha(mask)
    return img


def splash(size=2732):
    img = gradient(512, NAVY_1, NAVY_2).resize((size, size), Image.BICUBIC).convert("RGBA")
    mark = scale_mark(900)
    img.alpha_composite(mark, ((size - 900) // 2, (size - 900) // 2 - 60))
    return img.convert("RGB")


def main():
    icons = os.path.join(ROOT, "app", "icons")
    os.makedirs(icons, exist_ok=True)
    icon(512).convert("RGB").save(os.path.join(icons, "icon-512.png"))
    icon(192).convert("RGB").save(os.path.join(icons, "icon-192.png"))
    icon(180).convert("RGB").save(os.path.join(icons, "apple-touch-icon.png"))
    icon(64, 0.22).save(os.path.join(icons, "favicon.png"))
    icon(128, 0.22).save(os.path.join(icons, "logo-mark.png"))
    xc = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets")
    if os.path.isdir(xc):
        icon(1024).convert("RGB").save(os.path.join(xc, "AppIcon.appiconset", "AppIcon-512@2x.png"))
        sp = splash()
        for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
            sp.save(os.path.join(xc, "Splash.imageset", name))


if __name__ == "__main__":
    main()
