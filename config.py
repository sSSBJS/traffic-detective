# config.py
import os
from pathlib import Path

# 기본 경로 설정
_PROJECT_ROOT = Path(__file__).resolve().parent
_DEFAULT_BASE_DIR = _PROJECT_ROOT / "server"
BASE_DIR = Path(os.getenv("BASE_DIR", str(_DEFAULT_BASE_DIR))).resolve()

UPLOAD_DIR = str(BASE_DIR / "uploaded_files")
MODEL_DIR = str(BASE_DIR / "model")
IMAGE_DIR = str(BASE_DIR / "view-model-architecture")
MODEL_IMG_DIR = str(BASE_DIR / "model-images")

# 파일 경로
DATA_PATH = str(Path(UPLOAD_DIR) / "IBM_2006-01-01_to_2018-01-01.csv")
MODEL_SAVE_PATH = str(Path(MODEL_DIR) / "result" / "stock_lstm_model.keras")
MODEL_PLOT_PATH = str(Path(IMAGE_DIR) / "model.png")
MODEL_SHAPES_PLOT_PATH = str(Path(IMAGE_DIR) / "model_shapes.png")
PREDICTION_PLOT_PATH = str(Path(IMAGE_DIR) / "stock.png")
