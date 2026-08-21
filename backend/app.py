"""FastAPI-приложение: принимает два .docx документа через веб-интерфейс."""

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Docx Uploader")

# Статика (css/js) отдаётся из /static, сам index.html — с корня "/".
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


def _ensure_docx(file: UploadFile) -> None:
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail=f"Файл «{file.filename}» должен быть в формате .docx",
        )


@app.post("/api/upload")
async def upload_documents(
    document1: UploadFile = File(...),
    document2: UploadFile = File(...),
):
    """Принимает два .docx файла и сохраняет их на диск."""
    _ensure_docx(document1)
    _ensure_docx(document2)

    saved = []
    for file in (document1, document2):
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail=f"Файл «{file.filename}» пуст")
        dest = UPLOAD_DIR / file.filename
        dest.write_bytes(content)
        saved.append({"filename": file.filename, "size": len(content)})

    return {"status": "ok", "files": saved}
