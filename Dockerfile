FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build


FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    BASE_DIR=/app/server

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./
COPY --from=frontend-builder /app/frontend/dist ./public

RUN mkdir -p \
    public \
    server/uploaded_files \
    server/model \
    server/view-model-architecture \
    server/model-images

EXPOSE 8001

CMD ["uvicorn", "server_model.main:app", "--host", "0.0.0.0", "--port", "8001"]
