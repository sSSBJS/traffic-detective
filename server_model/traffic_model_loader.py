from __future__ import annotations

from pathlib import Path

from .traffic_model_train import ensure_model_artifact, load_model as _load_model


def load_model(path: str) -> dict:
    artifact_path = Path(path)
    if artifact_path.exists():
        return _load_model(artifact_path)
    return ensure_model_artifact(artifact_path)


def load(path: str) -> dict:
    return load_model(path)
