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

IS_PRODUCTION = (os.environ.get("ENV") or "").strip().lower() == "production"
APP_URL = (os.environ.get("APP_URL") or "http://localhost:3000").strip().rstrip("/")  # used in emailed links
BREVO_API_KEY = (os.environ.get("BREVO_API_KEY") or "").strip()
EMAIL_FROM = (os.environ.get("EMAIL_FROM") or "").strip()  # must be a sender verified in Brevo
SENTRY_DSN = (os.environ.get("SENTRY_DSN") or "").strip()

if IS_PRODUCTION:
    if len(JWT_SECRET) < 32:
        logger.error("JWT_SECRET is shorter than 32 characters: anyone who guesses it can log in as any user")
    if "localhost" in (os.environ.get("CORS_ORIGINS") or "localhost"):
        logger.error("CORS_ORIGINS is unset or contains localhost: set it to the production app address")
    if "localhost" in APP_URL:
        logger.error("APP_URL is unset or contains localhost: password reset links will not work")
    if not (BREVO_API_KEY and EMAIL_FROM):
        logger.error("BREVO_API_KEY or EMAIL_FROM is not set: password reset emails cannot be sent")

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
ENABLE_WATERMARKING = os.environ.get("ENABLE_WATERMARKING", "true").strip().lower() in ("true", "1", "yes")

import zoneinfo
APP_TIMEZONE_NAME = os.environ.get("APP_TIMEZONE", "Asia/Kolkata").strip() or "Asia/Kolkata"
try:
    APP_TIMEZONE = zoneinfo.ZoneInfo(APP_TIMEZONE_NAME)
except Exception:
    APP_TIMEZONE = zoneinfo.ZoneInfo("Asia/Kolkata")

