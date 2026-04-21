#!/usr/bin/env python
import sys
import os

# Добавляем папку backend в путь поиска модулей
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

if __name__ == "__main__":
    import uvicorn
    print(f"Запуск из директории: {current_dir}")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )