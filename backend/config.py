"""Environment configuration and shared constants."""
from pathlib import Path
import os
import logging
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
# The pod may expose a stale local MONGO_URL through supervisor. The checked runtime
# configuration is authoritative so Atlas-only validation in db.py cannot be bypassed.
load_dotenv(ROOT_DIR / '.env', override=True)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("vidya")

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
APP_NAME = "vidya"

# S3-compatible object storage (Cloudflare R2, AWS S3, MinIO). When any of the four required
# values is missing, uploads are stored on local disk under backend/local_storage/ instead.
# R2 endpoint: https://<account_id>.r2.cloudflarestorage.com, region "auto".
S3_ENDPOINT_URL = (os.environ.get("S3_ENDPOINT_URL") or "").strip()
S3_ACCESS_KEY_ID = (os.environ.get("S3_ACCESS_KEY_ID") or "").strip()
S3_SECRET_ACCESS_KEY = (os.environ.get("S3_SECRET_ACCESS_KEY") or "").strip()
S3_BUCKET = (os.environ.get("S3_BUCKET") or "").strip()
S3_REGION = (os.environ.get("S3_REGION") or "").strip() or "auto"

DIFFICULTIES = ("easy", "medium", "hard")
_VALID_STATUSES = ("active", "pending_review", "inactive")
ENABLE_WATERMARKING = os.environ.get("ENABLE_WATERMARKING", "false").strip().lower() in ("true", "1", "yes")

import zoneinfo
APP_TIMEZONE_NAME = os.environ.get("APP_TIMEZONE", "Asia/Kolkata").strip() or "Asia/Kolkata"
try:
    APP_TIMEZONE = zoneinfo.ZoneInfo(APP_TIMEZONE_NAME)
except Exception:
    APP_TIMEZONE = zoneinfo.ZoneInfo("Asia/Kolkata")

