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


class BatchUpdateInput(BaseModel):
    name: Optional[str] = None
    class_level: Optional[str] = None
    fee_amount: Optional[float] = None
    monthly_fee: Optional[float] = None
    fee_schedule: Optional[List[dict]] = None
    academic_year: Optional[str] = None


class JoinInput(BaseModel):
    code: str


class StudentStatusInput(BaseModel):
    action: Optional[str] = None  # "disable", "enable", "block", "unblock"
    is_disabled: Optional[bool] = None
    is_blocked: Optional[bool] = None


class NoteSection(BaseModel):
    heading: str
    content: str  # plain text or markdown — teacher writes it directly


class CreateNoteInput(BaseModel):
    title: str
    class_level: str
    subject: str
    chapter: str
    topic: Optional[str] = ""
    batch_id: Optional[str] = None
    intro: Optional[str] = ""
    sections: Optional[List[NoteSection]] = []
    quick_revision: Optional[List[str]] = []
    key_terms: Optional[List[str]] = []
    raw_text: Optional[str] = ""


# Alias for backward compatibility and future AI generation version
GenerateNoteInput = CreateNoteInput


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


class SubmitInput(BaseModel):
    answers: List[int]
    times: Optional[List[float]] = None
    tab_switches: Optional[int] = 0


class LearningQueueRecord(BaseModel):
    id: str
    title: str
    status: str = "ready"
    owner_name: str = "Unknown"
    owner_id: Optional[str] = None
    batch_name: Optional[str] = None
    batch_id: Optional[str] = None
    class_level: Optional[str] = None
    subject: Optional[str] = None
    chapter: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DataSourceStatusResponse(BaseModel):
    source: str = "MongoDB Atlas"
    available: bool
    message: str
    checked_at: Optional[str] = None
    learning_queue: List[LearningQueueRecord] = Field(default_factory=list)


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


