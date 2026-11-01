FROM python:3.15-slim

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir .

# Run unprivileged. The audit log lives in /data (mount a volume there to keep it
# across restarts).
RUN useradd --system --uid 10001 --no-create-home cloudsentry \
    && mkdir /data && chown cloudsentry /data
USER 10001
ENV CLOUDSENTRY_ACTIONS_DB=/data/cloudsentry_actions.db

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
