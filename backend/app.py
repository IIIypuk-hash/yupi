"""FastAPI-приложение: отдаёт статическую веб-игру."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

# Реальный Яндекс на своём сервере отдаёт "/sdk.js" сам — это относительный
# путь именно потому, что там он проксируется автоматически. Локально такого
# прокси нет, так что здесь просто редиректим на настоящий CDN, чтобы можно
# было тестировать с настоящим SDK и в локальной разработке тоже.
YANDEX_SDK_URL = "https://sdk.games.s3.yandex.net/sdk.js"

app = FastAPI(title="Space Fighter")

# Статика (css/js) отдаётся из /static, сам index.html — с корня "/".
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/sdk.js")
async def yandex_sdk_proxy() -> RedirectResponse:
    """Только для локальной разработки — на самой платформе Яндекса этот
    путь никогда не долетает до нашего сервера, его перехватывает Яндекс.
    """
    return RedirectResponse(YANDEX_SDK_URL)
