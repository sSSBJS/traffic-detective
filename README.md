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

## Run with Docker

This builds the React app and serves it from the FastAPI container.

```bash
docker compose up --build
```

For GPT-generated reports, export an OpenAI API key before starting Docker. If the key is missing or the API call fails, the app falls back to a local MVP report.

```bash
export OPENAI_API_KEY=your_api_key
export OPENAI_REPORT_MODEL=gpt-5-mini
docker compose up --build
```

Open:

```text
http://localhost:8001
```

Health check:

```bash
curl http://localhost:8001/health
```

## Runtime model update

The MVP service includes an admin endpoint that swaps the active model without restarting the server. When the real traffic forecasting training code is added, it can call this endpoint after retraining finishes.

Set a token for the admin endpoint:

```bash
export MODEL_ADMIN_TOKEN=change-me
export MODEL_LOADER_MODULE=server_model.traffic_model_loader
docker compose up --build
```

The loader module should expose one of these functions:

```python
def load_model(path: str):
    ...

# or
def load(path: str):
    ...
```

Update from a local artifact path:

```bash
curl -X POST http://localhost:8001/api/v1/admin/update-model \
  -H "Content-Type: application/json" \
  -H "x-admin-token: change-me" \
  -d '{
    "model_version_id": "traffic_model_v2",
    "model_name": "traffic_forecaster",
    "artifact_path": "/app/server/model/runtime/traffic_model_v2.pkl",
    "source": "manual_retraining"
  }'
```

Update from a downloadable artifact URL:

```bash
curl -X POST http://localhost:8001/api/v1/admin/update-model \
  -H "Content-Type: application/json" \
  -H "x-admin-token: change-me" \
  -d '{
    "model_version_id": "traffic_model_v2",
    "model_name": "traffic_forecaster",
    "artifact_url": "https://example.com/models/traffic_model_v2.pkl",
    "source": "manual_retraining"
  }'
```

Check the active runtime model:

```bash
curl http://localhost:8001/api/v1/system/runtime-model
```
