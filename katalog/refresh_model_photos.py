# -*- coding: utf-8 -*-
"""APRELL - перезабирает ВСЕ фото моделей со страниц товаров aprellshop.ru.
Для каждого варианта (site[].u) собирает все фото со страницы и кладёт в site[].i.
Хранит превью-ссылки (_680x1054); fullRes на сайте даёт оригинал для скачивания.
Запуск из katalog/:  python3 refresh_model_photos.py --dry  |  python3 refresh_model_photos.py
"""
import json, re, sys, time, shutil, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data.json"
SITE = "https://aprellshop.ru"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
PREVIEW = "_680x1054"  # размер превью, которое берём со страницы

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")

def slug_from_u(u):
    return (u or "").rstrip("/").rsplit("/", 1)[-1]

def photos_from_html(html, slug):
    """Фото текущего варианта из галерейных блоков. Берём src="..." внутри
    каждого блока (путь может содержать пробелы/кириллицу — напр. Брак 2025)."""
    seen, out = set(), []
    for chunk in html.split("mobile-good-gallery-item")[1:]:
        m = re.search(
            r'src="(/assets/cache_image/goods/[^"]+?' + re.escape(PREVIEW) +
            r'_[0-9a-f]+\.(?:jpg|jpeg|png|webp))"', chunk, re.I)
        if not m:
            continue
        u = m.group(1)
        if "/goods/Брак" in u:  # папка "Брак ..." — пропускаем
            continue
        if u not in seen:
            seen.add(u)
            out.append(SITE + urllib.parse.quote(u, safe="/:"))
    return out


def main():
    dry = "--dry" in sys.argv
    data = json.loads(DATA.read_text(encoding="utf-8"))
    total_before = total_after = touched = 0
    for m in data.get("models", []):
        for v in m.get("site", []):
            u = v.get("u")
            if not u:
                continue
            slug = slug_from_u(u)
            total_before += len(v.get("i") or [])
            try:
                html = fetch(u)
            except Exception as e:
                print("  ! %s: %s" % (slug, e)); continue
            pics = photos_from_html(html, slug)
            if pics:
                v["i"] = pics
                touched += 1
                print("  %s: %d foto" % (slug, len(pics)))
            else:
                print("  %s: 0 (ostavil kak bylo)" % slug)
            total_after += len(v.get("i") or [])
            time.sleep(0.25)
    print("\nvariantov obnovleno: %d" % touched)
    print("foto bylo: %d -> stalo: %d" % (total_before, total_after))
    if dry:
        print("[--dry] baza ne izmenena"); return
    shutil.copy(DATA, HERE / "data.backup.json")
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print("data.json obnovlen (bekap - data.backup.json)")

if __name__ == "__main__":
    main()
