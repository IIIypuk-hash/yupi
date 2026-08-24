"""Собирает игру в ZIP-архив, готовый к загрузке в Яндекс Игры.

Яндекс Игры принимают только статические HTML5-игры: файл index.html
должен лежать в КОРНЕ архива, а все ссылки на ресурсы — быть
относительными (без ведущего "/"), потому что игру монтируют не в корень
домена. Бэкенд на FastAPI (main.py/backend/) для публикации не нужен —
он существует только для локального запуска и разработки.

Запуск:
    python scripts/build_yandex.py

Результат: dist/yandex-game.zip
"""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT / "frontend"
DIST_DIR = ROOT / "dist"
STAGE_DIR = DIST_DIR / "yandex-game"
ZIP_PATH = DIST_DIR / "yandex-game.zip"


def main() -> None:
    if STAGE_DIR.exists():
        shutil.rmtree(STAGE_DIR)
    STAGE_DIR.mkdir(parents=True)

    # index.html идёт в корень архива.
    shutil.copy2(FRONTEND_DIR / "index.html", STAGE_DIR / "index.html")

    # style.css и game.js — в подпапку static/, как их и ищет index.html
    # (относительный путь "static/...").
    static_dir = STAGE_DIR / "static"
    static_dir.mkdir()
    shutil.copy2(FRONTEND_DIR / "style.css", static_dir / "style.css")
    shutil.copy2(FRONTEND_DIR / "game.js", static_dir / "game.js")

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(STAGE_DIR.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(STAGE_DIR))

    size_kb = ZIP_PATH.stat().st_size / 1024
    print(f"Готово: {ZIP_PATH} ({size_kb:.1f} КБ)")
    print("Содержимое архива:")
    with zipfile.ZipFile(ZIP_PATH) as zf:
        for name in zf.namelist():
            print(f"  {name}")


if __name__ == "__main__":
    main()
