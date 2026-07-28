"""
YOLO product-detection service.

Loads the pre-trained SKU110K product-bounding-box detectors (pickled
`ultralytics.YOLO` objects) and exposes inference. Three models are available and
the caller chooses one per scan (Settings → Detection model):

  - "yolo11n"    : light & fast          (Model/yolov11n_all_final.pkl)
  - "yolo26s"    : more powerful, slower (Model/yolo26s_final.pkl)
  - "yolo26s_p2" : tuned for small/dense products (Model/yolo26s_p2_final.pkl)

Each model is lazy-loaded on first use and cached, so switching models mid-session
only pays the load cost once per model.

────────────────────────────────────────────────────────────────────────────────
 DEPLOYMENT / AWS  — where to point each model at its stored location
────────────────────────────────────────────────────────────────────────────────
Model files are resolved in this order for each key (see MODEL_REGISTRY below):
  1. the model's environment variable (set this on AWS)   ← configure here
  2. local dev path: <repo_root>/Model/<file>
  3. container path: /Model/<file>

On AWS, set these env vars to each model's stored path (the yolo11n one already
works today via YOLO_MODEL_PATH — use it as the reference):

  YOLO_MODEL_PATH        -> yolo11n     weights (already set correctly on AWS)
  YOLO26S_MODEL_PATH     -> yolo26s     weights   ← ADD on AWS
  YOLO26S_P2_MODEL_PATH  -> yolo26s_p2  weights   ← ADD on AWS
"""
import io
import logging
import os
import pickle
from pathlib import Path
from typing import Optional

from PIL import Image

logger = logging.getLogger(__name__)

DEFAULT_MODEL_KEY = "yolo11n"

# Per-model config: the env var that overrides its path on AWS, and the pickle
# filename used to resolve the local-dev / container fallback paths.
#   >>> To point a model at its AWS location, set its `env` variable on AWS. <<<
MODEL_REGISTRY: dict[str, dict[str, str]] = {
    "yolo11n":    {"env": "YOLO_MODEL_PATH",       "file": "yolov11n_all_final.pkl"},
    "yolo26s":    {"env": "YOLO26S_MODEL_PATH",    "file": "yolo26s_final.pkl"},
    "yolo26s_p2": {"env": "YOLO26S_P2_MODEL_PATH", "file": "yolo26s_p2_final.pkl"},
}


def _resolve_model_path(model_key: str) -> Path:
    """Resolve one model's weights path: env override → local dev → container."""
    cfg = MODEL_REGISTRY.get(model_key, MODEL_REGISTRY[DEFAULT_MODEL_KEY])
    if env_path := os.getenv(cfg["env"]):
        return Path(env_path)
    # Local dev layout: Application/backend/app/services/yolo_service.py -> repo_root/Model/...
    here = Path(__file__).resolve()
    if len(here.parents) > 4:
        dev_path = here.parents[4] / "Model" / cfg["file"]
        if dev_path.exists():
            return dev_path
    # Container layout: model copied to a fixed absolute path (see Dockerfile).
    return Path("/Model") / cfg["file"]


SAMPLE_IMAGE_PATH = Path(__file__).resolve().parents[1] / "assets" / "sample_shelf.jpg"


def _normalize_key(model_key: Optional[str]) -> str:
    """Accept a few friendly spellings; fall back to the default model."""
    if not model_key:
        return DEFAULT_MODEL_KEY
    k = model_key.strip().lower().replace("-", "_")
    return k if k in MODEL_REGISTRY else DEFAULT_MODEL_KEY


class YoloService:
    def __init__(self):
        # One loaded model + one load-error, cached per model key.
        self._models: dict[str, object] = {}
        self._load_errors: dict[str, str] = {}

    def load(self, model_key: Optional[str] = None) -> object:
        """Lazy-load (and cache) the requested model. Returns the model or raises."""
        key = _normalize_key(model_key)
        if key in self._models:
            return self._models[key]
        if key in self._load_errors:
            raise RuntimeError(f"YOLO model '{key}' not loaded: {self._load_errors[key]}")
        path = _resolve_model_path(key)
        try:
            with open(path, "rb") as f:
                model = pickle.load(f)
            self._models[key] = model
            logger.info("YOLO model '%s' loaded from %s", key, path)
            return model
        except Exception as exc:
            self._load_errors[key] = str(exc)
            logger.error("Failed to load YOLO model '%s' from %s: %s", key, path, exc)
            raise RuntimeError(f"YOLO model '{key}' not loaded: {exc}")

    def detect(
        self,
        image_bytes: bytes,
        conf: float = 0.25,
        iou: float = 0.4,
        max_det: Optional[int] = None,
        model_key: Optional[str] = None,
    ) -> list[dict]:
        """Run detection with the chosen model. `max_det` caps boxes at the source."""
        model = self.load(model_key)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        predict_kwargs = dict(conf=conf, iou=iou, verbose=False)
        if max_det is not None:
            predict_kwargs["max_det"] = int(max_det)
        results = model.predict(image, **predict_kwargs)
        boxes = []
        for box in results[0].boxes:
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            boxes.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": float(box.conf[0]),
                "class_id": int(box.cls[0]),
            })
        return boxes

    def health(self, model_key: Optional[str] = None) -> dict:
        key = _normalize_key(model_key)
        try:
            model = self.load(key)
        except Exception as exc:
            return {"loaded": False, "model": key, "error": str(exc)}

        info: dict = {
            "loaded": True,
            "model": key,
            "task": getattr(model, "task", None),
            "class_names": list(model.names.values()) if getattr(model, "names", None) else [],
            "available_models": list(MODEL_REGISTRY.keys()),
        }

        try:
            boxes = self.detect(SAMPLE_IMAGE_PATH.read_bytes(), model_key=key)
            info["inference_smoke_test"] = "ok"
            info["sample_detections"] = len(boxes)
        except Exception as exc:
            info["inference_smoke_test"] = "failed"
            info["inference_error"] = str(exc)

        return info


yolo_service = YoloService()
