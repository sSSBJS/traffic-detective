# Model Serving Report

## Current frontend structure

- Legacy frontend: static assets under `public/`
- Backend: FastAPI app in `server_model/main.py`
- Current API endpoints used by the UI:
  - `POST /upload`
  - `GET /download`
  - `GET /view-download`

## New React frontend

The new frontend lives in `frontend/` and uses:

- React
- Vite
- TypeScript
- Tailwind CSS

### Run the backend

```bash
python3 -m uvicorn server_model.main:app --port 8001 --reload
```

### Run the frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

If your backend runs on a different origin, update `VITE_API_BASE_URL` in `.env`.
