# Batch Features & Fees Management Sub-Feature Documentation

> **Archive Document**  
> **Module:** Batch Management, Fee Tracking Ledger, Student Account Security & Telemetry  
> **Status:** Fully Implemented & Tested  
> **Location:** `docs/archive/BATCH_AND_FEES_FEATURE_DOCUMENTATION.md`  
> **Last Updated:** October 2026  

---

## 1. Executive Summary & Overview

The **Batch Management System** is a core operational hub for educators on the platform. It provides teachers with end-to-end cohort governance, student enrollment tracking, curriculum-aligned academic fee ledgers, cohort security controls, and live student mastery telemetry.

### Key Pillars

1. **Cohort Lifecycle & Enrollment:**
   - Creation and customization of class cohorts with class level, annual fee, monthly fee, and academic schedule.
   - Unique 6-character uppercase hex codes (`secrets.token_hex(3).upper()`) for student self-enrollment.
   - Real-time student count aggregation via MongoDB aggregation pipelines.

2. **Fees Management Sub-Feature:**
   - 12-Month Academic Year installment schedule (April through March).
   - Automatic proportional redistribution for custom fee concessions or scholarships.
   - Full, partial, multi-month, and manual payment recording with comprehensive transaction audit trails.
   - Payment reversal/unmarking capabilities.
   - Real-time cohort financial analytics (total collected, total pending dues, collection rate).

3. **Student Account Security & Governance:**
   - **Disable / Enable Student:** Instant revocation/restoration of login access and active token authentication.
   - **Block / Unblock Student Account:** Complete account lockdown with **automatic batch code regeneration** to permanently invalidate exposed cohort codes.
   - Real-time session invalidation via backend RBAC dependencies and frontend Axios interceptors.

4. **Mastery Telemetry & Cohort Leaderboard:**
   - Integration with submission mastery telemetry to display rank, topic-level performance, and class average weak concepts.
   - One-click drill-down student analysis modal.

---

## 2. Architecture & Data Models

### 2.1 Database Collections

#### 1. `db.batches`
Stores cohort metadata, fee schedules, and current enrollment access codes.

```json
{
  "id": "e4b6d081-3c87-4b71-a8bb-9548a8677054",
  "name": "Class 10 - Advanced Algebra & Geometry",
  "class_level": "10",
  "fee_amount": 60000.0,
  "monthly_fee": 5000.0,
  "fee_schedule": [
    { "month": "April", "amount": 5000.0 },
    { "month": "May", "amount": 5000.0 },
    { "month": "June", "amount": 5000.0 },
    { "month": "July", "amount": 5000.0 },
    { "month": "August", "amount": 5000.0 },
    { "month": "September", "amount": 5000.0 },
    { "month": "October", "amount": 5000.0 },
    { "month": "November", "amount": 5000.0 },
    { "month": "December", "amount": 5000.0 },
    { "month": "January", "amount": 5000.0 },
    { "month": "February", "amount": 5000.0 },
    { "month": "March", "amount": 5000.0 }
  ],
  "code": "A1B2C3",
  "teacher_id": "6707f59d5718a3ef89025110",
  "teacher_name": "Prof. Sharma",
  "created_at": "2026-10-10T12:00:00+00:00",
  "updated_at": "2026-10-10T12:00:00+00:00"
}
```

#### 2. `db.batch_fees`
Stores student-specific financial ledger records, custom schedules, and transaction payment history.

```json
{
  "batch_id": "e4b6d081-3c87-4b71-a8bb-9548a8677054",
  "student_id": "6707f62e5718a3ef89025114",
  "total_fee": 60000.0,
  "paid_fee": 15000.0,
  "due_fee": 45000.0,
  "status": "partial",
  "paid_months": ["April", "May", "June"],
  "last_payment_date": "2026-10-10T14:30:00+00:00",
  "fee_schedule": [ ... ],
  "payments": [
    {
      "id": "7fa1bc82-0129-4112-9c12-32a838571821",
      "amount": 10000.0,
      "date": "2026-10-10T14:00:00+00:00",
      "month": "April, May",
      "notes": "Term 1 installment paid via UPI",
      "recorded_by": "Prof. Sharma",
      "is_partial": false
    },
    {
      "id": "9ca2fd11-1209-4821-ab91-8841a1285093",
      "amount": 5000.0,
      "date": "2026-10-10T14:30:00+00:00",
      "month": "June",
      "notes": "June payment cleared",
      "recorded_by": "Prof. Sharma",
      "is_partial": false
    }
  ],
  "updated_at": "2026-10-10T14:30:00+00:00"
}
```

#### 3. `db.users` (Student Record Fields)
Enrolled students store their associated batch IDs along with account status flags.

```json
{
  "_id": "ObjectId('6707f62e5718a3ef89025114')",
  "name": "Aarav Gupta",
  "email": "aarav.gupta@example.com",
  "role": "student",
  "batch_ids": ["e4b6d081-3c87-4b71-a8bb-9548a8677054"],
  "is_disabled": false,
  "is_blocked": false,
  "created_at": "2026-10-09T10:00:00+00:00",
  "updated_at": "2026-10-10T14:30:00+00:00"
}
```

---

## 3. Core Feature Walkthrough

### 3.1 Batch Creation & Editing
- **Creation Endpoint:** `POST /api/batches`
  - Accepts `name`, `class_level`, `fee_amount`, `monthly_fee`, and optional `fee_schedule`.
  - Automatically provisions a 6-character alphanumeric join code (`code`).
  - Sets default 12-month schedule if not explicitly provided.
- **Modification Endpoint:** `PUT /api/batches/{batch_id}`
  - Allows updating name, class level, total fee amount, monthly fee amount, and customized month-by-month installments.
  - Verifies teacher ownership (`teacher_id == user["id"]` or admin role).

### 3.2 Student Enrollment (`POST /api/batches/join`)
- Students enter the cohort's 6-character code in the student dashboard.
- Endpoint normalizes input (`uppercase().strip()`), validates code existence in `db.batches`, and appends the batch ID to student's `batch_ids` list using `$addToSet` (preventing duplicates).

---

## 4. Fees Management Sub-Feature

### 4.1 Academic Year Monthly Schedule
The Indian academic cycle runs from **April to March** across 12 periods:
`April`, `May`, `June`, `July`, `August`, `September`, `October`, `November`, `December`, `January`, `February`, `March`.

- **Default Schedule Algorithm:**
  ```python
  def get_batch_default_schedule(fee_amount: float = 0.0, monthly_fee: float = 0.0):
      amt = 0.0
      if monthly_fee and monthly_fee > 0:
          amt = float(monthly_fee)
      elif fee_amount and fee_amount > 0:
          amt = round(float(fee_amount) / 12.0, 2)
      return [{"month": m, "amount": amt} for m in DEFAULT_ACADEMIC_MONTHS]
  ```

- **Proportional Redistribution Algorithm:**
  When a student has a customized annual fee (e.g. discount or scholarship):
  ```python
  def get_proportional_schedule(base_schedule, target_total_fee: float):
      target = round(float(target_total_fee or 0.0), 2)
      base_sum = sum(float(item.get("amount", 0.0) or 0.0) for item in base_schedule)
      # Computes proportional amount per month, ensuring total equals target with rounding adjustment on the final month
  ```

### 4.2 Payment Tracking & Status Rollup
Each student card computes a comprehensive month-by-month state:
- **`is_paid: true`:** Full scheduled installment for the month received. (Visual: Vibrant Green dot).
- **`is_partial: true`:** A payment has been recorded, but total paid for that month is less than the scheduled amount. (Visual: Amber dot).
- **`is_paid: false, is_partial: false`:** No payment received for this month. (Visual: Red dot).

### 4.3 Payment Operations (`POST /api/batches/{batch_id}/students/{student_id}/fee`)
Teachers can perform multiple granular financial actions:

| Action | Payload Parameter | Description |
|---|---|---|
| **Mark All Paid** | `mark_as_paid: true` | Clears all remaining dues, marks all 12 months as paid in full, and records payment transaction. |
| **Mark Selected Months** | `months_paid: ["April", "May"]` | Marks specific selected months as fully collected and updates dues. |
| **Record Partial Payment** | `is_partial: true, partial_amount: 2500, month: "April"` | Records a partial payment against a specific month. Marks month partial if below target; marks paid if cumulative matches. |
| **Custom Amount** | `amount: 10000, notes: "Cash received"` | Applies payment to chronological months and reduces balance dues. |
| **Revert / Unmark Payment** | `unmark_month: "April"` | Reverts payments for the specified month, removes from `paid_months`, recalculates dues, and updates status. |
| **Adjust Total Fee** | `total_fee: 50000` | Updates student total fee and recalculates schedule proportionally. |

---

## 5. Student Account Security & Access Governance

### 5.1 Disable / Enable Student
- **Purpose:** Temporarily freeze a student's access without invalidating the batch code or altering cohort credentials.
- **Workflow:**
  1. Teacher clicks **Disable** on the student card.
  2. Request sent to `POST /api/batches/{batch_id}/students/{student_id}/status` with `{ "action": "disable" }`.
  3. `db.users` sets `is_disabled: true`.
  4. Student card updates to display the **Disabled** badge.
  5. Any subsequent login attempt by the student returns `403 Forbidden` (`"Your account has been disabled. Please contact your teacher."`).
  6. If the student was already logged in, any API request evaluated by `get_current_user` rejects the token with `403 Forbidden`.
  7. The frontend Axios interceptor wipes `localStorage.removeItem("vidya_token")` and redirects to `/auth`.
  8. Clicking **Enable** sets `is_disabled: false`, allowing login immediately.

### 5.2 Block / Unblock Account & Automatic Batch Code Regeneration
- **Purpose:** Terminate a student's access and prevent them or their peers from using their known cohort join code to re-enter under a new account.
- **Workflow:**
  1. Teacher clicks **Block Account** on the student card.
  2. A confirmation modal explains that:
     - The student account will be locked.
     - The current cohort code will be **automatically regenerated**.
  3. Teacher confirms -> `POST /api/batches/{batch_id}/students/{student_id}/status` with `{ "action": "block" }`.
  4. Backend generates a new 6-character hex code (`secrets.token_hex(3).upper()`).
  5. Updates `db.batches` for the cohort (and any other cohort of this teacher where the student was enrolled).
  6. Updates `db.users` with `is_blocked: true`.
  7. Returns `{ "new_batch_code": "..." }`.
  8. Frontend updates batch list state and displays a success toast with the new code.
  9. The old batch code is permanently invalidated: joining with the old code returns `404 Invalid batch code`.
  10. Student is prevented from logging in (returns `403 Forbidden: "Your account has been blocked. Please contact your teacher."`).
  11. Unblocking (`action: "unblock"`) sets `is_blocked: false` while keeping the newly regenerated code intact.

---

## 6. API Reference

### 6.1 Cohort Endpoints

#### `POST /api/batches`
- **Role:** Teacher, Admin
- **Body:**
  ```json
  {
    "name": "Grade 10 Batch Alpha",
    "class_level": "10",
    "fee_amount": 60000,
    "monthly_fee": 5000,
    "fee_schedule": [ ... ]
  }
  ```
- **Response:** `200 OK` Batch document including generated `code`.

#### `GET /api/batches`
- **Role:** Authenticated (Teacher, Admin, Student)
- **Response:** `200 OK` List of batches. For teachers, includes `student_count`.

#### `PUT /api/batches/{batch_id}`
- **Role:** Teacher (owner), Admin
- **Body:** `BatchUpdateInput` (partial fields)
- **Response:** `200 OK` Updated batch document.

#### `POST /api/batches/join`
- **Role:** Student
- **Body:** `{ "code": "A1B2C3" }`
- **Response:** `200 OK` Enrolled batch document or `404` if code is invalid.

### 6.2 Fees & Roster Endpoints

#### `GET /api/batches/{batch_id}/students`
- **Role:** Teacher (owner), Admin
- **Response:** `200 OK`
  ```json
  {
    "batch_id": "...",
    "batch_name": "...",
    "class_level": "10",
    "fee_amount": 60000,
    "monthly_fee": 5000,
    "fee_schedule": [ ... ],
    "students": [
      {
        "id": "...",
        "name": "Student Name",
        "email": "student@example.com",
        "is_disabled": false,
        "is_blocked": false,
        "total_fee": 60000,
        "paid_fee": 10000,
        "due_fee": 50000,
        "status": "partial",
        "monthly_status": [ ... ],
        "collected_months": [ ... ],
        "partial_months": [ ... ],
        "due_months": [ ... ],
        "paid_months": ["April", "May"]
      }
    ],
    "summary": {
      "total_students": 15,
      "total_collected": 150000,
      "total_dues": 750000,
      "paid_count": 2,
      "partial_count": 5,
      "due_count": 8,
      "disabled_count": 1,
      "blocked_count": 0
    }
  }
  ```

#### `POST /api/batches/{batch_id}/students/{student_id}/fee`
- **Role:** Teacher (owner), Admin
- **Body:** `RecordPaymentInput`
  - `amount`, `total_fee`, `paid_fee`, `due_fee`, `mark_as_paid`, `notes`, `month`, `months_paid`, `unmark_month`, `payment_date`, `fee_schedule`, `is_partial`, `partial_amount`.
- **Response:** `200 OK` Updated student fee summary.

### 6.3 Student Status Governance Endpoint

#### `POST /api/batches/{batch_id}/students/{student_id}/status`
- **Role:** Teacher (owner), Admin
- **Body:**
  ```json
  {
    "action": "disable" // or "enable" | "block" | "unblock"
  }
  ```
  *(Or explicit boolean flags: `is_disabled`, `is_blocked`)*
- **Response:** `200 OK`
  ```json
  {
    "success": true,
    "student_id": "...",
    "student_name": "...",
    "is_disabled": false,
    "is_blocked": true,
    "batch_id": "...",
    "new_batch_code": "C7D8E9",
    "updated_batches": [
      { "batch_id": "...", "new_code": "C7D8E9" }
    ],
    "message": "Student status updated successfully."
  }
  ```

---

## 7. Frontend User Interface Implementation (`Batches.js`)

The Batches UI provides an educator command console with:

1. **Cohort Metric Cards:**
   - **Active Enrolled Students** badge count.
   - **Total Fees Collected (₹)** formatted in Indian Rupee locale.
   - **Pending Dues (₹)** with colored count of fully paid, partial, and overdue students.
   - **Join Code Quick-Copy Card** featuring single-click copy with clipboard toast.

2. **Roster Tab ("Students & Fees"):**
   - Instant search input matching student name or email.
   - Student Fee Card:
     - Avatar with initials and name.
     - **Status Badges:** `Active` (Emerald), `Disabled` (Amber), `Account Blocked` (Rose).
     - Financial indicators: Total Fee, Paid So Far, Balance Dues.
     - Interactive **12-Month Schedule** with color-coded dot badges (Green = Collected, Amber = Partial, Red = Due).
     - **Action Toolbar:**
       - "Mark Selected Paid" & "Partial Paid" (when month pills are selected).
       - "Mark All Paid" (one-click full clearance).
       - "Manage Fees" (launches schedule & fee editor).
       - "Disable" / "Enable" (instant toggle).
       - "Block" / "Unblock" (launches confirmation dialog).

3. **Leaderboard & Telemetry Tab:**
   - Class average mastery percentages across all topics.
   - Ranked student cards (#1 Gold Trophy, #2 Silver, #3 Bronze).
   - Topic strength counts (strong topics, weak topics).
   - Blocked/Disabled status indicators.
   - Detailed per-student mastery analysis modal.

---

## 8. Test Cases & Verification Suite

### 8.1 Dedicated Security & Status Test Suite (`backend/tests/test_student_disable_block.py`)

| Test Name | Verification Focus | Status |
|---|---|---|
| `test_student1_login_initially_succeeds` | Active registered student successfully logs in and returns `is_disabled=False`, `is_blocked=False`. | Passed |
| `test_teacher_can_disable_student` | Teacher disables student via status API. Student roster reflects `is_disabled=True`. | Passed |
| `test_disabled_student_cannot_login` | Login attempt by disabled student returns `403 Forbidden` with `"disabled"` message. | Passed |
| `test_disabled_student_existing_token_rejected` | Existing token used on protected route `/auth/me` is rejected with `403 Forbidden`. | Passed |
| `test_teacher_can_enable_student` | Teacher enables student. Student can successfully log in and access protected endpoints. | Passed |
| `test_teacher_blocks_student_regenerates_batch_code` | Teacher blocks student. Verifies `is_blocked=True` and batch code is automatically changed to a new unique code. | Passed |
| `test_blocked_student_cannot_login` | Login attempt by blocked student returns `403 Forbidden` with `"blocked"` message. | Passed |
| `test_old_batch_code_no_longer_works_for_joining` | Attempt by a new student to join using the old invalidated code returns `404 Not Found`. | Passed |
| `test_new_regenerated_batch_code_works_for_joining` | Attempt to join using the newly regenerated code succeeds with `200 OK`. | Passed |
| `test_teacher_can_unblock_student` | Teacher unblocks student. Student is once again allowed to log in. | Passed |
| `test_unauthorized_user_cannot_update_status` | Enforces that students and non-owner teachers receive `403 Forbidden` when attempting status changes. | Passed |

### 8.2 Notes Batch Authorization Test Suite (`backend/tests/test_notes_batch_auth.py`)

| Test Name | Verification Focus | Status |
|---|---|---|
| `test_01_teacher_creates_two_batches` | Verifies creation of separate cohorts with unique join codes. | Passed |
| `test_02_students_join_batches` | Verifies student enrollment isolation across cohorts. | Passed |
| `test_03_teacher_creates_batch_specific_notes` | Verifies notes assigned to specific batch IDs. | Passed |
| `test_04_enrolled_student_can_read_note` | Verifies enrolled students can view their cohort's notes. | Passed |
| `test_05_outsider_student_forbidden` | Non-enrolled students are rejected with `403 Forbidden`. | Passed |
| `test_06_cross_batch_isolation` | Students in Batch A cannot read Batch B materials. | Passed |
| `test_07_general_note_accessible_to_all` | Unassigned notes are accessible to all registered students. | Passed |
| `test_08_teacher_owns_and_reads_all_notes` | Teachers maintain full oversight of all their batch notes. | Passed |
| `test_09_student_cannot_create_or_delete_notes` | Strict RBAC prevents student modification of cohort notes. | Passed |

### 8.3 Core Backend Flow Test Suite (`backend/tests/backend_test.py`)

| Test Name | Verification Focus | Status |
|---|---|---|
| `test_04_create_batch` | Tests batch creation endpoint and attributes. | Passed |
| `test_06_student_joins_batch` | Tests joining batch via join code. | Passed |
| `test_07_batch_lists_for_both` | Verifies cohort visibility for both teachers and enrolled students. | Passed |

---

## 9. Summary & Operational Status

The Batch feature and its Fees sub-feature provide a cohesive solution with:
- Zero data loss or corruption on schedule changes due to proportional distribution.
- Complete cohort code security with automatic rotation on student block.
- Instant, multi-layered session termination for disabled/blocked students.
- Tested and verified under pytest with zero regressions across core modules.
