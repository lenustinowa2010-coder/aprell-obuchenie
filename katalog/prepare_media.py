# -*- coding: utf-8 -*-
"""
APRELL — заливка СВОИХ фото и видео (из папок на Mac) в базу менеджера.

Что делает:
  1. Читает папку media_src/ рядом со скриптом — там лежат твои папки моделей
     как есть: 5301/, 5114/, «4630 кожа»/, «5211 мак»/ и т.д.
  2. Сжимает фото (по длинной стороне до 1400 px, JPEG q82), переименовывает
     в латиницу и раскладывает в media/<артикул>/<цвет>-N.jpg.
     Видео копирует как есть (или сжимает, если стоит ffmpeg).
  3. По имени файла определяет цвет («5301 черный 1.jpg» → Чёрный) и вписывает
     пути в data.json: фото — в поле "i", видео — в новое поле "vid".
  4. Пересобирает index.html и пишет отчёт media_report.txt.

Запуск (из папки с data.json и index.html):
    python3 prepare_media.py                # обычный прогон
    python3 prepare_media.py --dry          # только показать, что будет сделано
    python3 prepare_media.py --keep-site    # не затирать фото с сайта, добавить свои в конец
    python3 prepare_media.py --max-side 1800  # другое качество сжатия

Требуется Pillow (для сжатия фото):
    pip3 install --user Pillow
Без Pillow скрипт всё равно отработает — просто скопирует фото без сжатия
(и предупредит об этом).
"""

import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "media_src"          # СЮДА кладёшь свои папки
OUT = HERE / "media"              # сюда скрипт раскладывает готовое
DATA = HERE / "data.json"
INDEX = HERE / "index.html"
REPORT = HERE / "media_report.txt"

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
VID_EXT = {".mp4", ".mov", ".m4v"}

try:
    from PIL import Image
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False


# ---------------------------------------------------------------- цвета ----
# Ключ — как может быть написано в имени файла (в нижнем регистре, без ё).
# Значение — как цвет называется в базе (поле "c").
COLOR_MAP = {
    "черный": "Чёрный", "чёрный": "Чёрный", "black": "Чёрный",
    "белый": "Молочный", "молочный": "Молочный", "молоко": "Молочный",
    "бежевый": "Бежевый", "беж": "Бежевый",
    "бордовый": "Бордовый", "бордо": "Бордовый",
    "коричневый": "Коричневый", "коричн": "Коричневый",
    "темно-коричневый": "Тёмно-коричневый", "тёмно-коричневый": "Тёмно-коричневый",
    "темнокоричневый": "Тёмно-коричневый", "темно коричневый": "Тёмно-коричневый",
    "тмкор": "Тёмно-коричневый", "шоколад": "Тёмно-коричневый",
    "красный": "Красный", "red": "Красный",
    "зеленый": "Зелёный", "зелёный": "Зелёный", "оливковый": "Оливковый",
    "олива": "Оливковый",
    "синий": "Синий", "navy": "Синий",
    "голубой": "Голубой", "небесный": "Небесный",
    "серый": "Серый",
    "розовый": "Розовый", "rose": "Розовый",
    "желтый": "Жёлтый", "жёлтый": "Жёлтый",
    "тауп": "Тауп", "taupe": "Тауп",
    "пекан": "Пекан", "карамель": "Пекан",
    "змея": "Змеиный принт", "змеиный": "Змеиный принт",
    "змеиный принт": "Змеиный принт", "питон": "Змеиный принт",
}

# латиница для имён файлов
TRANSLIT = {
    "Чёрный": "black", "Молочный": "milk", "Бежевый": "beige",
    "Бордовый": "bordo", "Коричневый": "brown", "Тёмно-коричневый": "darkbrown",
    "Красный": "red", "Зелёный": "green", "Оливковый": "olive",
    "Синий": "navy", "Голубой": "blue", "Небесный": "sky",
    "Серый": "grey", "Розовый": "pink", "Жёлтый": "yellow",
    "Тауп": "taupe", "Пекан": "pecan", "Змеиный принт": "python",
}


def norm(s: str) -> str:
    """нижний регистр, ё→е, схлопнутые пробелы"""
    s = (s or "").lower().replace("ё", "е")
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", " ", s).strip()


def detect_color(filename: str):
    """Из «5301 темно-коричневый 2.jpg» достаём 'Тёмно-коричневый'.
    Ищем от длинных названий к коротким, чтобы 'темно-коричневый'
    не распался на 'коричневый'."""
    n = norm(filename)
    for key in sorted(COLOR_MAP, key=len, reverse=True):
        if norm(key) in n:
            return COLOR_MAP[key]
    return None


def art_from_folder(folder: str) -> str:
    """«4630 кожа» → 4630; «5211 мак» → 5211; «WV4630 велюр» → WV4630."""
    m = re.match(r"\s*([A-Za-zА-Яа-я]{0,3}\d{3,5}[A-Za-z]*)", folder.strip())
    return m.group(1) if m else folder.strip()


def art_key(a: str) -> str:
    """Ключ для сравнения артикулов: без букв-префиксов и ведущих нулей.
    W5114 / SV5114 / 5114 → 5114. Нужно, чтобы папка «5114» нашла
    варианты S5114 и SV5114."""
    digits = re.search(r"\d{3,5}", a or "")
    return digits.group(0).lstrip("0") if digits else norm(a)


def seq_num(filename: str) -> int:
    """Номер кадра из имени: «... 3.jpg» → 3; без номера → 0 (главное фото)."""
    m = re.search(r"(\d{1,2})\s*$", Path(filename).stem)
    return int(m.group(1)) if m else 0


# ------------------------------------------------------------ обработка ----
def process_image(src: Path, dst: Path, max_side: int) -> bool:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not HAVE_PIL:
        shutil.copy(src, dst.with_suffix(src.suffix.lower()))
        return True
    try:
        with Image.open(src) as im:
            im = im.convert("RGB")
            w, h = im.size
            if max(w, h) > max_side:
                k = max_side / max(w, h)
                im = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
            im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
        return True
    except Exception as e:
        print(f"    ! {src.name}: {e}")
        return False


def process_video(src: Path, dst: Path) -> bool:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("ffmpeg"):
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                 "-vf", "scale='min(720,iw)':-2", "-c:v", "libx264",
                 "-crf", "28", "-preset", "medium", "-c:a", "aac", "-b:a", "96k",
                 "-movflags", "+faststart", str(dst)],
                check=True)
            return True
        except Exception as e:
            print(f"    ! ffmpeg не справился с {src.name}: {e}; копирую как есть")
    shutil.copy(src, dst)
    return True


def rebuild_index(data) -> bool:
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


# ----------------------------------------------------------------- main ----
def main():
    dry = "--dry" in sys.argv
    keep_site = "--keep-site" in sys.argv
    max_side = 1400
    if "--max-side" in sys.argv:
        max_side = int(sys.argv[sys.argv.index("--max-side") + 1])

    if not SRC.exists():
        print(f"Нет папки {SRC.name}/ — создай её рядом со скриптом и положи "
              f"внутрь свои папки моделей (5301, 5114, «4630 кожа» …).")
        return
    if not HAVE_PIL:
        print("⚠ Pillow не установлен — фото скопируются БЕЗ сжатия.\n"
              "  Установить:  pip3 install --user Pillow\n")

    data = json.loads(DATA.read_text(encoding="utf-8"))

    # индекс вариантов базы: ключ артикула → список вариантов
    by_art = {}
    for m in data.get("models", []):
        for v in m.get("site", []):
            by_art.setdefault(art_key(v.get("a", "")), []).append(v)
    # ещё индекс по модели целиком (для видео на всю модель)
    models_by_art = {art_key(m.get("full") or m.get("art")): m
                     for m in data.get("models", [])}

    report, matched, skipped, no_color, no_variant = [], 0, 0, [], []

    folders = sorted([p for p in SRC.iterdir() if p.is_dir()])
    print(f"Папок найдено: {len(folders)}\n")

    for folder in folders:
        art = art_from_folder(folder.name)
        key = art_key(art)
        variants = by_art.get(key, [])
        model = models_by_art.get(key)
        print(f"— {folder.name}  (артикул {art})")

        if not variants and not model:
            no_variant.append(folder.name)
            print("    ! нет такой модели в базе — пропускаю")
            continue

        # собираем файлы по цветам
        photos, videos = {}, {}
        model_video = None
        for f in sorted(folder.iterdir()):
            if f.name.startswith("."):
                continue
            ext = f.suffix.lower()
            color = detect_color(f.name)
            if ext in IMG_EXT:
                if color:
                    photos.setdefault(color, []).append(f)
                else:
                    no_color.append(f"{folder.name}/{f.name}")
            elif ext in VID_EXT:
                if color:
                    videos.setdefault(color, []).append(f)
                else:
                    model_video = f  # «5301.mp4» — видео на всю модель

        # раскладываем
        for color, files in sorted(photos.items()):
            targets = [v for v in variants if v.get("c") == color]
            if not targets:
                no_variant.append(f"{folder.name} · {color}")
                print(f"    ! {color}: нет такого цвета в базе")
                continue
            files.sort(key=lambda p: (seq_num(p.name), p.name))
            slug = TRANSLIT.get(color, "color")
            paths = []
            for n, f in enumerate(files, 1):
                dst = OUT / art / f"{slug}-{n}.jpg"
                if not dry:
                    if not process_image(f, dst, max_side):
                        continue
                paths.append(f"media/{art}/{slug}-{n}.jpg")
            for v in targets:
                if keep_site and v.get("i"):
                    v["i"] = list(v["i"]) + paths
                else:
                    v["i"] = paths
            matched += len(paths)
            print(f"    + {color}: {len(paths)} фото → {len(targets)} вариант(ов)")

        for color, files in sorted(videos.items()):
            targets = [v for v in variants if v.get("c") == color]
            if not targets:
                continue
            f = files[0]
            dst = OUT / art / f"{TRANSLIT.get(color,'color')}.mp4"
            if not dry:
                process_video(f, dst)
            for v in targets:
                v["vid"] = f"media/{art}/{TRANSLIT.get(color,'color')}.mp4"
            print(f"    + {color}: видео")

        if model_video is not None and model is not None:
            dst = OUT / art / "review.mp4"
            if not dry:
                process_video(model_video, dst)
            model["vidLocal"] = f"media/{art}/review.mp4"
            print("    + видео на модель")

    # ---- сохранение ----
    if dry:
        print("\n[--dry] Ничего не записано. Убери флаг, чтобы применить.")
        return

    shutil.copy(DATA, HERE / "data.backup.json")
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                    encoding="utf-8")

    lines = ["APRELL — заливка своих фото и видео", "",
             f"Файлов разложено: {matched}."]
    if no_color:
        lines += ["", f"⚠ Не понял цвет по имени файла ({len(no_color)}) — "
                      "пропущены:"] + [f"  {x}" for x in no_color[:60]]
        if len(no_color) > 60:
            lines.append(f"  … и ещё {len(no_color)-60}")
        lines.append("  → переименуй, добавив цвет в имя, или впиши "
                     "написание в COLOR_MAP в начале скрипта.")
    if no_variant:
        lines += ["", f"⚠ Нет соответствия в базе ({len(no_variant)}):"] + \
                 [f"  {x}" for x in dict.fromkeys(no_variant)]
        lines.append("  → добавь вариант в блок \"site\" нужной модели "
                     "в data.json (поля a, c, u).")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n" + "\n".join(lines))

    if rebuild_index(data):
        print("\nindex.html пересобран (бэкап — index.backup.html).")
    else:
        print("\nindex.html не распознан — обнови только data.json.")


if __name__ == "__main__":
    main()
