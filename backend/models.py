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

