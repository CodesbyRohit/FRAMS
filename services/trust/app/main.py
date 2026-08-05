"""ANIMA Trust Service — the identity-verification layer.

This microservice is deliberately *domain-free*: it knows faces, subjects and
confidence scores — nothing about attendance, HR or scheduling. Any product
(education, enterprise, healthcare, finance, personal AI) can consume it over
REST. The platform API treats it as the trust gateway and nothing more.

Run:  uvicorn app.main:app --reload --port 8090
"""

import base64
import logging
import os
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import config, models, storage
from .services import face_service, liveness_service, trust_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("anima.trust")

app = FastAPI(
    title="ANIMA Trust Service",
    version="0.1.0",
    description="Identity verification, liveness and trust scoring. Face = gateway, never tracking.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("TRUST_CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer = HTTPBearer(auto_error=False)


def require_token(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> None:
    if not creds or creds.credentials != config.SERVICE_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid trust token.")


@app.on_event("startup")
def startup() -> None:
    storage.init_db()


@app.get("/health", tags=["ops"])
def health() -> dict:
    return {
        "service": "anima-trust",
        "status": "ok" if face_service.is_available() else "degraded",
        "face_engine": "face_recognition",
        "identities": len(storage.list_identities()),
        "version": "0.1.0",
    }


@app.post(
    "/identities",
    status_code=status.HTTP_201_CREATED,
    response_model=models.IdentityRecord,
    tags=["identities"],
)
async def create_identity(
    subject_id: str = Form(...),
    display_name: str = Form(...),
    image: UploadFile = File(..., description="Frontal face photo (JPEG/PNG/WebP)"),
    token: None = Depends(require_token),
):
    """Register a subject's face as a trusted identity. This is onboarding — not check-in."""
    if not face_service.is_available():
        raise HTTPException(503, "Face engine unavailable — install face_recognition and dlib.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(400, "Empty image upload.")

    try:
        encodings = face_service.register_faces(subject_id, image_bytes)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    storage.upsert_identity(subject_id, display_name, {"source": "api"}, encodings)
    return _to_record(subject_id)


@app.post("/verify", response_model=models.VerificationResult, tags=["verification"])
async def verify(
    subject_id: str = Form(None, description="Scope to one identity. Omit for global match."),
    image: UploadFile = File(...),
    device_score: float = Form(0.5),
    behavioral_score: float = Form(0.5),
    token: None = Depends(require_token),
):
    """Verify a face against a registered identity (passwordless authentication)."""
    if not face_service.is_available():
        raise HTTPException(503, "Face engine unavailable — install face_recognition and dlib.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(400, "Empty image upload.")

    try:
        if subject_id:
            ok, confidence, reason = face_service.verify_against_subject(subject_id, image_bytes)
            matched_id = subject_id
        else:
            ok, matched_id, confidence, reason = face_service.verify_globally(image_bytes)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    result = models.VerificationResult(
        verified=ok,
        subject_id=matched_id,
        confidence=confidence,
        reason=reason,
        risk="low",
    )
    if ok and matched_id:
        # Fuse context into an identity score for continuous-auth decisions.
        scored = trust_service.compute_score(
            models.ScoreRequest(
                face_confidence=confidence,
                liveness_passed=False,
                device_score=device_score,
                behavioral_score=behavioral_score,
            )
        )
        result.risk = scored.risk
    return result


@app.post("/verify/liveness", response_model=models.VerificationResult, tags=["verification"])
async def verify_with_liveness(req: models.LivenessRequest, token: None = Depends(require_token)):
    """Multi-frame blink-challenge verification. The anti-spoofing gate."""
    if not face_service.is_available():
        raise HTTPException(503, "Face engine unavailable — install face_recognition and dlib.")

    passed, detail = liveness_service.run_liveness_challenge([f.image_base64 for f in req.frames])
    probe_frame = req.frames[len(req.frames) // 2].image_base64
    try:
        ok, confidence, reason = face_service.verify_against_subject(
            req.subject_id, base64.b64decode(probe_frame)
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    scored = trust_service.compute_score(
        models.ScoreRequest(
            face_confidence=confidence,
            liveness_passed=passed,
            device_score=req.device_score,
            behavioral_score=req.behavioral_score,
        )
    )
    verified = ok and passed and scored.identity_score >= 0.5
    return models.VerificationResult(
        verified=verified,
        method="face+liveness",
        subject_id=req.subject_id if verified else None,
        confidence=confidence,
        reason=(
            f"{reason} Liveness: {'passed' if passed else 'failed'} "
            f"({detail['blinks']} blink(s) detected). Identity score {scored.identity_score}."
        ),
        liveness=passed,
        risk=scored.risk,
    )


@app.post("/score", response_model=models.ScoreResponse, tags=["verification"])
def score(req: models.ScoreRequest, token: None = Depends(require_token)):
    """Composite identity confidence from any combination of signals."""
    return trust_service.compute_score(req)


@app.get("/identities", response_model=list[models.IdentityRecord], tags=["identities"])
def list_identities(token: None = Depends(require_token)) -> list[models.IdentityRecord]:
    return [_to_record(r["subject_id"]) for r in storage.list_identities()]


@app.delete("/identities/{subject_id}", tags=["identities"])
def remove_identity(subject_id: str, token: None = Depends(require_token)) -> dict:
    """Permanent erasure — GDPR / right-to-be-forgotten."""
    if not storage.delete_identity(subject_id):
        raise HTTPException(404, f"No identity for subject '{subject_id}'.")
    logger.info("Deleted identity %s (right to be forgotten)", subject_id)
    return {"deleted": True, "subject_id": subject_id}


def _to_record(subject_id: str) -> models.IdentityRecord:
    import json

    row = storage.get_identity(subject_id)
    if not row:
        raise HTTPException(404, f"No identity for subject '{subject_id}'.")
    return models.IdentityRecord(
        subject_id=row["subject_id"],
        display_name=row["display_name"],
        face_count=len(json.loads(row["encodings"])),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
