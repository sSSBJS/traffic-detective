from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import pickle
from typing import Any

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_PATH = Path(
    os.getenv("TRAFFIC_MODEL_DATA_PATH", ROOT_DIR.parent / "data" / "605036.csv")
).resolve()
DEFAULT_ARTIFACT_DIR = Path(
    os.getenv("MODEL_ARTIFACT_DIR", ROOT_DIR.parent / "server" / "model" / "runtime")
).resolve()
DEFAULT_ARTIFACT_PATH = DEFAULT_ARTIFACT_DIR / "active_traffic_model.pkl"
DEFAULT_METRIC = "n_flows"
DEFAULT_TIME_COLUMN = "timestamp"
DEFAULT_ID_TIME_COLUMN = "id_time"
DEFAULT_SYNTHETIC_START_AT = os.getenv("TRAFFIC_MODEL_SYNTHETIC_START_AT", "2023-01-01T00:00:00+00:00")
DEFAULT_ID_TIME_UNIT = os.getenv("TRAFFIC_MODEL_ID_TIME_UNIT", "D")
DEFAULT_MODEL_KEY = "traffic_forecaster"
DEFAULT_MODEL_NAME = "Traffic SARIMAX Model"
DEFAULT_ORDER = (1, 1, 1)
DEFAULT_SEASONAL_ORDER = (1, 1, 1, 7)
FALLBACK_RMSE_THRESHOLD = 0.0
DEFAULT_INITIAL_TRAINING_DAYS = int(os.getenv("INITIAL_TRAINING_DAYS", "30"))


def load_series(
    csv_path: str | Path = DEFAULT_DATA_PATH,
    *,
    metric: str = DEFAULT_METRIC,
    time_column: str = DEFAULT_TIME_COLUMN,
) -> pd.DataFrame:
    frame = pd.read_csv(csv_path)
    if metric not in frame.columns:
        raise KeyError(f"Metric '{metric}' was not found in {csv_path}.")

    if time_column in frame.columns:
        timestamps = pd.to_datetime(frame[time_column], utc=True)
    elif DEFAULT_ID_TIME_COLUMN in frame.columns:
        start_at = pd.Timestamp(DEFAULT_SYNTHETIC_START_AT)
        if start_at.tzinfo is None:
            start_at = start_at.tz_localize("UTC")
        else:
            start_at = start_at.tz_convert("UTC")
        offsets = pd.to_numeric(frame[DEFAULT_ID_TIME_COLUMN], errors="raise")
        timestamps = start_at + pd.to_timedelta(offsets, unit=DEFAULT_ID_TIME_UNIT)
    else:
        raise KeyError(
            f"Time column '{time_column}' or '{DEFAULT_ID_TIME_COLUMN}' was not found in {csv_path}."
        )

    series = pd.DataFrame({"timestamp": timestamps, "actual": frame[metric]})
    series["actual"] = series["actual"].astype(float)
    return series.sort_values("timestamp").reset_index(drop=True)


def split_three_segments(series: pd.DataFrame) -> list[pd.DataFrame]:
    boundaries = np.linspace(0, len(series), 4, dtype=int)
    return [series.iloc[boundaries[index] : boundaries[index + 1]].reset_index(drop=True) for index in range(3)]


def split_initial_training_and_evaluation(
    series: pd.DataFrame,
    *,
    training_days: int = DEFAULT_INITIAL_TRAINING_DAYS,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    start_at = series["timestamp"].iloc[0]
    cutoff = start_at + pd.Timedelta(days=training_days)
    train_frame = series[series["timestamp"] < cutoff].reset_index(drop=True)
    evaluation_frame = series[series["timestamp"] >= cutoff].reset_index(drop=True)
    if train_frame.empty:
        raise ValueError("initial training window did not contain any rows.")
    if evaluation_frame.empty:
        raise ValueError("evaluation window did not contain any rows after initial training.")
    return train_frame, evaluation_frame


def load_evaluation_series(csv_path: str | Path = DEFAULT_DATA_PATH) -> pd.DataFrame:
    series = load_series(csv_path)
    _, evaluation_frame = split_initial_training_and_evaluation(series)
    return evaluation_frame


def _regression_metrics(actuals: np.ndarray, predictions: np.ndarray) -> dict[str, float]:
    length = min(len(actuals), len(predictions))
    actuals = np.asarray(actuals[:length], dtype=np.float64)
    predictions = np.asarray(predictions[:length], dtype=np.float64)
    mask = np.isfinite(actuals) & np.isfinite(predictions)
    actuals = actuals[mask]
    predictions = predictions[mask]
    if not len(actuals):
        return {"rmse": float(FALLBACK_RMSE_THRESHOLD), "smape": 0.0, "r2": 0.0}

    rmse = float(np.sqrt(np.mean(np.square(actuals - predictions))))
    denominator = np.maximum((np.abs(actuals) + np.abs(predictions)) / 2.0, 1.0)
    smape = float(np.mean(np.abs(actuals - predictions) / denominator) * 100.0)
    ss_tot = float(np.sum(np.square(actuals - np.mean(actuals))))
    ss_res = float(np.sum(np.square(actuals - predictions)))
    r2 = float(0.0 if ss_tot == 0 else 1 - (ss_res / ss_tot))
    return {
        "rmse": round(rmse, 2),
        "smape": round(smape, 2),
        "r2": round(r2, 4),
    }


def _training_metric_inputs(values: np.ndarray, fitted_values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    start_index = 1 if len(values) > 1 and len(fitted_values) > 1 else 0
    return values[start_index:], fitted_values[start_index:]


def build_training_bundle(
    train_frame: pd.DataFrame,
    *,
    order: tuple[int, int, int] = DEFAULT_ORDER,
    seasonal_order: tuple[int, int, int, int] = DEFAULT_SEASONAL_ORDER,
    metric: str = DEFAULT_METRIC,
    rmse_threshold: float | None = None,
    maxiter: int = 30,
    artifact_path: str | Path | None = None,
) -> dict[str, Any]:
    values = train_frame["actual"].to_numpy(dtype=np.float64)
    model = SARIMAX(
        values,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    results = model.fit(disp=False, maxiter=maxiter)
    metric_actuals, metric_predictions = _training_metric_inputs(
        values,
        np.asarray(results.fittedvalues, dtype=np.float64),
    )
    train_metrics = _regression_metrics(metric_actuals, metric_predictions)
    baseline_rmse = train_metrics["rmse"] if rmse_threshold is None else float(rmse_threshold)

    return {
        "model_key": DEFAULT_MODEL_KEY,
        "display_name": DEFAULT_MODEL_NAME,
        "metric": metric,
        "time_column": "timestamp",
        "order": order,
        "seasonal_order": seasonal_order,
        "rmse": train_metrics["rmse"],
        "smape": train_metrics["smape"],
        "r2": train_metrics["r2"],
        "train_rmse": train_metrics["rmse"],
        "train_smape": train_metrics["smape"],
        "train_r2": train_metrics["r2"],
        "rmse_threshold": baseline_rmse,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "train_rows": int(len(train_frame)),
        "train_start_at": train_frame["timestamp"].iloc[0].isoformat(),
        "train_end_at": train_frame["timestamp"].iloc[-1].isoformat(),
        "artifact_path": str(artifact_path) if artifact_path else None,
        "results": results,
    }


def save_model(model_bundle: dict[str, Any], path: str | Path = DEFAULT_ARTIFACT_PATH) -> str:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    model_bundle["artifact_path"] = str(target)
    with target.open("wb") as handle:
        pickle.dump(model_bundle, handle)
    return str(target)


def load_model(path: str | Path = DEFAULT_ARTIFACT_PATH) -> dict[str, Any]:
    with Path(path).open("rb") as handle:
        return pickle.load(handle)


def load(path: str | Path = DEFAULT_ARTIFACT_PATH) -> dict[str, Any]:
    return load_model(path)


def ensure_model_artifact(path: str | Path = DEFAULT_ARTIFACT_PATH) -> dict[str, Any]:
    artifact_path = Path(path)
    if artifact_path.exists():
        return load_model(artifact_path)
    raise FileNotFoundError(
        f"Pretrained model artifact not found: {artifact_path}. "
        "Run server_model.traffic_model_train once before starting the API."
    )


def _initial_training_frame(
    csv_path: str | Path,
    *,
    metric: str,
    training_days: int,
    segment_index: int | None,
) -> pd.DataFrame:
    series = load_series(csv_path, metric=metric)
    if segment_index is not None:
        segments = split_three_segments(series)
        if segment_index not in {0, 1, 2}:
            raise ValueError("segment_index must be 0, 1, or 2.")
        return segments[segment_index]

    train_frame, _ = split_initial_training_and_evaluation(series, training_days=training_days)
    return train_frame


def train_initial_model(
    csv_path: str | Path = DEFAULT_DATA_PATH,
    *,
    artifact_path: str | Path = DEFAULT_ARTIFACT_PATH,
    metric: str = DEFAULT_METRIC,
    order: tuple[int, int, int] = DEFAULT_ORDER,
    seasonal_order: tuple[int, int, int, int] = DEFAULT_SEASONAL_ORDER,
    rmse_threshold: float | None = None,
    training_days: int = DEFAULT_INITIAL_TRAINING_DAYS,
    segment_index: int | None = None,
    maxiter: int = 30,
) -> dict[str, Any]:
    train_frame = _initial_training_frame(
        csv_path,
        metric=metric,
        training_days=training_days,
        segment_index=segment_index,
    )
    bundle = build_training_bundle(
        train_frame,
        order=order,
        seasonal_order=seasonal_order,
        metric=metric,
        rmse_threshold=rmse_threshold,
        maxiter=maxiter,
        artifact_path=artifact_path,
    )
    saved_path = save_model(bundle, artifact_path)
    return {
        "model_object": bundle,
        "artifact_path": saved_path,
        "model_key": bundle["model_key"],
        "display_name": bundle["display_name"],
        "train_rows": bundle["train_rows"],
        "train_start_at": bundle["train_start_at"],
        "train_end_at": bundle["train_end_at"],
        "rmse": bundle["rmse"],
        "smape": bundle["smape"],
        "r2": bundle["r2"],
        "rmse_threshold": bundle["rmse_threshold"],
        "order": bundle["order"],
        "seasonal_order": bundle["seasonal_order"],
    }


if __name__ == "__main__":
    summary = train_initial_model()
    print(summary)
