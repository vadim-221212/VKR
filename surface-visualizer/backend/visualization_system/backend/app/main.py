import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router

app = FastAPI(
    title="Surface Visualization API",
    description="API для визуализации и анализа математических поверхностей",
    version="1.0.0"
)

def _parse_cors_origins() -> list[str]:
    raw_value = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


cors_origins = _parse_cors_origins()
allow_all_origins = "*" in cors_origins

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем маршруты
app.include_router(router, prefix="/api")

@app.get("/")
async def root():
    return {
        "message": "Surface Visualization API",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
