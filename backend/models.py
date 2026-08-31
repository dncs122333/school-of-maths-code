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
    academic_year: Optional[str] = "2025-26"
    subjects: Optional[List[str]] = []


class JoinInput(BaseModel):
    code: str


class GenerateNoteInput(BaseModel):
    title: str
    class_level: str
    subject: str
    chapter: str
    topic: Optional[str] = ""
    raw_text: str


class GenerateTestInput(BaseModel):
    title: str
    kind: str = "test"
    class_level: str
    subject: str
    chapter: str
    topic: Optional[str] = ""
    batch_id: Optional[str] = None
    question_count: int = 10
    duration_minutes: int = 20
    valid_hours: int = 24
    activate_now: bool = True


class SubmitInput(BaseModel):
    answers: List[int]
    times: Optional[List[float]] = None
    tab_switches: Optional[int] = 0



class StartTestInput(BaseModel):
    device_id: str
    device_fingerprint: Optional[str] = None

class AutoSaveInput(BaseModel):
    answers: List[dict]
    last_activity_at: Optional[str] = None

class SyncLocalInput(BaseModel):
    local_queue: List[dict]


class AddStudentInput(BaseModel):
    name: str
    phone: str
    parent_name: Optional[str] = None
    parent_email: Optional[EmailStr] = None
    parent_phone: Optional[str] = None


class PinNoteInput(BaseModel):
    batch_id: str
    is_pinned: bool
