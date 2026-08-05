"""Pydantic contracts for the Trust Service API."""

from typing import List, Optional

from pydantic import BaseModel, Field


class IdentityCreate(BaseModel):
    subject_id: str = Field(..., description="External identifier (API personId).")
    display_name: str = Field(..., description="Human-readable name for the identity.")
    metadata: dict = Field(default_factory=dict)


class IdentityRecord(BaseModel):
    subject_id: str
    display_name: str
    face_count: int
    created_at: str
    updated_at: str


class VerifyRequest(BaseModel):
    subject_id: Optional[str] = Field(
        None, description="Scope verification to one identity. Omit to match against all."
    )
    # Optional contextual signals fused into the composite score.
    device_score: float = Field(0.5, ge=0.0, le=1.0)
    behavioral_score: float = Field(0.5, ge=0.0, le=1.0)
    last_verified_seconds_ago: float = Field(0.0, ge=0.0)


class LivenessFrame(BaseModel):
    """One frame of a blink challenge: base64 JPEG/PNG + optional timestamp."""

    image_base64: str
    timestamp_ms: int = 0


class LivenessRequest(BaseModel):
    subject_id: str
    frames: List[LivenessFrame] = Field(min_length=8, max_length=60)
    device_score: float = Field(0.5, ge=0.0, le=1.0)
    behavioral_score: float = Field(0.5, ge=0.0, le=1.0)


class VerificationResult(BaseModel):
    verified: bool
    method: str = "face"
    subject_id: Optional[str]
    confidence: float = Field(..., ge=0.0, le=1.0)
    reason: str
    liveness: Optional[bool] = None
    risk: str = "unknown"  # low | medium | high


class ScoreRequest(BaseModel):
    face_confidence: float = Field(0.5, ge=0.0, le=1.0)
    liveness_passed: bool = False
    device_score: float = Field(0.5, ge=0.0, le=1.0)
    behavioral_score: float = Field(0.5, ge=0.0, le=1.0)
    verification_age_seconds: float = Field(0.0, ge=0.0)


class ScoreResponse(BaseModel):
    identity_score: float
    risk: str
    breakdown: dict
