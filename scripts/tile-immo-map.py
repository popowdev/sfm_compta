#!/usr/bin/env python3
"""Découpe une image en pyramide de tuiles 256px (même schéma que le tuileur NPU).
Usage: python3 tile-immo-map.py <image_source> [dossier_sortie]
  défaut sortie: /var/www/rp-compta/tiles/immo
Produit: <out>/{z}/{x}/{y}.png  +  <out>/meta.json {w,h,maxZoom,tileSize,base}
Puis: sudo chown -R www-data:www-data /var/www/rp-compta/tiles  (servi par nginx sur /immo-tiles/)
"""
import sys, os, json, math, shutil
from PIL import Image

TILE = 256
def main():
    if len(sys.argv) < 2:
        print("usage: tile-immo-map.py <image> [out_dir]"); sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "/var/www/rp-compta/tiles/immo"
    img = Image.open(src).convert("RGBA")
    W, H = img.size
    maxz = max(0, math.ceil(math.log2(max(W, H) / TILE)))
    if os.path.isdir(out): shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)
    for z in range(0, maxz + 1):
        scale = 2 ** (z - maxz)
        zw, zh = max(1, round(W * scale)), max(1, round(H * scale))
        zimg = img.resize((zw, zh), Image.LANCZOS)
        cols, rows = math.ceil(zw / TILE), math.ceil(zh / TILE)
        for x in range(cols):
            os.makedirs(f"{out}/{z}/{x}", exist_ok=True)
            for y in range(rows):
                tile = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
                tile.paste(zimg.crop((x*TILE, y*TILE, min((x+1)*TILE, zw), min((y+1)*TILE, zh))), (0, 0))
                tile.save(f"{out}/{z}/{x}/{y}.png")
        print(f"  z={z}: {cols}x{rows} tuiles ({zw}x{zh}px)")
    json.dump({"w": W, "h": H, "maxZoom": maxz, "tileSize": TILE, "base": "/immo-tiles"},
              open(f"{out}/meta.json", "w"))
    print(f"OK — {W}x{H}px, zoom 0→{maxz}. meta.json écrit dans {out}")
    print("Pense à: sudo chown -R www-data:www-data /var/www/rp-compta/tiles")

if __name__ == "__main__":
    main()
