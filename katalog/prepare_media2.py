# -*- coding: utf-8 -*-
"""
APRELL — заливка своих фото и видео в базу менеджера (версия 2).

ОТЛИЧИЕ ОТ ПЕРВОЙ ВЕРСИИ: цвет берётся из имени ПОДПАПКИ, а не из имени файла.
Имена самих файлов могут быть любыми — IMG_8854.HEIC, DSC09423.jpg, что угодно.

Ожидаемая структура:

    media_src/
        5114/
            черный/          ← подпапка = цвет
                IMG_8854.HEIC
                IMG_8855.HEIC
                видео.mp4
            бордовый/
                DSC09423.jpg
        5103/
            коричневый/
                ...

Порядок кадров — по алфавиту имён файлов. Чтобы задать свой порядок,
добавь цифру в начало имени: «1 главное.jpg», «2 сбоку.jpg».

Что делает:
  1. Конвертирует HEIC → JPEG (браузеры HEIC не показывают).
  2. Сжимает фото до 1400 px по длинной стороне, качество 82.
  3. Раскладывает в media/<артикул>/<цвет>-N.jpg
  4. Вписывает пути в data.json и пересобирает index.html.
  5. Пишет отчёт media_report.txt.

Запуск:
    python3 prepare_media2.py --dry     # посмотреть, что будет, ничего не меняя
    python3 prepare_media2.py           # применить
    python3 prepare_media2.py --only 5114 5103    # только эти модели
    python3 prepare_media2.py --keep-site         # оставить и фото с сайта
    python3 prepare_media2.py --limit 8           # не больше 8 кадров на цвет

Установить перед первым запуском:
    pip3 install --user Pillow pillow-heif
(pillow-heif нужен для HEIC; если не встанет — скрипт использует
 встроенный в macOS sips, это медленнее, но работает без установки)
"""

import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "media_src"
OUT = HERE / "media"
DATA = HERE / "data.json"
INDEX = HERE / "index.html"
REPORT = HERE / "media_report.txt"

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
VID_EXT = {".mp4", ".mov", ".m4v"}

try:
    from PIL import Image
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False

HAVE_HEIF = False
if HAVE_PIL:
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        HAVE_HEIF = True
    except ImportError:
        pass

HAVE_SIPS = shutil.which("sips") is not None


# --------------------------------------------------------------- цвета ----
# Как может называться подпапка → как цвет записан в базе (поле "c").
COLOR_MAP = {
    "черный": "Чёрный", "чёрный": "Чёрный", "black": "Чёрный",
    "молочный": "Молочный", "молоко": "Молочный", "белый": "Молочный",
    "бежевый": "Бежевый", "беж": "Бежевый", "светло-бежевый": "Бежевый",
    "бордовый": "Бордовый", "бордо": "Бордовый",
    "коричневый": "Коричневый", "коричн": "Коричневый", "рыжий": "Коричневый",
    "темно-коричневый": "Тёмно-коричневый", "тёмно-коричневый": "Тёмно-коричневый",
    "темнокоричневый": "Тёмно-коричневый", "тмкор": "Тёмно-коричневый",
    "шоколад": "Тёмно-коричневый", "шоколадный": "Тёмно-коричневый",
    "красный": "Красный", "red": "Красный",
    "зеленый": "Зелёный", "зелёный": "Зелёный",
    "оливковый": "Оливковый", "олива": "Оливковый",
    "синий": "Синий", "navy": "Синий", "темно-синий": "Синий",
    "голубой": "Голубой", "небесный": "Небесный",
    "серый": "Серый",
    "розовый": "Розовый", "пудровый": "Розовый",
    "желтый": "Жёлтый", "жёлтый": "Жёлтый", "горчичный": "Жёлтый",
    "тауп": "Тауп", "taupe": "Тауп",
    "пекан": "Пекан", "карамель": "Пекан", "карамельный": "Пекан",
    "змея": "Змеиный принт", "змеиный": "Змеиный принт",
    "змеиный принт": "Змеиный принт", "питон": "Змеиный принт",
}

TRANSLIT = {
    "Чёрный": "black", "Молочный": "milk", "Бежевый": "beige",
    "Бордовый": "bordo", "Коричневый": "brown", "Тёмно-коричневый": "darkbrown",
    "Красный": "red", "Зелёный": "green", "Оливковый": "olive",
    "Синий": "navy", "Голубой": "blue", "Небесный": "sky",
    "Серый": "grey", "Розовый": "pink", "Жёлтый": "yellow",
    "Тауп": "taupe", "Пекан": "pecan", "Змеиный принт": "python",
}


def norm(s):
    s = (s or "").lower().replace("ё", "е")
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[\s_]+", " ", s).strip()


def color_from_folder(name):
    """Имя подпапки → цвет базы. Сначала точное совпадение, потом вхождение."""
    n = norm(name)
    for key, val in COLOR_MAP.items():
        if norm(key) == n:
            return val
    for key in sorted(COLOR_MAP, key=len, reverse=True):
        if norm(key) in n:
            return COLOR_MAP[key]
    return None


def art_from_folder(folder):
    m = re.match(r"\s*([A-Za-zА-Яа-я]{0,3}\d{3,5}[A-Za-z]*)", folder.strip())
    return m.group(1) if m else folder.strip()


def art_key(a):
    d = re.search(r"\d{3,5}", a or "")
    return d.group(0).lstrip("0") if d else norm(a)


def sort_key(p):
    """Файлы с цифрой в начале имени идут по этой цифре, остальные — по алфавиту."""
    m = re.match(r"\s*(\d{1,3})\b", p.stem)
    return (0, int(m.group(1)), p.name) if m else (1, 0, p.name.lower())


# ----------------------------------------------------------- обработка ----
def heic_to_jpeg_via_sips(src, tmp):
    """Резервный путь для HEIC без pillow-heif — через встроенный sips (macOS)."""
    try:
        subprocess.run(["sips", "-s", "format", "jpeg", str(src),
                        "--out", str(tmp)],
                       check=True, capture_output=True)
        return tmp.exists()
    except Exception:
        return False


def process_image(src, dst, max_side):
    dst.parent.mkdir(parents=True, exist_ok=True)
    is_heic = src.suffix.lower() in {".heic", ".heif"}

    if not HAVE_PIL:
        shutil.copy(src, dst)
        return True

    work = src
    tmp = None
    if is_heic and not HAVE_HEIF:
        if not HAVE_SIPS:
            return False
        tmp = dst.parent / ("_tmp_" + src.stem + ".jpg")
        if not heic_to_jpeg_via_sips(src, tmp):
            return False
        work = tmp

    try:
        with Image.open(work) as im:
            im = im.convert("RGB")
            w, h = im.size
            if max(w, h) > max_side:
                k = max_side / max(w, h)
                im = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
            im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
        return True
    except Exception as e:
        print(f"      ! {src.name}: {e}")
        return False
    finally:
        if tmp and tmp.exists():
            tmp.unlink()


def process_video(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("ffmpeg"):
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                 "-vf", "scale='min(720,iw)':-2", "-c:v", "libx264",
                 "-crf", "28", "-preset", "medium", "-c:a", "aac",
                 "-b:a", "96k", "-movflags", "+faststart", str(dst)],
                check=True)
            return True
        except Exception:
            pass
    shutil.copy(src, dst)
    return True


def rebuild_index(data):
    if not INDEX.exists():
        return False
    s = INDEX.read_text(encoding="utf-8")
    mk = "const EMBED = "
    st = s.find(mk)
    if st < 0:
        return False
    st += len(mk)
    tail = s.find("let DATA", st)
    en = s.rfind(";", st, tail)
    if tail < 0 or en < 0:
        return False
    shutil.copy(INDEX, HERE / "index.backup.html")
    INDEX.write_text(s[:st] + json.dumps(data, ensure_ascii=False) + s[en:],
                     encoding="utf-8")
    return True


# ---------------------------------------------------------------- main ----
def main():
    dry = "--dry" in sys.argv
    keep_site = "--keep-site" in sys.argv
    max_side = 1400
    limit = 0
    only = []
    if "--max-side" in sys.argv:
        max_side = int(sys.argv[sys.argv.index("--max-side") + 1])
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    if "--only" in sys.argv:
        for a in sys.argv[sys.argv.index("--only") + 1:]:
            if a.startswith("--"):
                break
            only.append(art_key(a))

    if not SRC.exists():
        print(f"Нет папки {SRC.name}/ рядом со скриптом.")
        return
    if not HAVE_PIL:
        print("⚠ Pillow не установлен — фото копируются без сжатия.\n"
              "  pip3 install --user Pillow pillow-heif\n")
    elif not HAVE_HEIF:
        if HAVE_SIPS:
            print("· pillow-heif нет — HEIC пойдут через sips (медленнее).\n"
                  "  Быстрее будет так:  pip3 install --user pillow-heif\n")
        else:
            print("⚠ HEIC обработать нечем — эти файлы пропущу.\n"
                  "  pip3 install --user pillow-heif\n")

    data = json.loads(DATA.read_text(encoding="utf-8"))

    by_art = {}
    for m in data.get("models", []):
        for v in m.get("site", []):
            by_art.setdefault(art_key(v.get("a", "")), []).append(v)
    models_by_art = {art_key(m.get("full") or m.get("art")): m
                     for m in data.get("models", [])}

    total_ph = total_vd = 0
    flat_folders, unknown_colors, no_variant, failed = [], [], [], []

    folders = sorted([p for p in SRC.iterdir() if p.is_dir()])
    for folder in folders:
        art = art_from_folder(folder.name)
        key = art_key(art)
        if only and key not in only:
            continue

        subdirs = [p for p in sorted(folder.iterdir())
                   if p.is_dir() and not p.name.startswith(".")]
        loose = [p for p in folder.iterdir()
                 if p.is_file() and p.suffix.lower() in IMG_EXT
                 and not p.name.startswith(".")]

        variants = by_art.get(key, [])
        model = models_by_art.get(key)

        print(f"— {folder.name} (артикул {art})")

        if not subdirs:
            if loose:
                flat_folders.append(folder.name)
                print(f"    · нет подпапок по цветам ({len(loose)} файлов) — пропускаю")
            else:
                print("    · пусто")
            continue

        if not variants and not model:
            no_variant.append(folder.name)
            print("    ! модели нет в базе — пропускаю")
            continue

        for sub in subdirs:
            color = color_from_folder(sub.name)
            if not color:
                unknown_colors.append(f"{folder.name}/{sub.name}")
                print(f"    ! «{sub.name}» — не понял, что это за цвет")
                continue

            targets = [v for v in variants if v.get("c") == color]
            if not targets:
                no_variant.append(f"{folder.name} · {color}")
                print(f"    ! {color}: нет такого цвета в базе")
                continue

            imgs = sorted([p for p in sub.iterdir()
                           if p.suffix.lower() in IMG_EXT
                           and not p.name.startswith(".")], key=sort_key)
            vids = sorted([p for p in sub.iterdir()
                           if p.suffix.lower() in VID_EXT
                           and not p.name.startswith(".")], key=sort_key)
            if limit:
                imgs = imgs[:limit]

            slug = TRANSLIT.get(color, "color")
            paths, n = [], 0
            for f in imgs:
                n += 1
                rel = f"media/{art}/{slug}-{n}.jpg"
                if dry:
                    paths.append(rel)
                    continue
                if process_image(f, OUT / art / f"{slug}-{n}.jpg", max_side):
                    paths.append(rel)
                else:
                    failed.append(f"{folder.name}/{sub.name}/{f.name}")
                    n -= 1

            if paths:
                for v in targets:
                    v["i"] = (list(v.get("i") or []) + paths) if keep_site else paths
                total_ph += len(paths)

            if vids:
                rel = f"media/{art}/{slug}.mp4"
                if not dry:
                    process_video(vids[0], OUT / art / f"{slug}.mp4")
                for v in targets:
                    v["vid"] = rel
                total_vd += 1

            print(f"    + {color}: {len(paths)} фото"
                  f"{', видео' if vids else ''}"
                  f" → {len(targets)} вариант(ов)")

    if dry:
        print(f"\n[--dry] Ничего не записано. "
              f"Разложилось бы: {total_ph} фото, {total_vd} видео.")
        if flat_folders:
            print(f"\nБез подпапок по цветам ({len(flat_folders)}): "
                  + ", ".join(flat_folders))
        if unknown_colors:
            print(f"\nНепонятные подпапки ({len(unknown_colors)}): "
                  + ", ".join(unknown_colors))
        return

    shutil.copy(DATA, HERE / "data.backup.json")
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                    encoding="utf-8")

    lines = ["APRELL — заливка своих фото и видео", "",
             f"Разложено: {total_ph} фото, {total_vd} видео."]
    if flat_folders:
        lines += ["", f"Папки без подпапок по цветам ({len(flat_folders)}) — "
                      "разложи файлы по цветам, тогда подхватятся:"] + \
                 [f"  {x}" for x in flat_folders]
    if unknown_colors:
        lines += ["", f"Подпапки с непонятным названием ({len(unknown_colors)}):"] + \
                 [f"  {x}" for x in unknown_colors] + \
                 ["  → переименуй подпапку или добавь написание в COLOR_MAP."]
    if no_variant:
        lines += ["", f"Нет соответствия в базе ({len(no_variant)}):"] + \
                 [f"  {x}" for x in dict.fromkeys(no_variant)] + \
                 ["  → добавь вариант в блок \"site\" модели в data.json."]
    if failed:
        lines += ["", f"Не удалось обработать ({len(failed)}):"] + \
                 [f"  {x}" for x in failed[:40]]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n" + "\n".join(lines))

    if rebuild_index(data):
        print("\nindex.html пересобран (бэкап — index.backup.html).")
    else:
        print("\nindex.html не распознан — обнови только data.json.")


if __name__ == "__main__":
    main()
