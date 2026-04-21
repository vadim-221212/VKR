# Surface Visualizer

Учебная система для построения, визуализации и анализа математических поверхностей.

Стек:
- frontend: React + TypeScript + Vite + Three.js
- backend: FastAPI + SymPy + NumPy

## Локальный запуск

### Backend
```bash
cd backend/visualization_system/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend
```bash
cd /Users/vadimmedvedev/Desktop/surface-visualizer
npm install
npm run dev
```

Frontend по умолчанию ожидает backend на:
`http://127.0.0.1:8000/api`

## Деплой

Рекомендуемая схема:
- frontend: Vercel
- backend: Render

### 1. Deploy backend на Render

Root directory сервиса:
`backend/visualization_system/backend`

Build command:
```bash
pip install -r requirements.txt
```

Start command:
```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Environment variables:
```bash
CORS_ORIGINS=https://YOUR-FRONTEND-DOMAIN.vercel.app
```

Если доменов несколько, перечисли их через запятую:
```bash
CORS_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
```

После деплоя backend получишь URL вида:
`https://your-backend.onrender.com`

### 2. Deploy frontend на Vercel

В Vercel добавь переменную окружения:
```bash
VITE_API_BASE_URL=https://your-backend.onrender.com/api
```

Build command:
```bash
npm run build
```

Output directory:
```bash
dist
```

### 3. Проверка после деплоя

Проверь:
- открывается frontend-домен Vercel
- backend отвечает по `/`
- backend отвечает по `/docs`
- построение поверхностей работает
- запросы из frontend не блокируются CORS

## Полезные файлы для деплоя

- frontend API URL: [src/services/api.ts](/Users/vadimmedvedev/Desktop/surface-visualizer/src/services/api.ts)
- backend CORS: [backend/visualization_system/backend/app/main.py](/Users/vadimmedvedev/Desktop/surface-visualizer/backend/visualization_system/backend/app/main.py)
- Render config: [render.yaml](/Users/vadimmedvedev/Desktop/surface-visualizer/render.yaml)
- Vercel config: [vercel.json](/Users/vadimmedvedev/Desktop/surface-visualizer/vercel.json)

## Примеры для проверки

- `z = x^2 + y^2`
- `z = x^2 - y^2`
- `x^2 + y^2 + z^2 = 9`
- `x^2 + y^2 = z^2`
- `sin(x) * cos(y)`
- тор:
```text
x = (3 + cos(v)) * cos(u)
y = (3 + cos(v)) * sin(u)
z = sin(v)
```
