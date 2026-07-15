"""
YOLO product-detection service.

Loads the pre-trained SKU110K product-bounding-box detector
(Model/yolov11n_all_final.pkl, a pickled `ultralytics.YOLO` object) and exposes
inference. Not yet wired into the /api/analyze scoring pipeline -- this service
only proves the model loads correctly and can run a real forward pass.
"""
import io
import logging
import os
import pickle
from pathlib import Path
from typing import Optional

from PIL import Image

logger = logging.getLogger(__name__)


def _resolve_model_path() -> Path:
    if env_path := os.getenv("YOLO_MODEL_PATH"):
        return Path(env_path)
    # Local dev layout: Application/backend/app/services/yolo_service.py -> repo_root/Model/...
    here = Path(__file__).resolve()
    if len(here.parents) > 4:
        dev_path = here.parents[4] / "Model" / "yolov11n_all_final.pkl"
        if dev_path.exists():
            return dev_path
    # Container layout: model copied to a fixed absolute path (see Dockerfile).
    return Path("/Model/yolov11n_all_final.pkl")


MODEL_PATH = _resolve_model_path()
SAMPLE_IMAGE_PATH = Path(__file__).resolve().parents[1] / "assets" / "sample_shelf.jpg"


class YoloService:
    def __init__(self):
        self._model = None
        self._load_error: Optional[str] = None

    def load(self) -> None:
        if self._model is not None or self._load_error is not None:
            return
        try:
            with open(MODEL_PATH, "rb") as f:
                self._model = pickle.load(f)
            logger.info("YOLO model loaded from %s", MODEL_PATH)
        except Exception as exc:
            self._load_error = str(exc)
            logger.error("Failed to load YOLO model: %s", exc)

    def detect(self, image_bytes: bytes, conf: float = 0.25, iou: float = 0.4) -> list[dict]:
        self.load()
        if self._model is None:
            raise RuntimeError(f"YOLO model not loaded: {self._load_error}")

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        results = self._model.predict(image, conf=conf, iou=iou, verbose=False)
        boxes = []
        for box in results[0].boxes:
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            boxes.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": float(box.conf[0]),
                "class_id": int(box.cls[0]),
            })
        return boxes

    def health(self) -> dict:
        self.load()
        if self._model is None:
            return {"loaded": False, "error": self._load_error}

        info: dict = {
            "loaded": True,
            "task": getattr(self._model, "task", None),
            "class_names": list(self._model.names.values()) if getattr(self._model, "names", None) else [],
        }

        try:
            boxes = self.detect(SAMPLE_IMAGE_PATH.read_bytes())
            info["inference_smoke_test"] = "ok"
            info["sample_detections"] = len(boxes)
        except Exception as exc:
            info["inference_smoke_test"] = "failed"
            info["inference_error"] = str(exc)

        return info


yolo_service = YoloService()
