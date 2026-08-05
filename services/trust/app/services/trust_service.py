"""Composite identity trust scoring.

Fuses face-match confidence, liveness, device posture and behavioral signals
into a single explainable identity score, plus a risk classification.
"""

from .. import config
from ..models import ScoreRequest, ScoreResponse


def _decay(value: float, age_seconds: float, half_life: float) -> float:
    """Exponential decay so stale verifications lose weight over time."""
    return value * (0.5 ** (age_seconds / half_life))


def risk_level(identity_score: float) -> str:
    if identity_score >= 0.85:
        return "low"
    if identity_score >= 0.6:
        return "medium"
    return "high"


def compute_score(req: ScoreRequest) -> ScoreResponse:
    w = config.SCORE_WEIGHTS

    face_component = req.face_confidence * (1.0 if req.liveness_passed else 0.6)
    face_component = min(face_component, 1.0)

    identity_score = (
        w["face"] * face_component
        + w["liveness"] * (1.0 if req.liveness_passed else 0.0)
        + w["device"] * req.device_score
        + w["behavioral"] * req.behavioral_score
    )

    # A fresh verification carries more weight than an hours-old one.
    identity_score = _decay(identity_score, req.verification_age_seconds, half_life=4 * 3600)
    identity_score = round(min(max(identity_score, 0.0), 1.0), 4)

    breakdown = {
        "face": round(face_component, 4),
        "liveness": 1.0 if req.liveness_passed else 0.0,
        "device": round(req.device_score, 4),
        "behavioral": round(req.behavioral_score, 4),
        "age_penalty_applied": req.verification_age_seconds > 0,
    }
    return ScoreResponse(
        identity_score=identity_score,
        risk=risk_level(identity_score),
        breakdown=breakdown,
    )
