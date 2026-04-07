#### 다음 실습 코드는 학습 목적으로만 사용 바랍니다. 문의 : audit@korea.ac.kr 임성열 Ph.D.
#### 제공되는 실습 코드는 완성된 버전이 아니며, 일부 이스터 에그 (개선이 필요한 발견 사항)을 포함하고 있습니다.

# pip install fastapi "uvicorn[standard]" pandas pytz python-multipart
# pip install -U pip wheel
# pip install matplotlib

'''설치 패키지 설명 :
# fastapi, uvicorn[standard] : FastAPI를 통한 모델 서빙에 필요, uvicorn[standard]는 의존성 패키지까지 추가 설치
# pandas: pd (데이터프레임 처리)
# pytz: 시간대(timezone) 처리
# python-multipart: 파일 업로드 처리'''

# main.py
import os
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

from contextlib import asynccontextmanager
import asyncio
import base64
from datetime import datetime, timedelta
import importlib
import json
import os
from pathlib import Path
import shutil
from threading import RLock, Thread
import time
from typing import Any, Dict, Literal, Optional
from urllib import error as urlerror
from urllib.parse import urlparse
from urllib import request as urlrequest
from zoneinfo import ZoneInfo

from fastapi import FastAPI, APIRouter, File, Header, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field
# 상대 경로 사용, 현재 폴더인 server_model 상위 폴더에서 현 위치 인식
from fastapi.staticfiles import StaticFiles

# uvicorn 실행 위치에 따라서, 파일 경로 식별이 달라지는 점 확인하기 (현재 디렉토리 위치는 model_serving이고, 하위에 server_model 디렉토리내에 main.py가 있다고 할 때)
# python -m uvicorn server_model.main:app --port 8001 --reload

# from . import config
# 이 경우는 상대 경로로써, 현재 실행 중인 main.py와 같은 디렉토리 위치에서 config.py 찾아서 가져오므로, 해당 파일 확인 필요
# model_serving/server_model/config.py

from config import UPLOAD_DIR, IMAGE_DIR, MODEL_DIR, MODEL_IMG_DIR
# 이 경우는 현재 uvicorn 실행한 경로 위치인 model_serving과 같은 디렉토리 위치에서 config.py 찾아서 가져오므로, 해당 파일 확인 필요
# model_serving/config.py

# -------------------------------------------------
# 경로/디렉터리 및 프리픽스(root_path)
# -------------------------------------------------
STD_DIR = Path(__file__).resolve().parent.parent  # .../model_serving
PUBLIC_DIR = STD_DIR / "public"
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

# 프록시 하위 경로에서 서비스할 경우 설정 (예: /api/v2)
APP_ROOT_PATH = os.getenv("APP_ROOT_PATH", "").rstrip("/")  # 빈 문자열 또는 "/api/v2"

# 타임존
timezone = ZoneInfo("Asia/Seoul")

router = APIRouter()
api_router = APIRouter(prefix="/api/v1")

SYSTEM_NAME = "traffic-aiops-studio"
TARGET_CONFIG = {
    "dataset_id": "cesnet_v1",
    "entity_id": "router_01",
    "metric": "bytes_per_sec",
    "evaluation_interval": "manual_or_scheduled",
    "retraining_window_days": 30,
    "batch_unit": "day",
    "batch_size": 7,
}
BASELINE_METRICS = {"rmse": 125.0, "smape": 10.0, "r2": -7.0}
MVP_CURRENT_METRICS = {"rmse": 139.3, "smape": 11.8, "r2": -7.82}
RETRAINING_THRESHOLD_RATIO = float(os.getenv("RETRAINING_THRESHOLD_RATIO", "0.15"))
RETRAINING_STALE_AFTER_DAYS = int(os.getenv("RETRAINING_STALE_AFTER_DAYS", "30"))
OPENAI_REPORT_MODEL = os.getenv("OPENAI_REPORT_MODEL", "gpt-5-mini")
OPENAI_REPORT_TIMEOUT_SECONDS = float(os.getenv("OPENAI_REPORT_TIMEOUT_SECONDS", "45"))
MODEL_ARTIFACT_DIR = Path(os.getenv("MODEL_ARTIFACT_DIR", str(Path(MODEL_DIR) / "runtime"))).resolve()
MODEL_LOADER_MODULE = os.getenv("MODEL_LOADER_MODULE")
MODEL_EVALUATOR_MODULE = os.getenv("MODEL_EVALUATOR_MODULE")
MODEL_TRAINER_MODULE = os.getenv("MODEL_TRAINER_MODULE")
BATCH_EVALUATION_DELAY_SECONDS = float(os.getenv("BATCH_EVALUATION_DELAY_SECONDS", "1.25"))
APP_STATE_LOCK = RLock()
MODEL_UPDATE_LOCK = RLock()


class EvaluationRequest(BaseModel):
    trigger_type: Literal["manual", "scheduled"] = "manual"
    max_batches: int = Field(default=6, ge=1, le=60)
    after_retraining: bool = False
    start_batch_index: int = Field(default=0, ge=0)
    batch_delay_seconds: Optional[float] = Field(default=None, ge=0, le=60)


class ReportRequest(BaseModel):
    evaluation_id: Optional[str] = None


class DecisionRequest(BaseModel):
    report_id: str
    decision: Literal["keep", "keep_current_model", "retrain"]
    comment: Optional[str] = None


class TrainingJobRequest(BaseModel):
    decision_id: str
    model_version_id: Optional[str] = None
    model_name: Optional[str] = None
    artifact_path: Optional[str] = None
    artifact_url: Optional[str] = None
    loader_module: Optional[str] = None
    rerun_evaluation: bool = True


class ModelUpdateRequest(BaseModel):
    model_version_id: str
    model_name: str
    artifact_path: Optional[str] = None
    artifact_url: Optional[str] = None
    trained_at: Optional[str] = None
    loader_module: Optional[str] = None
    source: str = "manual"
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _now() -> datetime:
    return datetime.now(timezone)


def _iso(dt: Optional[datetime] = None) -> str:
    return (dt or _now()).isoformat(timespec="seconds")


def _response(data: Any, message: str = "ok") -> Dict[str, Any]:
    return {"success": True, "data": data, "message": message}


def _runtime_model_public() -> Dict[str, Any]:
    return dict(APP_STATE["runtime_model"])


def _next_id(prefix: str) -> str:
    APP_STATE["sequences"][prefix] += 1
    return f"{prefix}_{APP_STATE['sequences'][prefix]:03d}"


def _change_rate(current: float, baseline: float) -> float:
    if baseline == 0:
        return 0.0
    return round(((current - baseline) / baseline) * 100, 2)


def _build_comparison(current_metrics: Dict[str, float], baseline_metrics: Dict[str, float]) -> Dict[str, float]:
    return {
        "rmse_change_rate": _change_rate(current_metrics["rmse"], baseline_metrics["rmse"]),
        "smape_change_rate": _change_rate(current_metrics["smape"], baseline_metrics["smape"]),
        "r2_drop": round(baseline_metrics["r2"] - current_metrics["r2"], 2),
    }


def _build_forecast_series() -> list[Dict[str, Any]]:
    start = _now() - timedelta(hours=23)
    points: list[Dict[str, Any]] = []
    for index in range(24):
        hour = index % 24
        morning_peak = max(0, 8 - abs(hour - 8)) * 42
        evening_peak = max(0, 7 - abs(hour - 18)) * 55
        baseline = 920 + index * 8
        actual = baseline + morning_peak + evening_peak + (index % 5) * 18
        prediction = actual * (0.88 if index >= 15 else 0.93) + ((index % 4) - 1.5) * 24
        points.append(
            {
                "timestamp": _iso(start + timedelta(hours=index)),
                "actual": round(actual, 2),
                "predicted": round(prediction, 2),
            }
        )
    return points


def _build_batch_forecast_series(batch_index: int, after_retraining: bool = False) -> list[Dict[str, Any]]:
    start = _now().date() - timedelta(days=7) + timedelta(days=batch_index * 7)
    points: list[Dict[str, Any]] = []
    for day_offset in range(7):
        day = start + timedelta(days=day_offset)
        weekday_peak = 90 if day.weekday() < 5 else -40
        trend = batch_index * 28 + day_offset * 13
        actual = 1100 + weekday_peak + trend + (day_offset % 3) * 32
        error_ratio = 0.05 if after_retraining else 0.07 + batch_index * 0.04
        predicted = actual * (1 - error_ratio) + ((day_offset % 2) - 0.5) * 22
        points.append(
            {
                "timestamp": _iso(datetime.combine(day, datetime.min.time(), tzinfo=timezone)),
                "actual": round(actual, 2),
                "predicted": round(predicted, 2),
            }
        )
    return points


def _metrics_for_points(points: list[Dict[str, Any]]) -> Dict[str, float]:
    errors = [point["actual"] - point["predicted"] for point in points]
    squared_error = sum(error * error for error in errors) / max(len(errors), 1)
    rmse = squared_error ** 0.5
    smape_terms = [
        abs(point["actual"] - point["predicted"]) / max((abs(point["actual"]) + abs(point["predicted"])) / 2, 1)
        for point in points
    ]
    smape = (sum(smape_terms) / max(len(smape_terms), 1)) * 100
    actual_values = [point["actual"] for point in points]
    actual_mean = sum(actual_values) / max(len(actual_values), 1)
    ss_tot = sum((value - actual_mean) ** 2 for value in actual_values) or 1
    ss_res = sum(error * error for error in errors)
    r2 = 1 - (ss_res / ss_tot)
    return {"rmse": round(rmse, 2), "smape": round(smape, 2), "r2": round(r2, 2)}


def _forecast_result_from_points(
    points: list[Dict[str, Any]],
    model_key: str = "traffic_forecaster",
    display_name: str = "Traffic Forecast Model",
    order: str = "runtime",
) -> Dict[str, Any]:
    metrics = _metrics_for_points(points)
    return {
        "model_key": model_key,
        "display_name": display_name,
        "order": order,
        "rmse": metrics["rmse"],
        "smape": metrics["smape"],
        "r2": metrics["r2"],
        "predictions": [point["predicted"] for point in points],
        "actuals": [point["actual"] for point in points],
    }


def _points_from_model_result(batch: Dict[str, Any], model_result: Dict[str, Any]) -> list[Dict[str, Any]]:
    actuals = model_result.get("actuals") or []
    predictions = model_result.get("predictions") or []
    if not actuals or not predictions:
        return batch["forecast_points"]

    points = []
    base_points = batch["forecast_points"]
    for index, (actual, predicted) in enumerate(zip(actuals, predictions)):
        timestamp = (
            base_points[index]["timestamp"]
            if index < len(base_points)
            else _iso(datetime.fromisoformat(batch["start_at"]) + timedelta(days=index))
        )
        points.append(
            {
                "timestamp": timestamp,
                "actual": round(float(actual), 2),
                "predicted": round(float(predicted), 2),
            }
        )
    return points


def _normalize_model_result(result: Any, batch: Dict[str, Any]) -> Dict[str, Any]:
    if hasattr(result, "as_dict") and callable(result.as_dict):
        result = result.as_dict()
    if not isinstance(result, dict):
        raise RuntimeError("model evaluator must return a ForecastResult-like dict.")

    if "summary" in result and isinstance(result.get("summary"), dict):
        champion = result["summary"].get("champion")
        if isinstance(champion, dict):
            return _normalize_model_result(champion, batch)

    if "model_result" in result and isinstance(result["model_result"], dict):
        return _normalize_model_result(result["model_result"], batch)

    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    points = result.get("forecast_points") if isinstance(result.get("forecast_points"), list) else None
    actuals = result.get("actuals")
    predictions = result.get("predictions")
    if points and (not actuals or not predictions):
        actuals = [point["actual"] for point in points]
        predictions = [point["predicted"] for point in points]

    if not actuals or not predictions:
        fallback = _forecast_result_from_points(batch["forecast_points"])
        actuals = fallback["actuals"]
        predictions = fallback["predictions"]
        metrics = {**fallback, **metrics}

    model_result = {
        "model_key": result.get("model_key", "traffic_forecaster"),
        "display_name": result.get("display_name", "Traffic Forecast Model"),
        "order": result.get("order", "runtime"),
        "rmse": float(result.get("rmse", metrics.get("rmse", 0.0))),
        "smape": float(result.get("smape", metrics.get("smape", 0.0))),
        "r2": float(result.get("r2", metrics.get("r2", 0.0))),
        "predictions": [float(value) for value in predictions],
        "actuals": [float(value) for value in actuals],
    }
    if not model_result["rmse"] and not model_result["smape"] and not model_result["r2"]:
        computed = _metrics_for_points(_points_from_model_result(batch, model_result))
        model_result.update(computed)
    return model_result


def _evaluate_retraining_need(
    previous_training_at: Optional[str],
    previous_rmse: Optional[float],
    current_rmse: float,
    threshold_ratio: float = RETRAINING_THRESHOLD_RATIO,
    stale_after_days: int = RETRAINING_STALE_AFTER_DAYS,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    now = now or _now()
    reasons: list[str] = []

    if previous_training_at is None:
        reasons.append("no_previous_production_model")
    else:
        try:
            trained_at = datetime.fromisoformat(previous_training_at)
            if trained_at.tzinfo is None:
                trained_at = trained_at.replace(tzinfo=timezone)
            if now - trained_at >= timedelta(days=stale_after_days):
                reasons.append(f"stale_model_over_{stale_after_days}_days")
        except ValueError:
            reasons.append("invalid_previous_training_at")

    if previous_rmse is not None and current_rmse > previous_rmse * (1 + threshold_ratio):
        reasons.append("rmse_degradation_above_threshold")

    return {
        "should_retrain": bool(reasons),
        "status": "retrain_required" if reasons else "healthy",
        "reasons": reasons,
        "threshold_ratio": threshold_ratio,
        "stale_after_days": stale_after_days,
        "previous_rmse": previous_rmse,
        "current_rmse": current_rmse,
    }


def _build_test_batches(
    max_batches: int,
    after_retraining: bool = False,
    start_batch_index: int = 0,
) -> list[Dict[str, Any]]:
    max_batches = max(1, min(max_batches, 12))
    batches: list[Dict[str, Any]] = []
    for index in range(start_batch_index, start_batch_index + max_batches):
        points = _build_batch_forecast_series(index, after_retraining=after_retraining)
        batches.append(
            {
                "batch_id": f"batch_{index + 1:03d}",
                "batch_index": index,
                "window_days": 7,
                "start_at": points[0]["timestamp"],
                "end_at": points[-1]["timestamp"],
                "forecast_points": points,
            }
        )
    return batches


def _evaluate_batch_with_model(batch: Dict[str, Any], after_retraining: bool = False) -> Dict[str, Any]:
    module_name = MODEL_EVALUATOR_MODULE
    if module_name:
        try:
            evaluator_module = importlib.import_module(module_name)
            evaluator = getattr(evaluator_module, "evaluate_batch", None) or getattr(evaluator_module, "evaluate", None)
            if not callable(evaluator):
                raise RuntimeError(f"{module_name} must expose evaluate_batch(batch, model) or evaluate(batch, model).")
            try:
                result = evaluator(batch, APP_STATE["runtime_model_object"])
            except TypeError:
                result = evaluator(batch)
            model_result = _normalize_model_result(result, batch)
            forecast_points = _points_from_model_result(batch, model_result)
            metrics = {
                "rmse": round(float(model_result["rmse"]), 2),
                "smape": round(float(model_result["smape"]), 2),
                "r2": round(float(model_result["r2"]), 2),
            }
            retraining = _evaluate_retraining_need(
                previous_training_at=APP_STATE["champion_model"].get("trained_at"),
                previous_rmse=APP_STATE["champion_model"].get("rmse"),
                current_rmse=metrics["rmse"],
            )
            return {
                **batch,
                "forecast_points": forecast_points,
                "metrics": metrics,
                "model_result": model_result,
                "retraining": retraining,
                "decision_reason": ", ".join(retraining["reasons"]) or "metrics_within_retraining_policy",
                "source": module_name,
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to evaluate batch with model module: {exc}") from exc

    model_result = _forecast_result_from_points(
        batch["forecast_points"],
        model_key=APP_STATE["runtime_model"].get("model_name") or "traffic_forecaster",
        display_name="Traffic Forecast Model",
        order="mvp_runtime_simulation",
    )
    metrics = {"rmse": model_result["rmse"], "smape": model_result["smape"], "r2": model_result["r2"]}
    retraining = _evaluate_retraining_need(
        previous_training_at=APP_STATE["champion_model"].get("trained_at"),
        previous_rmse=APP_STATE["champion_model"].get("rmse"),
        current_rmse=metrics["rmse"],
    )
    return {
        **batch,
        "metrics": metrics,
        "model_result": model_result,
        "retraining": retraining,
        "decision_reason": ", ".join(retraining["reasons"]) or "metrics_within_retraining_policy",
        "source": "mvp_simulation",
    }


def _current_metrics_from_batch(batch_result: Optional[Dict[str, Any]]) -> Dict[str, float]:
    if not batch_result:
        return dict(BASELINE_METRICS)
    return batch_result["metrics"]


def _days_since_trained() -> int:
    trained_at = APP_STATE["champion_model"]["trained_at_dt"]
    return (_now() - trained_at).days


def _judge_health(comparison: Dict[str, float]) -> str:
    trained_days = _days_since_trained()
    if (
        comparison["rmse_change_rate"] >= 15
        or comparison["smape_change_rate"] >= 15
        or comparison["r2_drop"] >= 0.10
        or trained_days >= 45
    ):
        return "degraded"
    if (
        comparison["rmse_change_rate"] >= 10
        or comparison["smape_change_rate"] >= 10
        or comparison["r2_drop"] >= 0.05
        or trained_days >= 30
    ):
        return "warning"
    return "healthy"


def _public_champion_model() -> Dict[str, Any]:
    champion = APP_STATE["champion_model"]
    return {
        "model_version_id": champion["model_version_id"],
        "model_name": champion["model_name"],
        "trained_at": champion["trained_at"],
        "rmse": champion.get("rmse"),
        "smape": champion.get("smape"),
        "r2": champion.get("r2"),
        "status": "champion",
    }


def _append_session_event(event: Dict[str, Any]) -> None:
    APP_STATE["session_events"].append(
        {
            **event,
            "created_at": event.get("created_at", _iso()),
            "storage": "memory_only",
        }
    )


def _fallback_report_markdown(evaluation: Dict[str, Any], comparison: Dict[str, float]) -> str:
    failed_batch = evaluation.get("failed_batch") or {}
    retraining = evaluation.get("retraining") or failed_batch.get("retraining") or {}
    model_result = failed_batch.get("model_result") or {}
    return "\n".join(
        [
            "# Traffic AIOps 성능 저하 보고서",
            "",
            f"- 평가 ID: `{evaluation['evaluation_id']}`",
            f"- 대상: `{TARGET_CONFIG['dataset_id']}` / `{TARGET_CONFIG['entity_id']}` / `{TARGET_CONFIG['metric']}`",
            f"- 상태: `{evaluation['health_status']}`",
            f"- 중단 배치: `{failed_batch.get('batch_id', '-')}`",
            f"- 테스트 구간: `{failed_batch.get('start_at', '-')}` ~ `{failed_batch.get('end_at', '-')}`",
            f"- 모델 result: `{model_result.get('display_name', '-')}` / `{model_result.get('model_key', '-')}`",
            f"- 재학습 정책 상태: `{retraining.get('status', '-')}`",
            f"- 재학습 사유: `{', '.join(retraining.get('reasons', [])) or 'none'}`",
            f"- RMSE 변화율: `{comparison['rmse_change_rate']}%`",
            f"- SMAPE 변화율: `{comparison['smape_change_rate']}%`",
            f"- R2 감소폭: `{comparison['r2_drop']}`",
            "",
            "## 해석",
            "7일 단위 테스트 배치를 순차 평가하던 중 모델 result의 성능지표가 재학습 정책 기준을 넘어서 테스트를 중단했습니다.",
            "현재 운영 모델의 RMSE가 기존 운영 기준 대비 악화되었거나 모델 최신성 정책을 만족하지 못합니다.",
            "",
            "## 권장 조치",
            "- 실패 직전 배치까지의 테스트 데이터를 포함해 기존 모델을 덮어쓰는 재학습을 수행합니다.",
            "- 재학습 후 7일 배치 테스트를 자동으로 다시 실행합니다.",
            "- 급격한 피크 구간의 이상치와 누락 데이터를 함께 확인합니다.",
        ]
    )


def _extract_openai_text(payload: Dict[str, Any]) -> Optional[str]:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"].strip()

    chunks: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks).strip() or None


def _generate_gpt_report_markdown(evaluation: Dict[str, Any]) -> tuple[str, str, Optional[str]]:
    api_key = os.getenv("OPENAI_API_KEY")
    comparison = evaluation["comparison"]
    fallback = _fallback_report_markdown(evaluation, comparison)
    if not api_key:
        return fallback, "fallback_missing_openai_api_key", None

    prompt = {
        "system": "너는 네트워크 트래픽 예측 모델을 운영하는 AIOps 분석가다. 한국어로 간결한 운영 보고서를 작성한다.",
        "evaluation": {
            "system_name": SYSTEM_NAME,
            "target_config": TARGET_CONFIG,
            "champion_model": _public_champion_model(),
            "metrics": evaluation["current_metrics"],
            "baseline_metrics": evaluation["baseline_metrics"],
            "comparison": comparison,
            "health_status": evaluation["health_status"],
            "retraining": evaluation.get("retraining"),
            "failed_batch": evaluation.get("failed_batch"),
            "batch_results": evaluation.get("batch_results", []),
            "forecast_points_sample": evaluation["forecast_points"][-8:],
        },
        "instructions": [
            "Markdown 형식으로 작성한다.",
            "섹션은 요약, 중단된 7일 배치, 주요 지표 변화, 가능한 원인, 권장 조치로 구성한다.",
            "모델이 반환한 ForecastResult 형태의 result(rmse, smape, r2, predictions, actuals)를 기준으로 설명한다.",
            "재학습 판단은 previous_rmse 대비 current_rmse가 임계치 이상 증가했는지와 모델 최신성 정책을 기준으로 설명한다.",
            "재학습은 후보 모델 승격이 아니라 기존 모델을 덮어쓰는 방식이라고 명시한다.",
            "모델링 코드는 아직 MVP placeholder임을 과하게 강조하지 말고, 현재 수치 기준의 운영 판단만 설명한다.",
        ],
    }
    request_body = json.dumps(
        {
            "model": OPENAI_REPORT_MODEL,
            "input": json.dumps(prompt, ensure_ascii=False),
        }
    ).encode("utf-8")
    request = urlrequest.Request(
        "https://api.openai.com/v1/responses",
        data=request_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(request, timeout=OPENAI_REPORT_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urlerror.URLError, urlerror.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        return fallback, "fallback_openai_error", str(exc)

    markdown = _extract_openai_text(payload)
    if not markdown:
        return fallback, "fallback_empty_openai_response", None
    return markdown, "gpt", None


def _build_report(evaluation: Dict[str, Any]) -> Dict[str, Any]:
    comparison = evaluation["comparison"]
    markdown, report_source, generation_error = _generate_gpt_report_markdown(evaluation)
    return {
        "report_id": _next_id("report"),
        "evaluation_id": evaluation["evaluation_id"],
        "summary": "현재 운영 모델의 성능이 기준 대비 저하되었습니다.",
        "details": {
            "rmse": f"기준 대비 {comparison['rmse_change_rate']}% 증가",
            "smape": f"기준 대비 {comparison['smape_change_rate']}% 증가",
            "r2": f"기준 대비 {comparison['r2_drop']} 감소",
            "failed_batch": (evaluation.get("failed_batch") or {}).get("batch_id", "-"),
            "trained_days": f"마지막 학습 후 {_days_since_trained()}일 경과",
        },
        "possible_causes": [
            "최근 데이터 패턴 변화",
            "트래픽 주기성 변화",
            "학습 데이터 최신성 부족",
        ],
        "recommended_actions": [
            "재학습 범위 데이터로 기존 운영 모델 덮어쓰기",
            "재학습 후 동일 배치 평가 자동 재실행",
            "이상치와 누락 데이터 점검",
        ],
        "markdown": markdown,
        "report_source": report_source,
        "generation_error": generation_error,
        "status": "awaiting_user_decision",
        "created_at": _iso(),
    }


def _save_report(report: Dict[str, Any]) -> None:
    APP_STATE["latest_report"] = report
    APP_STATE["reports"].insert(0, report)
    _append_session_event(
        {
            "type": "report",
            "evaluation_id": report["evaluation_id"],
            "report_id": report["report_id"],
            "report_source": report["report_source"],
            "created_at": report["created_at"],
        }
    )


def _require_model_admin(x_admin_token: Optional[str]) -> Dict[str, str]:
    expected_token = os.getenv("MODEL_ADMIN_TOKEN")
    if expected_token and x_admin_token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid model admin token.")
    return {"auth_mode": "token" if expected_token else "disabled_for_mvp"}


def _download_model_artifact(model_version_id: str, artifact_url: str) -> Path:
    MODEL_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    parsed = urlparse(artifact_url)
    filename = Path(parsed.path).name or f"{model_version_id}.model"
    target_path = MODEL_ARTIFACT_DIR / f"{model_version_id}_{filename}"
    try:
        with urlrequest.urlopen(artifact_url, timeout=60) as response:
            with open(target_path, "wb") as output:
                shutil.copyfileobj(response, output)
    except (urlerror.URLError, TimeoutError, OSError) as exc:
        raise HTTPException(status_code=400, detail=f"Failed to download model artifact: {exc}") from exc
    return target_path


def _resolve_model_artifact(payload: ModelUpdateRequest) -> Path:
    if payload.artifact_url:
        return _download_model_artifact(payload.model_version_id, payload.artifact_url)
    if not payload.artifact_path:
        raise HTTPException(status_code=400, detail="Either artifact_url or artifact_path is required.")

    artifact_path = Path(payload.artifact_path).expanduser().resolve()
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail=f"Model artifact not found: {artifact_path}")
    if not artifact_path.is_file():
        raise HTTPException(status_code=400, detail=f"Model artifact is not a file: {artifact_path}")
    return artifact_path


def _load_model_object(artifact_path: Path, loader_module: Optional[str]) -> tuple[Any, str]:
    module_name = loader_module or MODEL_LOADER_MODULE
    if not module_name:
        return None, "placeholder_no_loader_module"

    try:
        loader_module_obj = importlib.import_module(module_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to import model loader module '{module_name}': {exc}") from exc

    loader = getattr(loader_module_obj, "load_model", None) or getattr(loader_module_obj, "load", None)
    if not callable(loader):
        raise HTTPException(
            status_code=500,
            detail=f"Model loader module '{module_name}' must expose load_model(path) or load(path).",
        )

    try:
        return loader(str(artifact_path)), f"loaded_by_{module_name}"
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load model artifact: {exc}") from exc


def _activate_runtime_model(payload: ModelUpdateRequest) -> Dict[str, Any]:
    with MODEL_UPDATE_LOCK:
        if payload.artifact_path or payload.artifact_url:
            artifact_path = _resolve_model_artifact(payload)
        else:
            existing_path = APP_STATE["runtime_model"].get("artifact_path")
            if existing_path:
                artifact_path = Path(existing_path)
            else:
                MODEL_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
                artifact_path = MODEL_ARTIFACT_DIR / "active_model.placeholder"
                artifact_path.write_text("mvp active traffic model placeholder", encoding="utf-8")
        model_object, load_status = _load_model_object(artifact_path, payload.loader_module)
        previous_model = _runtime_model_public()
        activated_at = _iso()
        trained_at = payload.trained_at or activated_at

        runtime_model = {
            "model_version_id": payload.model_version_id,
            "model_name": payload.model_name,
            "artifact_path": str(artifact_path),
            "trained_at": trained_at,
            "activated_at": activated_at,
            "loader_module": payload.loader_module or MODEL_LOADER_MODULE,
            "load_status": load_status,
            "source": payload.source,
            "metadata": payload.metadata,
        }
        APP_STATE["runtime_model"] = runtime_model
        APP_STATE["runtime_model_object"] = model_object
        APP_STATE["champion_model"] = {
            "model_version_id": payload.model_version_id,
            "model_name": payload.model_name,
            "trained_at_dt": _now(),
            "trained_at": trained_at,
            "rmse": payload.metadata.get("rmse", APP_STATE["champion_model"].get("rmse")),
            "smape": payload.metadata.get("smape", APP_STATE["champion_model"].get("smape")),
            "r2": payload.metadata.get("r2", APP_STATE["champion_model"].get("r2")),
        }
        APP_STATE["latest_health_status"] = "healthy"
        _append_session_event(
            {
                "type": "model_update",
                "model_version_id": payload.model_version_id,
                "model_name": payload.model_name,
                "artifact_path": str(artifact_path),
                "load_status": load_status,
                "source": payload.source,
            }
        )
        return {
            "previous_model": previous_model,
            "active_model": runtime_model,
            "status": "updated",
        }


def _retrain_overwrite_model(training_batches: list[Dict[str, Any]], payload: TrainingJobRequest, job_id: str) -> Dict[str, Any]:
    with MODEL_UPDATE_LOCK:
        MODEL_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        current_runtime = _runtime_model_public()
        target_path = (
            Path(payload.artifact_path).expanduser().resolve()
            if payload.artifact_path
            else MODEL_ARTIFACT_DIR / "active_traffic_model.placeholder"
        )
        target_path.parent.mkdir(parents=True, exist_ok=True)

        trainer_module_name = MODEL_TRAINER_MODULE
        trainer_status = "placeholder_retrain_overwrite"
        model_object = APP_STATE["runtime_model_object"]
        if trainer_module_name:
            try:
                trainer_module = importlib.import_module(trainer_module_name)
                trainer = getattr(trainer_module, "retrain_model", None) or getattr(trainer_module, "retrain", None)
                if not callable(trainer):
                    raise RuntimeError(f"{trainer_module_name} must expose retrain_model(...) or retrain(...).")
                result = trainer(
                    training_batches=training_batches,
                    current_model=APP_STATE["runtime_model_object"],
                    target_artifact_path=str(target_path),
                )
                if isinstance(result, dict):
                    model_object = result.get("model_object", model_object)
                    if result.get("artifact_path"):
                        target_path = Path(result["artifact_path"]).expanduser().resolve()
                elif result is not None:
                    model_object = result
                trainer_status = f"trained_by_{trainer_module_name}"
            except TypeError:
                result = trainer(training_batches, APP_STATE["runtime_model_object"], str(target_path))
                if result is not None:
                    model_object = result
                trainer_status = f"trained_by_{trainer_module_name}"
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Failed to retrain model: {exc}") from exc
        else:
            target_path.write_text(
                json.dumps(
                    {
                        "job_id": job_id,
                        "mode": "mvp_placeholder_overwrite",
                        "training_batch_ids": [batch["batch_id"] for batch in training_batches],
                        "updated_at": _iso(),
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

        load_status = trainer_status
        if trainer_module_name is None:
            model_object, loader_status = _load_model_object(target_path, payload.loader_module)
            load_status = f"{trainer_status}:{loader_status}"

        trained_at = _iso()
        runtime_model = {
            "model_version_id": current_runtime["model_version_id"],
            "model_name": payload.model_name or current_runtime["model_name"],
            "artifact_path": str(target_path),
            "trained_at": trained_at,
            "activated_at": trained_at,
            "loader_module": payload.loader_module or MODEL_LOADER_MODULE,
            "load_status": load_status,
            "source": "retraining_overwrite",
            "metadata": {
                "job_id": job_id,
                "overwrite": True,
                "training_batch_ids": [batch["batch_id"] for batch in training_batches],
                "training_until": training_batches[-1]["end_at"] if training_batches else None,
            },
        }
        APP_STATE["runtime_model"] = runtime_model
        APP_STATE["runtime_model_object"] = model_object
        APP_STATE["champion_model"] = {
            "model_version_id": runtime_model["model_version_id"],
            "model_name": runtime_model["model_name"],
            "trained_at_dt": _now(),
            "trained_at": trained_at,
            "rmse": BASELINE_METRICS["rmse"],
            "smape": BASELINE_METRICS["smape"],
            "r2": BASELINE_METRICS["r2"],
        }
        APP_STATE["latest_health_status"] = "healthy"
        _append_session_event(
            {
                "type": "model_overwrite_retrain",
                "job_id": job_id,
                "model_version_id": runtime_model["model_version_id"],
                "artifact_path": str(target_path),
                "training_batch_count": len(training_batches),
            }
        )
        return {
            "previous_model": current_runtime,
            "active_model": runtime_model,
            "status": "overwritten",
            "training_batch_count": len(training_batches),
        }


def _batch_delay_seconds(payload: EvaluationRequest) -> float:
    if payload.batch_delay_seconds is not None:
        return payload.batch_delay_seconds
    return BATCH_EVALUATION_DELAY_SECONDS


def _timeline_event(status: str, message: str, batch: Optional[Dict[str, Any]] = None, **extra: Any) -> Dict[str, Any]:
    event = {
        "status": status,
        "message": message,
        "created_at": _iso(),
    }
    if batch:
        event.update(
            {
                "batch_id": batch["batch_id"],
                "batch_index": batch["batch_index"],
                "start_at": batch["start_at"],
                "end_at": batch["end_at"],
            }
        )
    event.update(extra)
    return event


def _training_scope(batch_results: list[Dict[str, Any]], failed_batch: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    previous_batches = [
        batch
        for batch in batch_results
        if not failed_batch or batch["batch_index"] < failed_batch["batch_index"]
    ]
    return {
        "strategy": "before_failed_batch",
        "batch_ids": [batch["batch_id"] for batch in previous_batches],
        "until": previous_batches[-1]["end_at"] if previous_batches else None,
    }


def _apply_evaluation_summary(evaluation: Dict[str, Any], failed_batch: Optional[Dict[str, Any]]) -> None:
    latest_batch = failed_batch or (evaluation["batch_results"][-1] if evaluation["batch_results"] else None)
    current_metrics = _current_metrics_from_batch(latest_batch)
    health_status = "degraded" if failed_batch else "healthy"
    evaluation.update(
        {
            "status": "stopped_on_retrain_required" if failed_batch else "completed",
            "current_metrics": current_metrics,
            "comparison": _build_comparison(current_metrics, BASELINE_METRICS),
            "health_status": health_status,
            "recommended_action": "retrain" if failed_batch else "keep_current_model",
            "failed_batch": failed_batch,
            "retraining": (
                failed_batch.get("retraining")
                if failed_batch
                else {
                    "should_retrain": False,
                    "status": "healthy",
                    "reasons": [],
                    "threshold_ratio": RETRAINING_THRESHOLD_RATIO,
                    "stale_after_days": RETRAINING_STALE_AFTER_DAYS,
                    "previous_rmse": APP_STATE["champion_model"].get("rmse"),
                    "current_rmse": current_metrics["rmse"],
                }
            ),
            "training_scope": _training_scope(evaluation["batch_results"], failed_batch),
            "forecast_points": latest_batch["forecast_points"] if latest_batch else [],
            "current_batch": None,
            "progress_percent": 100,
            "finished_at": _iso(),
        }
    )
    APP_STATE["latest_health_status"] = health_status


def _new_evaluation_state(payload: EvaluationRequest) -> Dict[str, Any]:
    total_batches = payload.max_batches
    evaluation = {
        "evaluation_id": _next_id("eval"),
        "model_version_id": APP_STATE["champion_model"]["model_version_id"],
        "status": "queued",
        "trigger_type": payload.trigger_type,
        "current_metrics": {"rmse": 0.0, "smape": 0.0, "r2": 0.0},
        "baseline_metrics": dict(BASELINE_METRICS),
        "comparison": {"rmse_change_rate": 0.0, "smape_change_rate": 0.0, "r2_drop": 0.0},
        "health_status": "unknown",
        "recommended_action": "evaluate",
        "threshold_note": "재학습 필요 여부는 모델 result의 RMSE를 기존 운영 RMSE와 비교해 판단합니다.",
        "batch_size_days": 7,
        "total_batches": total_batches,
        "start_batch_index": payload.start_batch_index,
        "start_batch_id": f"batch_{payload.start_batch_index + 1:03d}",
        "batch_results": [],
        "failed_batch": None,
        "retraining": {
            "should_retrain": False,
            "status": "pending",
            "reasons": [],
            "threshold_ratio": RETRAINING_THRESHOLD_RATIO,
            "stale_after_days": RETRAINING_STALE_AFTER_DAYS,
            "previous_rmse": APP_STATE["champion_model"].get("rmse"),
            "current_rmse": None,
        },
        "training_scope": {"strategy": "before_failed_batch", "batch_ids": [], "until": None},
        "forecast_points": [],
        "auto_report_created": False,
        "auto_report_id": None,
        "created_at": _iso(),
        "started_at": None,
        "finished_at": None,
        "after_retraining": payload.after_retraining,
        "batch_delay_seconds": _batch_delay_seconds(payload),
        "progress_percent": 0,
        "current_batch": None,
        "timeline_events": [
            _timeline_event(
                "queued",
                f"{payload.start_batch_index + 1}번째 7일 배치부터 {total_batches}개 배치가 평가 대기열에 등록되었습니다.",
            )
        ],
    }
    APP_STATE.setdefault("evaluations", {})[evaluation["evaluation_id"]] = evaluation
    APP_STATE["latest_evaluation"] = evaluation
    APP_STATE["latest_health_status"] = "unknown"
    return evaluation


def _start_batch_evaluation(payload: EvaluationRequest) -> Dict[str, Any]:
    with APP_STATE_LOCK:
        evaluation = _new_evaluation_state(payload)
    worker = Thread(
        target=_run_batch_evaluation_worker,
        args=(evaluation["evaluation_id"], payload),
        daemon=True,
    )
    worker.start()
    return evaluation


def _run_batch_evaluation_worker(evaluation_id: str, payload: EvaluationRequest) -> None:
    delay_seconds = _batch_delay_seconds(payload)
    failed_batch: Optional[Dict[str, Any]] = None

    try:
        batches = _build_test_batches(
            payload.max_batches,
            after_retraining=payload.after_retraining,
            start_batch_index=payload.start_batch_index,
        )
        with APP_STATE_LOCK:
            evaluation = APP_STATE["evaluations"][evaluation_id]
            evaluation["status"] = "running"
            evaluation["started_at"] = _iso()
            evaluation["timeline_events"].append(
                _timeline_event("running", "7일 단위 테스트 배치 평가를 시작했습니다.")
            )

        for batch in batches:
            with APP_STATE_LOCK:
                evaluation = APP_STATE["evaluations"][evaluation_id]
                evaluation["current_batch"] = {
                    "batch_id": batch["batch_id"],
                    "batch_index": batch["batch_index"],
                    "window_days": batch["window_days"],
                    "start_at": batch["start_at"],
                    "end_at": batch["end_at"],
                    "status": "running",
                }
                evaluation["timeline_events"].append(
                    _timeline_event(
                        "running",
                        f"{batch['batch_id']} 7일치 배치를 모델에 전달했습니다.",
                        batch,
                    )
                )

            if delay_seconds:
                time.sleep(delay_seconds)

            batch_result = _evaluate_batch_with_model(batch, after_retraining=payload.after_retraining)
            batch_result["completed_at"] = _iso()
            retraining = batch_result["retraining"]
            status = retraining["status"]
            message = (
                f"{batch['batch_id']} 평가 완료: RMSE {batch_result['metrics']['rmse']}, "
                f"SMAPE {batch_result['metrics']['smape']}, 재학습 상태 {status}"
            )

            with APP_STATE_LOCK:
                evaluation = APP_STATE["evaluations"][evaluation_id]
                evaluation["batch_results"].append(batch_result)
                evaluation["current_metrics"] = batch_result["metrics"]
                evaluation["comparison"] = _build_comparison(batch_result["metrics"], BASELINE_METRICS)
                evaluation["forecast_points"] = batch_result["forecast_points"]
                evaluation["progress_percent"] = round(
                    len(evaluation["batch_results"]) / max(evaluation["total_batches"], 1) * 100
                )
                evaluation["timeline_events"].append(
                    _timeline_event(
                        status,
                        message,
                        batch_result,
                        metrics=batch_result["metrics"],
                        retraining=retraining,
                        decision_reason=batch_result["decision_reason"],
                    )
                )

                if retraining["should_retrain"]:
                    failed_batch = batch_result
                    _apply_evaluation_summary(evaluation, failed_batch)
                    evaluation["timeline_events"].append(
                        _timeline_event(
                            "stopped_on_retrain_required",
                            f"{batch['batch_id']}에서 재학습 필요 상태가 감지되어 이후 배치 평가를 중단했습니다.",
                            batch_result,
                        )
                    )
                    break

        with APP_STATE_LOCK:
            evaluation = APP_STATE["evaluations"][evaluation_id]
            if evaluation["status"] == "running":
                _apply_evaluation_summary(evaluation, failed_batch)
                evaluation["timeline_events"].append(
                    _timeline_event("completed", "모든 7일 배치가 재학습 불필요 상태로 평가 완료되었습니다.")
                )
            final_evaluation = evaluation

        if final_evaluation["failed_batch"]:
            with APP_STATE_LOCK:
                final_evaluation["status"] = "generating_report"
                final_evaluation["timeline_events"].append(
                    _timeline_event("generating_report", "재학습 필요 결과를 기반으로 보고서를 생성하고 있습니다.")
                )
            report = _build_report(final_evaluation)
            _save_report(report)
            with APP_STATE_LOCK:
                final_evaluation["status"] = "stopped_on_retrain_required"
                final_evaluation["auto_report_created"] = True
                final_evaluation["auto_report_id"] = report["report_id"]
                final_evaluation["timeline_events"].append(
                    _timeline_event("report_created", f"{report['report_id']} 보고서가 생성되었습니다.")
                )

        _append_session_event(
            {
                "type": "evaluation",
                "evaluation_id": evaluation_id,
                "health_status": final_evaluation["health_status"],
                "status": final_evaluation["status"],
                "tested_batch_count": len(final_evaluation["batch_results"]),
                "failed_batch_id": final_evaluation["failed_batch"]["batch_id"] if final_evaluation["failed_batch"] else None,
                "created_at": final_evaluation["created_at"],
            }
        )
    except Exception as exc:
        with APP_STATE_LOCK:
            evaluation = APP_STATE["evaluations"][evaluation_id]
            evaluation["status"] = "failed"
            evaluation["health_status"] = "unknown"
            evaluation["current_batch"] = None
            evaluation["finished_at"] = _iso()
            evaluation["timeline_events"].append(
                _timeline_event("failed", f"평가 실행 중 오류가 발생했습니다: {exc}")
            )


APP_STATE: Dict[str, Any] = {
    "champion_model": {
        "model_version_id": "model_v12",
        "model_name": "lstm_mvp_placeholder",
        "trained_at_dt": _now() - timedelta(days=12),
        "trained_at": _iso(_now() - timedelta(days=12)),
        "rmse": BASELINE_METRICS["rmse"],
        "smape": BASELINE_METRICS["smape"],
        "r2": BASELINE_METRICS["r2"],
    },
    "latest_health_status": "unknown",
    "latest_evaluation": None,
    "latest_report": None,
    "latest_decision": None,
    "latest_training_job": None,
    "latest_candidate": None,
    "runtime_model": {
        "model_version_id": "model_v12",
        "model_name": "lstm_mvp_placeholder",
        "artifact_path": None,
        "trained_at": _iso(_now() - timedelta(days=12)),
        "activated_at": None,
        "loader_module": MODEL_LOADER_MODULE,
        "load_status": "placeholder_initial_model",
        "source": "startup",
        "metadata": {"mode": "mvp"},
    },
    "runtime_model_object": None,
    "evaluations": {},
    "reports": [],
    "session_events": [],
    "sequences": {
        "eval": 0,
        "report": 0,
        "decision": 0,
        "job": 0,
        "model": 12,
        "promotion": 0,
        "model_update": 0,
    },
}

# -------------------------------------------------
# Lifespan: 스타트업을 가볍게 (블로킹 작업 금지)
# -------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 정적/결과 디렉터리 보장
    for d in (PUBLIC_DIR, UPLOAD_DIR, IMAGE_DIR, MODEL_IMG_DIR, MODEL_ARTIFACT_DIR):
        Path(d).mkdir(parents=True, exist_ok=True)
    yield
    # 종료 시 별도 정리 없음

app = FastAPI(
    lifespan=lifespan,
    root_path=APP_ROOT_PATH,           # ✅ 프리픽스 반영
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 필요 시 도메인 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /static 경로에 정적 리소스 제공
app.mount("/static", StaticFiles(directory=str(PUBLIC_DIR)), name="static")
app.mount("/assets", StaticFiles(directory=str(PUBLIC_DIR / "assets"), check_dir=False), name="assets")
app.mount("/img", StaticFiles(directory=str(PUBLIC_DIR / "img"), check_dir=False), name="img")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    ico = PUBLIC_DIR / "favicon.ico"
    if ico.exists():
        return FileResponse(str(ico), media_type="image/x-icon")
    png = PUBLIC_DIR / "favicon.png"
    if png.exists():
        return FileResponse(str(png), media_type="image/png")
    return Response(status_code=204)  # 404 대신 조용히 처리

# 간단한 요청 로그 (디버그용)
@app.middleware("http")
async def log_requests(request: Request, call_next):
    resp: Response
    try:
        resp = await call_next(request)
    finally:
        # 필요한 경우 상세 로깅 추가
        pass
    return resp

# -------------------------------------------------
# 유틸
# -------------------------------------------------
def _b64_png(path: Path) -> str:
    """PNG 파일을 data URI(base64)로 변환"""
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")
    try:
        with open(path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("ascii")
        return "data:image/png;base64," + encoded
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading image: {e}")

async def _read_csv_async(file_path: Path):
    """CSV를 스레드에서 읽기 (이벤트 루프 비블로킹)"""
    def _read():
        import pandas as pd

        return pd.read_csv(file_path, index_col="Date", parse_dates=["Date"]).fillna("NaN")
    return await asyncio.to_thread(_read)


# -------------------------------------------------
# Traffic AIOps MVP API
# -------------------------------------------------
@api_router.get("/system/status")
def get_system_status():
    latest_evaluation = APP_STATE["latest_evaluation"]
    return _response(
        {
            "system_name": SYSTEM_NAME,
            "target_config": TARGET_CONFIG,
            "champion_model": _public_champion_model(),
            "runtime_model": _runtime_model_public(),
            "latest_health_status": APP_STATE["latest_health_status"],
            "latest_evaluation_id": latest_evaluation["evaluation_id"] if latest_evaluation else None,
            "storage_mode": "memory_only",
        }
    )


@api_router.get("/system/runtime-model")
def get_runtime_model():
    return _response(_runtime_model_public())


@api_router.post("/admin/update-model")
def update_model(payload: ModelUpdateRequest, x_admin_token: Optional[str] = Header(default=None)):
    auth = _require_model_admin(x_admin_token)
    result = _activate_runtime_model(payload)
    return _response({**result, **auth}, "model updated")


@api_router.post("/evaluations")
def create_evaluation(payload: EvaluationRequest):
    evaluation = _start_batch_evaluation(payload)
    return _response(evaluation, "evaluation started")


@api_router.get("/evaluations/latest")
def get_latest_evaluation():
    return _response(APP_STATE["latest_evaluation"])


@api_router.get("/evaluations/{evaluation_id}")
def get_evaluation(evaluation_id: str):
    evaluation = APP_STATE.get("evaluations", {}).get(evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail=f"Evaluation not found: {evaluation_id}")
    return _response(evaluation)


def _find_evaluation(evaluation_id: Optional[str]) -> Dict[str, Any]:
    evaluation = (
        APP_STATE.get("evaluations", {}).get(evaluation_id)
        if evaluation_id
        else APP_STATE["latest_evaluation"]
    )
    if not evaluation:
        raise HTTPException(status_code=404, detail="No evaluation has been created yet.")
    if evaluation["status"] in {"queued", "running", "generating_report"}:
        raise HTTPException(status_code=409, detail="Evaluation is still running.")
    return evaluation


@api_router.post("/reports")
def create_report(payload: ReportRequest):
    evaluation = _find_evaluation(payload.evaluation_id)
    if evaluation["health_status"] == "healthy":
        raise HTTPException(status_code=400, detail="Healthy evaluations do not require a report.")

    report = _build_report(evaluation)
    _save_report(report)
    return _response(report, "report created")


@api_router.get("/reports/latest")
def get_latest_report():
    return _response(APP_STATE["latest_report"])


@api_router.get("/reports")
def get_reports():
    return _response(APP_STATE["reports"])


@api_router.get("/reports/{report_id}/download")
def download_report(report_id: str):
    report = next((item for item in APP_STATE["reports"] if item["report_id"] == report_id), None)
    if not report:
        raise HTTPException(status_code=404, detail=f"Report not found: {report_id}")
    filename = f"{report_id}.md"
    return PlainTextResponse(
        report["markdown"],
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.post("/decisions")
def create_decision(payload: DecisionRequest):
    report = APP_STATE["latest_report"]
    if not report or report["report_id"] != payload.report_id:
        raise HTTPException(status_code=404, detail=f"Report not found: {payload.report_id}")

    decision = {
        "decision_id": _next_id("decision"),
        "report_id": payload.report_id,
        "decision": payload.decision,
        "comment": payload.comment,
        "status": "accepted",
        "created_at": _iso(),
    }
    APP_STATE["latest_decision"] = decision
    report["status"] = "closed"
    _append_session_event(
        {
            "type": "decision",
            "report_id": payload.report_id,
            "decision_id": decision["decision_id"],
            "decision": payload.decision,
            "created_at": decision["created_at"],
        }
    )
    return _response(decision, "decision saved")


@api_router.post("/training-jobs")
def create_training_job(payload: TrainingJobRequest):
    decision = APP_STATE["latest_decision"]
    if not decision or decision["decision_id"] != payload.decision_id:
        raise HTTPException(status_code=404, detail=f"Decision not found: {payload.decision_id}")
    if decision["decision"] != "retrain":
        raise HTTPException(status_code=400, detail="Training jobs can only start from retrain decisions.")

    source_evaluation = APP_STATE["latest_evaluation"]
    if not source_evaluation:
        raise HTTPException(status_code=400, detail="No evaluation is available for retraining.")
    if source_evaluation["status"] in {"queued", "running", "generating_report"}:
        raise HTTPException(status_code=409, detail="Evaluation is still running.")
    training_batch_ids = set(source_evaluation.get("training_scope", {}).get("batch_ids", []))
    training_batches = [
        batch for batch in source_evaluation.get("batch_results", [])
        if batch["batch_id"] in training_batch_ids
    ]
    failed_batch = source_evaluation.get("failed_batch")
    next_batch_index = (
        failed_batch["batch_index"] + 1
        if failed_batch
        else source_evaluation.get("start_batch_index", 0) + len(source_evaluation.get("batch_results", []))
    )
    job = {
        "job_id": _next_id("job"),
        "decision_id": payload.decision_id,
        "status": "completed",
        "progress": 100,
        "current_stage": "retrained_and_re_evaluation_started" if payload.rerun_evaluation else "retrained_model_overwritten",
        "source_evaluation_id": source_evaluation["evaluation_id"],
        "training_scope": source_evaluation.get("training_scope"),
        "created_candidate_model_version_id": None,
        "model_update_result": None,
        "followup_evaluation": None,
        "policy": {
            "retraining_window_days": TARGET_CONFIG["retraining_window_days"],
            "batch_unit": TARGET_CONFIG["batch_unit"],
            "batch_size": TARGET_CONFIG["batch_size"],
        },
        "note": f"기존 운영 모델을 덮어쓴 뒤 {next_batch_index + 1}번째 7일 배치부터 성능 테스트 작업을 이어서 시작합니다.",
        "next_evaluation_start_batch_index": next_batch_index,
        "created_at": _iso(),
        "finished_at": None,
    }
    job["model_update_result"] = _retrain_overwrite_model(training_batches, payload, job["job_id"])
    if payload.rerun_evaluation:
        job["followup_evaluation"] = _start_batch_evaluation(
            EvaluationRequest(
                trigger_type="manual",
                after_retraining=True,
                start_batch_index=next_batch_index,
            )
        )
    job["finished_at"] = _iso()
    APP_STATE["latest_training_job"] = job
    APP_STATE["latest_candidate"] = None
    _append_session_event(
        {
            "type": "training_job",
            "decision_id": payload.decision_id,
            "job_id": job["job_id"],
            "overwrite": True,
            "followup_evaluation_id": job["followup_evaluation"]["evaluation_id"] if job["followup_evaluation"] else None,
            "created_at": job["created_at"],
        }
    )
    return _response(job, "training job created")


@api_router.get("/training-jobs/{job_id}")
def get_training_job(job_id: str):
    job = APP_STATE["latest_training_job"]
    if not job or job["job_id"] != job_id:
        raise HTTPException(status_code=404, detail=f"Training job not found: {job_id}")
    return _response(job)


@api_router.get("/model-candidates/latest")
def get_latest_candidate():
    return _response(APP_STATE["latest_candidate"])


@api_router.post("/model-versions/{model_version_id}/promote")
def promote_model(model_version_id: str):
    candidate = APP_STATE["latest_candidate"]
    if not candidate or candidate["candidate_model_version_id"] != model_version_id:
        raise HTTPException(status_code=404, detail=f"Candidate model not found: {model_version_id}")
    if not candidate["comparison_with_champion"]["is_better"]:
        candidate["status"] = "rejected"
        raise HTTPException(status_code=400, detail="Candidate model is not better than the current champion.")

    previous_champion = APP_STATE["champion_model"]["model_version_id"]
    APP_STATE["champion_model"] = {
        "model_version_id": model_version_id,
        "model_name": candidate["model_name"],
        "trained_at_dt": _now(),
        "trained_at": _iso(),
        "rmse": candidate.get("metrics", {}).get("rmse", candidate.get("rmse")),
        "smape": candidate.get("metrics", {}).get("smape", candidate.get("smape")),
        "r2": candidate.get("metrics", {}).get("r2", candidate.get("r2")),
    }
    candidate["status"] = "promoted"
    APP_STATE["latest_health_status"] = "healthy"
    promotion = {
        "promotion_id": _next_id("promotion"),
        "previous_champion": previous_champion,
        "new_champion": model_version_id,
        "status": "promoted",
        "created_at": _iso(),
    }
    _append_session_event({"type": "promotion", **promotion})
    return _response(promotion, "model promoted successfully")


@api_router.get("/history")
def get_history():
    return _response(
        {
            "storage_mode": "memory_only",
            "items": APP_STATE["session_events"],
            "note": "MVP에서는 DB 이력 저장을 하지 않고 현재 서버 프로세스 메모리에만 보관합니다.",
        }
    )

# -------------------------------------------------
# 헬스체크 / 루트
# -------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "root_path": APP_ROOT_PATH or "/"}

@app.get("/")
def root():
    """
    index.html을 반환하되, 프리픽스가 있을 경우 <base href=".../">를 주입해
    정적 자원 경로 문제를 완화합니다.
    """
    index_html = PUBLIC_DIR / "index.html"
    if not index_html.exists():
        return {"message": "public/index.html not found. Place your frontend under /public or use /static."}

    html = index_html.read_text(encoding="utf-8", errors="ignore")

    rp = APP_ROOT_PATH or "/"
    # 이미 base가 없다면 <head> 바로 뒤에 주입
    if "<base" not in html.lower():
        html = html.replace("<head>", f'<head><base href="{rp if rp.endswith("/") else rp + "/"}">', 1)

    return HTMLResponse(content=html)

# -------------------------------------------------
# 업로드/예측
# -------------------------------------------------
@router.post("/upload")
async def post_data_set(file: UploadFile = File(...)):
    """
    CSV 업로드 → 두 LSTM 모델(weight_used_model, model)로 예측 수행
    - 무거운 연산은 모두 스레드로 오프로드하여 서버 반응성 유지
    - 모델 모듈은 요청 시 동적 임포트(스타트업 블로킹 방지)
    """
    try:
        # 1) 저장 경로 구성
        current_time = datetime.now(timezone).strftime("%Y%m%d_%H%M%S")
        new_filename = f"{current_time}_{file.filename}"
        file_location = Path(UPLOAD_DIR) / new_filename

        # 2) 업로드 파일 저장
        contents = await file.read()
        await asyncio.to_thread(file_location.write_bytes, contents)

        # 3) CSV 로드
        dataset = await _read_csv_async(file_location)

        # 4) 모듈 지연 임포트
        weight_mod = importlib.import_module(".weight_used_model", package=__package__)
        model_mod = importlib.import_module(".model", package=__package__)

        # 5) 예측 실행 (스레드 오프로드)
        result_visualizing_LSTM, result_evaluating_LSTM = await asyncio.to_thread(weight_mod.process, dataset)
        result_visualizing_LSTM_v2, result_evaluating_LSTM_v2 = await asyncio.to_thread(model_mod.process, dataset)

        # todo: rmse 비교하는거 넣어서 값이 떨어지면 재학습 시키기

        # 6) 결과 이미지 존재 확인
        img1 = Path(result_visualizing_LSTM)
        img2 = Path(result_visualizing_LSTM_v2)
        if not img1.exists():
            raise HTTPException(status_code=500, detail=f"File not found: {img1}")
        if not img2.exists():
            raise HTTPException(status_code=500, detail=f"File not found: {img2}")

        return {
            "result_visualizing_LSTM": _b64_png(img1),
            "result_evaluating_LSTM": result_evaluating_LSTM,
            "result_visualizing_LSTM_v2": _b64_png(img2),
            "result_evaluating_LSTM_v2": result_evaluating_LSTM_v2,
            "saved_filename": new_filename,
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------
# 다운로드/뷰
# -------------------------------------------------
@router.get("/download")
async def download():
    """weight_used_model이 생성한 stock 예측 이미지를 다운로드"""
    try:
        weight_mod = importlib.import_module(".weight_used_model", package=__package__)
        img_name = Path(IMAGE_DIR) / weight_mod.get_stock_png()
        if not img_name.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {img_name}")
        return FileResponse(path=str(img_name), media_type="application/octet-stream", filename="stock.png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download_shapes")
async def download_model_architecture_shapes():
    """weight_used_model이 생성한 모델 구조(shapes) 이미지를 다운로드"""
    try:
        weight_mod = importlib.import_module(".weight_used_model", package=__package__)
        img_name = Path(IMAGE_DIR) / weight_mod.get_model_shapes_png()
        if not img_name.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {img_name}")
        return FileResponse(path=str(img_name), media_type="application/octet-stream", filename="model_shapes.png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/view-download")
async def view_downloaded_image():
    """weight_used_model이 생성한 stock 예측 이미지를 HTML로 보기"""
    try:
        weight_mod = importlib.import_module(".weight_used_model", package=__package__)
        img_name = Path(IMAGE_DIR) / weight_mod.get_stock_png()
        img_base64 = _b64_png(img_name)
        return HTMLResponse(
            content=f"""
            <html>
                <body>
                    <h1>Downloaded Stock Prediction Image</h1>
                    <img src="{img_base64}" alt="Stock Prediction Image" />
                </body>
            </html>
            """
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(api_router)
app.include_router(router)

# 실행 명령어 예시: 순서대로 백엔드 띄운 후, 프론트엔드 띄우기, 현재 디렉토리 server_model 상위에서 실행 (상대 경로 . 사용)
# python -m uvicorn server_model.main:app --port 8001 --reload
# http://localhost:8001/static/index.html
