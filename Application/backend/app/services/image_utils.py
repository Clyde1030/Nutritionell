"""
Image cropping helpers for turning YOLO pixel boxes into Gemini-ready crops.
"""
import base64
import io

from PIL import Image


def crop_boxes(image_bytes: bytes, boxes: list[dict], padding: float = 0.05) -> list[bytes]:
    """Crop each YOLO detection out of the source image, in order.

    `padding` is a fraction of each box's width/height added on every side so
    labels right at a box edge aren't clipped.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = image.size

    crops = []
    for box in boxes:
        x1, y1, x2, y2 = box["bbox"]
        pad_x = (x2 - x1) * padding
        pad_y = (y2 - y1) * padding
        left = max(0, int(x1 - pad_x))
        top = max(0, int(y1 - pad_y))
        right = min(img_w, int(x2 + pad_x))
        bottom = min(img_h, int(y2 + pad_y))

        crop = image.crop((left, top, right, bottom))
        buf = io.BytesIO()
        crop.save(buf, format="JPEG")
        crops.append(buf.getvalue())

    return crops


def pixel_bbox_to_normalized(bbox: list[float], img_w: int, img_h: int) -> list[float]:
    """Convert a YOLO `[x1,y1,x2,y2]` pixel box to `[ymin,xmin,ymax,xmax]` normalised 0-1."""
    x1, y1, x2, y2 = bbox
    return [y1 / img_h, x1 / img_w, y2 / img_h, x2 / img_w]


def crop_normalized_bbox(image_bytes: bytes, bbox: list[float]) -> bytes:
    """Crop a JPEG using a normalised `[ymin, xmin, ymax, xmax]` box (0.0-1.0).

    Used for the whole-image fallback identification path, where Gemini
    returns its own normalised bounding boxes instead of YOLO's pixel boxes.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = image.size
    ymin, xmin, ymax, xmax = bbox
    left = max(0, min(img_w, int(xmin * img_w)))
    top = max(0, min(img_h, int(ymin * img_h)))
    right = max(left + 1, min(img_w, int(xmax * img_w)))
    bottom = max(top + 1, min(img_h, int(ymax * img_h)))

    crop = image.crop((left, top, right, bottom))
    buf = io.BytesIO()
    crop.save(buf, format="JPEG")
    return buf.getvalue()


def encode_jpeg_data_uri(jpeg_bytes: bytes) -> str:
    """Base64 data URI for embedding a JPEG crop directly in an API response."""
    return "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode("ascii")
