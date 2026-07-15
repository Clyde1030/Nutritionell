# Build from the repo root so the YOLO model file (outside Application/backend) is in context:
#   docker build -f Application/backend/Dockerfile -t nutritionell-backend .
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY Application/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY Application/backend/ ./
COPY Model/yolov11n_all_final.pkl /Model/yolov11n_all_final.pkl

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
