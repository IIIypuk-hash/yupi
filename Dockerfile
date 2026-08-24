FROM python:3.12-slim

# Не писать .pyc и не буферизовать вывод — удобнее для логов в докере
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Сначала зависимости — отдельный слой кэша
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Затем код приложения
COPY backend ./backend
COPY frontend ./frontend
COPY main.py .

# Непривилегированный пользователь
RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 6000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:6000/')" || exit 1

# В контейнере не нужно открывать браузер (main.py это делает) —
# запускаем uvicorn напрямую и слушаем на всех интерфейсах.
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "6000"]
