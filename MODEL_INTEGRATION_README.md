# 모델링 코드 연동 가이드

이 문서는 모델링 코드를 작성한 사람이 현재 FastAPI 백엔드와 모델 코드를 연결할 때 필요한 계약을 정리합니다.

현재 서비스는 7일 단위 배치를 순차 평가하고, 성능 저하가 감지되면 보고서를 만든 뒤 사용자가 승인했을 때 기존 운영 모델 파일을 덮어써 재학습합니다.

## 1. 연결 방식

백엔드는 `.env`의 모듈 경로를 보고 모델 코드를 동적으로 import합니다.

```env
MODEL_LOADER_MODULE=server_model.traffic_model_loader
MODEL_EVALUATOR_MODULE=server_model.traffic_model_evaluator
MODEL_TRAINER_MODULE=server_model.traffic_model_trainer
```

Docker 실행 시에는 `docker-compose.yml`이 위 환경변수를 컨테이너로 전달합니다.

```bash
docker compose up -d --build
```

모듈 경로는 Python import 경로입니다. 예를 들어 `MODEL_EVALUATOR_MODULE=server_model.traffic_model_evaluator`를 사용하려면 아래 파일이 있어야 합니다.

```text
server_model/traffic_model_evaluator.py
```

## 2. 전체 흐름

```text
성능 평가 실행
-> 서버가 7일 단위 배치를 순서대로 생성
-> MODEL_EVALUATOR_MODULE.evaluate_batch(batch, model) 호출
-> 모델 result의 rmse / smape / r2 / predictions / actuals 반환
-> 백엔드가 RMSE 기준으로 재학습 필요 여부 판단
-> 성능 저하 감지 시 평가 중단 및 GPT 보고서 생성
-> 사용자가 재학습 요청
-> MODEL_TRAINER_MODULE.retrain_model(...) 호출
-> 기존 운영 모델 파일 덮어쓰기
-> 중단된 다음 7일 배치부터 자동 재평가
```

예를 들어 `batch_003`에서 성능 저하가 감지되면, 재학습에는 `batch_001`, `batch_002`가 사용되고 재학습 후 평가는 `batch_004`부터 이어집니다.

## 3. 모델 로더

모델 로더는 학습된 모델 파일을 메모리에 올립니다.

지원 함수명은 둘 중 하나입니다.

```python
def load_model(path: str):
    ...

# 또는
def load(path: str):
    ...
```

예시:

```python
# server_model/traffic_model_loader.py

import joblib


def load_model(path: str):
    return joblib.load(path)
```

모델 파일을 운영 모델로 반영하려면 관리자 API를 호출합니다.

```bash
curl -X POST http://localhost:8001/api/v1/admin/update-model \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${MODEL_ADMIN_TOKEN}" \
  -d '{
    "model_version_id": "traffic_model_v1",
    "model_name": "traffic_forecaster",
    "artifact_path": "/app/server/model/runtime/active_traffic_model.pkl",
    "source": "manual_initial_training",
    "metadata": {
      "rmse": 125.0,
      "smape": 10.0,
      "r2": 0.82
    }
  }'
```

`metadata.rmse`는 이후 성능 저하 판단의 기준 RMSE로 사용됩니다.

## 4. 모델 평가기

모델 평가기는 7일 배치 하나를 받아 예측 결과와 성능지표를 반환합니다.

지원 함수명은 둘 중 하나입니다.

```python
def evaluate_batch(batch: dict, model):
    ...

# 또는
def evaluate(batch: dict, model):
    ...
```

현재 백엔드는 먼저 `evaluate_batch(batch, model)` 형태로 호출하고, 인자 개수가 맞지 않으면 `evaluate_batch(batch)` 형태를 한 번 더 시도합니다.

### batch 입력 형태

현재 mock 배치는 아래 구조입니다.

```python
{
    "batch_id": "batch_004",
    "batch_index": 3,
    "window_days": 7,
    "start_at": "2026-04-21T00:00:00+09:00",
    "end_at": "2026-04-27T00:00:00+09:00",
    "forecast_points": [
        {
            "timestamp": "2026-04-21T00:00:00+09:00",
            "actual": 1284.0,
            "predicted": 1195.0
        }
    ]
}
```

실제 데이터 소스가 붙으면 `forecast_points`를 실제 7일치 트래픽 데이터로 교체하거나, evaluator가 이 배치 정보를 사용해 별도 데이터 저장소에서 원천 데이터를 조회하면 됩니다.

### 반환값 형태

모델은 `pass/nonpass`를 반환하지 않습니다. 성능지표와 실제값/예측값을 반환하면 백엔드가 재학습 여부를 판단합니다.

```python
{
    "model_key": "traffic_forecaster",
    "display_name": "Traffic Forecast Model",
    "order": "lookback=168,horizon=7d",
    "rmse": 193.3,
    "smape": 16.36,
    "r2": 0.72,
    "predictions": [1180.0, 1212.5, 1199.3],
    "actuals": [1201.0, 1240.0, 1175.0]
}
```

예시:

```python
# server_model/traffic_model_evaluator.py

from sklearn.metrics import mean_squared_error, r2_score


def smape(actuals, predictions):
    total = 0.0
    for actual, predicted in zip(actuals, predictions):
        denom = max((abs(actual) + abs(predicted)) / 2, 1)
        total += abs(actual - predicted) / denom
    return total / max(len(actuals), 1) * 100


def evaluate_batch(batch: dict, model):
    rows = batch["forecast_points"]
    actuals = [float(row["actual"]) for row in rows]

    # 실제 모델 입력 전처리는 모델링 코드 기준에 맞게 작성합니다.
    features = rows
    predictions = [float(value) for value in model.predict(features)]

    rmse = mean_squared_error(actuals, predictions, squared=False)

    return {
        "model_key": "traffic_forecaster",
        "display_name": "Traffic Forecast Model",
        "order": "lookback=168,horizon=7d",
        "rmse": round(rmse, 2),
        "smape": round(smape(actuals, predictions), 2),
        "r2": round(r2_score(actuals, predictions), 2),
        "predictions": predictions,
        "actuals": actuals,
    }
```

프론트의 그래프는 이 `actuals`와 `predictions`를 기반으로 표시됩니다.

## 5. 재학습기

재학습기는 성능 저하 전까지의 배치를 받아 기존 모델 파일을 덮어씁니다.

지원 함수명은 둘 중 하나입니다.

```python
def retrain_model(training_batches, current_model, target_artifact_path):
    ...

# 또는
def retrain(training_batches, current_model, target_artifact_path):
    ...
```

`training_batches`에는 이상 감지 배치 직전까지의 배치가 들어옵니다.

```python
[
    {"batch_id": "batch_001", "forecast_points": [...]},
    {"batch_id": "batch_002", "forecast_points": [...]}
]
```

예시:

```python
# server_model/traffic_model_trainer.py

import joblib


def retrain_model(training_batches, current_model, target_artifact_path):
    train_rows = []
    for batch in training_batches:
        train_rows.extend(batch["forecast_points"])

    # 실제 학습 데이터 변환과 학습 로직은 모델링 코드 기준에 맞게 작성합니다.
    features = train_rows
    targets = [float(row["actual"]) for row in train_rows]

    trained_model = current_model
    trained_model.fit(features, targets)

    # 중요: 기존 운영 모델 파일 경로에 덮어씁니다.
    joblib.dump(trained_model, target_artifact_path)

    return {
        "model_object": trained_model,
        "artifact_path": target_artifact_path,
    }
```

## 6. 재학습 판단 기준

재학습 여부는 모델이 직접 보내지 않고 백엔드가 판단합니다.

현재 기본 정책:

```text
current_rmse > previous_rmse * (1 + RETRAINING_THRESHOLD_RATIO)
```

기본 환경변수:

```env
RETRAINING_THRESHOLD_RATIO=0.15
RETRAINING_STALE_AFTER_DAYS=30
```

즉 기준 RMSE가 `125.0`이고 현재 RMSE가 `143.75`를 넘으면 재학습 필요로 판단합니다.

## 7. 배치 API

배치를 따로 가져오는 endpoint는 없습니다. 평가 시작 API가 배치 생성과 순차 평가를 함께 트리거합니다.

```bash
curl -X POST http://localhost:8001/api/v1/evaluations \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_type": "manual",
    "max_batches": 6,
    "start_batch_index": 0
  }'
```

응답의 `evaluation_id`로 진행 상태를 조회합니다.

```bash
curl http://localhost:8001/api/v1/evaluations/eval_001
```

조회 응답에는 아래 필드가 포함됩니다.

```text
status          : queued / running / generating_report / completed / stopped_on_retrain_required / failed
current_batch   : 현재 평가 중인 배치
batch_results   : 평가 완료된 배치 결과 목록
failed_batch    : 성능 저하로 중단된 배치
forecast_points : 화면 그래프용 실제값/예측값
```

## 8. 파일 배치 예시

권장 구조:

```text
server_model/
  main.py
  traffic_model_loader.py
  traffic_model_evaluator.py
  traffic_model_trainer.py
```

`.env`:

```env
MODEL_ADMIN_TOKEN=change-me
MODEL_LOADER_MODULE=server_model.traffic_model_loader
MODEL_EVALUATOR_MODULE=server_model.traffic_model_evaluator
MODEL_TRAINER_MODULE=server_model.traffic_model_trainer
```

## 9. 연동 체크리스트

1. 모델 파일이 컨테이너 내부에서 접근 가능한 경로에 있는지 확인합니다.
2. `MODEL_LOADER_MODULE`의 `load_model(path)`가 모델 객체를 반환하는지 확인합니다.
3. `MODEL_EVALUATOR_MODULE`의 `evaluate_batch(batch, model)`가 `rmse`, `smape`, `r2`, `predictions`, `actuals`를 반환하는지 확인합니다.
4. `MODEL_TRAINER_MODULE`의 `retrain_model(...)`가 `target_artifact_path`에 모델을 덮어쓰는지 확인합니다.
5. `POST /api/v1/admin/update-model`에 초기 모델의 `metadata.rmse`를 넣어 기준 RMSE를 등록합니다.
6. `POST /api/v1/evaluations`를 실행하고 `GET /api/v1/evaluations/{evaluation_id}`에서 `batch_results`가 쌓이는지 확인합니다.
7. 재학습 승인 후 후속 평가가 중단 배치 다음 배치부터 시작하는지 확인합니다.

## 10. 현재 주의사항

- 최초 학습 자동 실행은 아직 백엔드에 구현되어 있지 않습니다. 현재는 운영 시작 전에 학습된 모델 파일을 만들고 `/api/v1/admin/update-model`로 등록하는 전제입니다.
- 재학습은 후보 모델을 만들지 않고 기존 운영 모델 파일을 덮어씁니다.
- 실제 데이터 소스 연동 시에는 `server_model/main.py`의 `_build_test_batches(...)`를 mock 생성 대신 7일치 트래픽 데이터를 가져오는 코드로 교체하는 것이 좋습니다.
- GPT 보고서를 사용하려면 `OPENAI_API_KEY`가 컨테이너 환경에 들어가 있어야 합니다.
