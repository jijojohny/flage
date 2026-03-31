FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

COPY src/ ./src/
COPY create_dummy_model.py .

RUN python3 create_dummy_model.py

ENV MODEL_PATH=/app/model/model.pt

CMD ["python3", "src/runner.py"]
