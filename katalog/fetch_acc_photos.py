# -*- coding: utf-8 -*-
"""APRELL - подтягивает фото аксессуаров с сайта aprellshop.ru в data.json.
В базу пишутся ссылки на картинки сайта (поле i), как у моделей.
Запуск из katalog/:  python3 fetch_acc_photos.py --dry  |  python3 fetch_acc_photos.py
"""
import json, re, sys, time, shutil, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data.json"
SITE = "https://aprellshop.ru"
CATEGORIES = [
    "/catalog/aksessuary/perchatki",
    "/catalog/aksessuary/brelok",
    "/catalog/aksessuary/nebolshie-aksessuaryi/bumazhnik",
    "/catalog/aksessuary/nebolshie-aksessuaryi/koshelek",
    "/catalog/aksessuary/nebolshie-aksessuaryi",
]
# Цвета-фильтры: на них выводятся товары, которых нет на общей странице раздела.
COLORS = [
    "chernyij", "bordovyij", "krasnyij", "bezhevyij", "korichnevyij",
    "konyak", "olivkovyij", "goluboj", "belyij", "rozovyij", "zelenyij",
    "oranzhevyij", "svetlo-kremovyij", "karri", "ryabina",
    "naturalnaya-kozha-(myagkaya)",
]
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")

def art_key(a):
    a = (a or "").lower().split("(")[0].split(",")[0].strip()
    for tok in a.split(" "):
        m = re.match(r"([a-z\u0430-\u044f]*\d+[a-z\u0430-\u044f]*)", tok)
        if m:
            return m.group(1)
    return a.split(" ")[0]

def slug_key(slug):
    return art_key(re.sub(r"-[0-9a-z]+$", "", slug))

def collect_product_links():
    pages = list(CATEGORIES)
    for cat in CATEGORIES:
        for c in COLORS:
            pages.append(cat + "/" + c)
    links = set()
    for page in pages:
        try:
            html = fetch(SITE + page)
        except Exception:
            continue
        found = re.findall(r'href="(/catalog/aksessuary/[a-z0-9/()\-]+/[a-z]*\d+[a-z]*-[0-9a-z]+)"', html)
        for f in found:
            links.add(f)
        time.sleep(0.2)
    print("  . stranic obojdeno: %d" % len(pages))
    return sorted(links)


def photos_from_page(html):
    raw = re.findall(r'(?:data-image|data-src|href)="(/goods/[^"]+\.(?:jpg|jpeg|png|webp))"', html, re.I)
    out = []
    for u in raw:
        if "cache_image" in u: continue
        full = SITE + u
        if full not in out: out.append(full)
    return out

def main():
    dry = "--dry" in sys.argv
    data = json.loads(DATA.read_text(encoding="utf-8"))
    acc_by_key = {}
    for a in data.get("acc", []):
        acc_by_key.setdefault(art_key(a.get("art", "")), a)
    print("Sobirau ssylki na kartochki...")
    links = collect_product_links()
    print("Vsego kartochek: %d\n" % len(links))
    by_key = {}; unmatched = []
    for path in links:
        slug = path.rsplit("/", 1)[-1]
        key = slug_key(slug)
        if key not in acc_by_key:
            unmatched.append(slug); continue
        try:
            html = fetch(SITE + path)
        except Exception as e:
            print("  ! %s: %s" % (path, e)); continue
        pics = photos_from_page(html)
        if pics:
            lst = by_key.setdefault(key, [])
            for p in pics:
                if p not in lst: lst.append(p)
        print("  %s: %d foto -> artikul %s" % (slug, len(pics), key))
        time.sleep(0.3)
    matched = total = 0
    for key, pics in by_key.items():
        acc_by_key[key]["i"] = pics[:6]; matched += 1; total += len(pics[:6])
    print("\nSopostavleno: %d, foto zapisano: %d" % (matched, total))
    without = [a.get("art") for a in data.get("acc", []) if not acc_by_key.get(art_key(a.get("art","")), {}).get("i")]
    if without: print("Bez foto (%d): %s" % (len(without), ", ".join(str(x) for x in without)))
    if unmatched: print("\nNa sajte bez pary v baze (%d): %s" % (len(unmatched), ", ".join(sorted(set(unmatched)))))
    if dry:
        print("\n[--dry] Baza ne izmenena."); return
    shutil.copy(DATA, HERE / "data.backup.json")
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\ndata.json obnovlen (bekap - data.backup.json).")

if __name__ == "__main__":
    main()
