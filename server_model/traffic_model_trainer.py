from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from .traffic_model_train import (
    DEFAULT_ARTIFACT_PATH,
    build_training_bundle,
    ensure_model_artifact,
    save_model,
)


def _training_frame_from_batches(training_batches: list[dict[str, Any]]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for batch in training_batches:
        for point in batch.get("forecast_points", []):
            rows.append(
                {
                    "timestamp": pd.to_datetime(point["timestamp"], utc=True),
                    "actual": float(point["actual"]),
                }
            )
    if not rows:
        raise ValueError("training_batches did not contain any forecast_points.")

    frame = pd.DataFrame(rows)
    return frame.sort_values("timestamp").reset_index(drop=True)


def retrain_model(
    training_batches: list[dict[str, Any]],
    current_model: dict[str, Any] | None = None,
    target_artifact_path: str | Path = DEFAULT_ARTIFACT_PATH,
) -> dict[str, Any]:
    bundle = current_model if current_model is not None else ensure_model_artifact(DEFAULT_ARTIFACT_PATH)
    train_frame = _training_frame_from_batches(training_batches)
    retrained_bundle = build_training_bundle(
        train_frame,
        order=tuple(bundle["order"]),
        seasonal_order=tuple(bundle["seasonal_order"]),
        metric=bundle["metric"],
        rmse_threshold=float(bundle.get("rmse_threshold", 60000.0)),
        artifact_path=target_artifact_path,
    )
    saved_path = save_model(retrained_bundle, target_artifact_path)
    return {
        "model_object": retrained_bundle,
        "artifact_path": saved_path,
        "model_key": retrained_bundle["model_key"],
        "display_name": retrained_bundle["display_name"],
        "train_rows": retrained_bundle["train_rows"],
        "train_start_at": retrained_bundle["train_start_at"],
        "train_end_at": retrained_bundle["train_end_at"],
        "rmse_threshold": retrained_bundle["rmse_threshold"],
    }


def retrain(
    training_batches: list[dict[str, Any]],
    current_model: dict[str, Any] | None = None,
    target_artifact_path: str | Path = DEFAULT_ARTIFACT_PATH,
) -> dict[str, Any]:
    return retrain_model(training_batches, current_model, target_artifact_path)
