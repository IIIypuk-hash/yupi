"""Точка входа: запускает FastAPI-сервер и открывает веб-интерфейс в браузере."""

import threading
import webbrowser

import uvicorn

from backend.app import app

HOST = "127.0.0.1"
PORT = 8000


def open_browser() -> None:
    webbrowser.open(f"http://{HOST}:{PORT}")


if __name__ == "__main__":
    threading.Timer(1.0, open_browser).start()
    uvicorn.run(app, host=HOST, port=PORT)
