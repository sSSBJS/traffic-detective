from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import pickle
from typing import Any

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_PATH = ROOT_DIR / "data" / "simulated_trend_data.csv"
DEFAULT_ARTIFACT_DIR = ROOT_DIR / "model_artifacts"
DEFAULT_ARTIFACT_PATH = DEFAULT_ARTIFACT_DIR / "active_traffic_model.pkl"
DEFAULT_METRIC = "n_bytes"
DEFAULT_TIME_COLUMN = "timestamp"
DEFAULT_MODEL_KEY = "traffic_forecaster"
DEFAULT_MODEL_NAME = "Traffic SARIMAX Model"
DEFAULT_ORDER = (1, 1, 1)
DEFAULT_SEASONAL_ORDER = (1, 1, 1, 168)
DEFAULT_RMSE_THRESHOLD = 60000.0


def load_series(
    csv_path: str | Path = DEFAULT_DATA_PATH,
    *,
    metric: str = DEFAULT_METRIC,
    time_column: str = DEFAULT_TIME_COLUMN,
) -> pd.DataFrame:
    frame = pd.read_csv(csv_path)
    if metric not in frame.columns:
        raise KeyError(f"Metric '{metric}' was not found in {csv_path}.")
    if time_column not in frame.columns:
        raise KeyError(f"Time column '{time_column}' was not found in {csv_path}.")

    series = frame[[time_column, metric]].copy()
    series[time_column] = pd.to_datetime(series[time_column], utc=True)
    series = series.rename(columns={time_column: "timestamp", metric: "actual"})
    series["actual"] = series["actual"].astype(float)
    return series.sort_values("timestamp").reset_index(drop=True)


def split_three_segments(series: pd.DataFrame) -> list[pd.DataFrame]:
    boundaries = np.linspace(0, len(series), 4, dtype=int)
    return [series.iloc[boundaries[index] : boundaries[index + 1]].reset_index(drop=True) for index in range(3)]


def build_training_bundle(
    train_frame: pd.DataFrame,
    *,
    order: tuple[int, int, int] = DEFAULT_ORDER,
    seasonal_order: tuple[int, int, int, int] = DEFAULT_SEASONAL_ORDER,
    metric: str = DEFAULT_METRIC,
    rmse_threshold: float = DEFAULT_RMSE_THRESHOLD,
    maxiter: int = 30,
    artifact_path: str | Path | None = None,
) -> dict[str, Any]:
    values = train_frame["actual"].to_numpy(dtype=np.float64)
    model = SARIMAX(
        values,
        order=order,
        seasonal_order=seasonal_order,
        simple_differencing=True,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    results = model.fit(disp=False, maxiter=maxiter)

    return {
        "model_key": DEFAULT_MODEL_KEY,
        "display_name": DEFAULT_MODEL_NAME,
        "metric": metric,
        "time_column": "timestamp",
        "order": order,
        "seasonal_order": seasonal_order,
        "rmse_threshold": float(rmse_threshold),
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


def train_initial_model(
    csv_path: str | Path = DEFAULT_DATA_PATH,
    *,
    artifact_path: str | Path = DEFAULT_ARTIFACT_PATH,
    metric: str = DEFAULT_METRIC,
    order: tuple[int, int, int] = DEFAULT_ORDER,
    seasonal_order: tuple[int, int, int, int] = DEFAULT_SEASONAL_ORDER,
    rmse_threshold: float = DEFAULT_RMSE_THRESHOLD,
    segment_index: int = 0,
    maxiter: int = 30,
) -> dict[str, Any]:
    series = load_series(csv_path, metric=metric)
    segments = split_three_segments(series)
    if segment_index not in {0, 1, 2}:
        raise ValueError("segment_index must be 0, 1, or 2.")

    train_frame = segments[segment_index]
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
        "rmse_threshold": bundle["rmse_threshold"],
        "order": bundle["order"],
        "seasonal_order": bundle["seasonal_order"],
    }


if __name__ == "__main__":
    summary = train_initial_model()
    print(summary)
