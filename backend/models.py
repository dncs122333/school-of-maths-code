"""Pydantic request models."""
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field

class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "student"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class BatchInput(BaseModel):
    name: str
    class_level: str
    fee_amount: Optional[float] = None
    monthly_fee: Optional[float] = None
    fee_schedule: Optional[List[dict]] = None
    academic_year: Optional[str] = None
    # Joining controls; API default is open joining so existing integrations keep working (UI defaults approval on)
    join_requires_approval: Optional[bool] = False
    joining_closed: Optional[bool] = False
    max_students: Optional[int] = None


class BatchUpdateInput(BaseModel):
    name: Optional[str] = None
    class_level: Optional[str] = None
    fee_amount: Optional[float] = None
    monthly_fee: Optional[float] = None
    fee_schedule: Optional[List[dict]] = None
    academic_year: Optional[str] = None
    join_requires_approval: Optional[bool] = None
    joining_closed: Optional[bool] = None
    max_students: Optional[int] = None  # 0 clears the limit


class JoinInput(BaseModel):
    code: str


class StudentStatusInput(BaseModel):
    action: Optional[str] = None  # "disable", "enable", "block", "unblock"
    is_disabled: Optional[bool] = None
    is_blocked: Optional[bool] = None


class GenerateTestInput(BaseModel):
    title: str
    kind: str = "test"
    class_level: str
    subject: str
    chapter: Optional[str] = ""
    chapters: Optional[List[str]] = None
    topic: Optional[str] = ""
    batch_id: Optional[str] = None
    question_count: int = 10
    duration_minutes: int = 20
    valid_hours: int = 24
    activate_now: bool = True
    is_active: Optional[bool] = None
    is_draft: Optional[bool] = None
    question_ids: Optional[List[str]] = None
    # Class tests: scheduled start (ISO, default now) and how long they stay open (default duration + 30 min)
    start_at: Optional[str] = None
    window_minutes: Optional[int] = None


class SubmitInput(BaseModel):
    answers: List[int]
    times: Optional[List[float]] = None
    tab_switches: Optional[int] = 0


class DataSourceStatusResponse(BaseModel):
    source: str = "MongoDB Atlas"
    available: bool
    message: str
    checked_at: Optional[str] = None


class QuestionInput(BaseModel):
    question: str
    options: List[str]
    correct_answer: Optional[object] = None
    correct_index: Optional[int] = None
    explanation: Optional[str] = ""
    class_level: Optional[str] = None
    subject: Optional[str] = None
    chapter: Optional[str] = None
    topics: Optional[List[str]] = Field(default_factory=list)
    topic: Optional[str] = ""
    difficulty: Optional[str] = "medium"
    question_type: Optional[str] = "single_choice"
    marks: Optional[float] = 1.0
    negative_marks: Optional[float] = 0.0
    hint: Optional[str] = ""
    image_url: Optional[str] = None  # https link to a diagram/figure shown with the question
    tags: Optional[List[str]] = Field(default_factory=list)
    status: Optional[str] = "active"
    source_id: Optional[str] = None


class QuestionBatchImportInput(BaseModel):
    class_level: Optional[str] = None
    subject: Optional[str] = None
    chapter: Optional[str] = None
    topics: Optional[List[str]] = Field(default_factory=list)
    topic: Optional[str] = ""
    status: Optional[str] = "active"
    questions: List[QuestionInput]


