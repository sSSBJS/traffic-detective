from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from .traffic_model_train import DEFAULT_ARTIFACT_PATH, ensure_model_artifact, save_model


def _timestamps_from_batch(rows: list[dict[str, Any]]) -> list[str]:
    return [str(row.get("timestamp", "")) for row in rows]


def _actuals_from_batch(rows: list[dict[str, Any]]) -> np.ndarray:
    return np.asarray([float(row["actual"]) for row in rows], dtype=np.float64)


def _smape(actuals: np.ndarray, predictions: np.ndarray) -> float:
    denominator = np.maximum((np.abs(actuals) + np.abs(predictions)) / 2.0, 1.0)
    return float(np.mean(np.abs(actuals - predictions) / denominator) * 100.0)


def _rmse(actuals: np.ndarray, predictions: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(actuals - predictions))))


def _r2(actuals: np.ndarray, predictions: np.ndarray) -> float:
    if len(actuals) <= 1:
        return 0.0
    ss_tot = float(np.sum(np.square(actuals - np.mean(actuals))))
    if ss_tot == 0:
        return 0.0
    ss_res = float(np.sum(np.square(actuals - predictions)))
    return float(1 - (ss_res / ss_tot))


def _prediction_order(bundle: dict[str, Any]) -> str:
    return (
        f"order={tuple(bundle['order'])}, "
        f"seasonal_order={tuple(bundle['seasonal_order'])}, "
        f"threshold={float(bundle['rmse_threshold']):.0f}"
    )


def evaluate_batch(batch: dict[str, Any], model: dict[str, Any] | None = None) -> dict[str, Any]:
    bundle = model if model is not None else ensure_model_artifact(DEFAULT_ARTIFACT_PATH)
    rows = batch["forecast_points"]
    actuals = _actuals_from_batch(rows)
    predictions = np.asarray(bundle["results"].forecast(steps=len(rows)), dtype=np.float64)

    result = {
        "model_key": bundle["model_key"],
        "display_name": bundle["display_name"],
        "order": _prediction_order(bundle),
        "rmse": _rmse(actuals, predictions),
        "smape": _smape(actuals, predictions),
        "r2": _r2(actuals, predictions),
        "predictions": predictions.astype(float).tolist(),
        "actuals": actuals.astype(float).tolist(),
        "timestamps": _timestamps_from_batch(rows),
        "rmse_threshold": float(bundle["rmse_threshold"]),
        "batch_id": batch.get("batch_id"),
        "batch_index": batch.get("batch_index"),
    }

    bundle["results"] = bundle["results"].append(actuals, refit=False)
    artifact_path = bundle.get("artifact_path")
    if artifact_path:
        save_model(bundle, Path(artifact_path))

    return result


def evaluate(batch: dict[str, Any], model: dict[str, Any] | None = None) -> dict[str, Any]:
    return evaluate_batch(batch, model)
