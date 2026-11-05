# Same Python as the tested backend/.venv
FROM python:3.11-slim

WORKDIR /app

COPY requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt

COPY . .

# Uploads go to R2 in production; this folder is only used when S3_* isn't set (local Docker runs)
RUN useradd --create-home app && mkdir -p local_storage && chown -R app:app local_storage
USER app

ENV PORT=8001
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import os,urllib.request as u; u.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"

# --forwarded-allow-ips: only the proxy can reach this port, so its X-Forwarded-For (the student's address) is trusted.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port $PORT --workers ${WEB_WORKERS:-2} --proxy-headers --forwarded-allow-ips='*'"]
