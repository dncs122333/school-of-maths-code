# Cloudflare R2 (S3-Compatible) Storage Migration Plan

**Date Created:** October 13, 2026  
**Target Resumption Date:** October 17, 2026  
**Scope:** Migrate notes/materials file storage from local filesystem (`backend/local_storage`) to Cloudflare R2 object storage.

---

## 1. Architectural Decisions Summary

| Dimension | Decision | Rationale |
| :--- | :--- | :--- |
| **Object Storage Engine** | Cloudflare R2 via `boto3` (S3-compatible API, region `auto`) | Zero egress fees, high performance, standard S3 compatibility. |
| **Delivery Mechanism** | **Presigned GET URLs** with HTTP 302 Redirect on `/api/resources/{id}/file` | Preserves existing batch and role authorization checks with **zero frontend code modifications**. Client follows redirect directly to R2. |
| **Presigned URL Expiry** | **24 hours (86,400 seconds)** | Extended viewing window for students reading multipage PDFs and revision materials offline. |
| **Upload Pipeline** | Backend multipart upload via `POST /api/resources` | Keeps file type/size validation and quota enforcement on the server; requires no frontend changes. |
| **Fallback & Continuity** | **Graceful Fallback** | Backend attempts to fetch from R2; if not found or if R2 is unconfigured, it seamlessly falls back to `backend/local_storage`. |
| **Existing Data** | One-off CLI migration script (`backend/scripts/migrate_to_r2.py`) | Bulk uploads existing files from `local_storage/vidya/resources/` to R2 while retaining existing storage paths. |

---

## 2. Environment Configuration

Add the following environment variables to `backend/.env`:

```env
# Cloudflare R2 (S3-Compatible Object Storage)
R2_ACCOUNT_ID="your_cloudflare_account_id"
R2_ACCESS_KEY_ID="your_r2_access_key_id"
R2_SECRET_ACCESS_KEY="your_r2_secret_access_key"
R2_BUCKET_NAME="your_r2_bucket_name"
```

### Cloudflare Setup Instructions
1. In Cloudflare Dashboard, navigate to **R2**.
2. Click **Create Bucket** (e.g. `school-of-maths-materials`).
3. Under **Manage R2 API Tokens**, click **Create API Token**:
   - Permission: **Object Read & Write**
   - TTL: Permanent or as required
4. Copy the **Access Key ID**, **Secret Access Key**, and **Account ID**.
5. In Bucket Settings, configure **CORS Policy** to allow `GET` and `HEAD` from `http://localhost:3000` (and production domain):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

---

## 3. Step-by-Step Implementation Roadmap (For Oct 17)

### Phase 1: Python Dependencies & Configuration
- [ ] Add `boto3>=1.34.0` to `backend/requirements.txt`.
- [ ] Install in `.venv`: `.venv/bin/pip install boto3`.
- [ ] In `backend/config.py`, add configuration loader for `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

### Phase 2: Storage Service Implementation (`backend/storage.py` or `backend/ai.py`)
- [ ] Initialize `boto3` S3 client targeting `endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"`.
- [ ] Implement `put_object(path: str, data: bytes, content_type: str)`:
  - If R2 is configured: uploads object to R2 bucket.
  - If R2 is not configured: writes to `backend/local_storage`.
- [ ] Implement `get_presigned_url(path: str, filename: str, expires_in: int = 86400) -> Optional[str]`:
  - Generates presigned URL with `ResponseContentDisposition=inline; filename="..."`.
- [ ] Implement `get_object(path: str) -> tuple[bytes, str]`:
  - Fetches from R2 if present; falls back to `backend/local_storage` if missing.
- [ ] Implement `delete_object(path: str) -> None`:
  - Deletes from R2 and removes local copy if present.

### Phase 3: Route Integration (`backend/server.py`)
- [ ] In `GET /api/resources/{res_id}/file`:
  - Check role and batch access permissions.
  - If watermarking is disabled and R2 is active: generate presigned URL and return `RedirectResponse(url=presigned_url, status_code=302)`.
  - If watermarking is enabled: download bytes, apply watermark, and stream response.
  - If R2 is unconfigured or file is only local: stream from local storage as fallback.

### Phase 4: Migration CLI Script
- [ ] Create `backend/scripts/migrate_to_r2.py`:
  - Reads `backend/local_storage/vidya/resources/`.
  - Iterates through all PDFs and images.
  - Uses `boto3` to upload missing files to the R2 bucket.
  - Logs upload status and summary report.

### Phase 5: Verification & Testing
- [ ] Test uploading a PDF note via teacher portal.
- [ ] Verify PDF is stored in Cloudflare R2 bucket.
- [ ] Test student download/view: confirm 302 redirect to presigned URL and file renders in viewer.
- [ ] Run automated pytest test suite (`test_resources.py` and regression tests).
