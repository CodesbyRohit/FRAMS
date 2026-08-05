"""Face registration and verification engine.

ANIMA treats face recognition strictly as an identity-verification primitive:
  - register: capture 128-d embeddings for a subject
  - verify:   compare a probe face against a subject (or the whole registry)

No attendance, no tracking, no surveillance semantics anywhere in this service.
The caller (the platform API) decides what a verification is *for*.
"""

import io
import logging
import os
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image

from .. import config

logger = logging.getLogger(__name__)

# face_recognition is imported lazily so the service can boot (and report a
# healthy /health) even before the native dependency is installed.
_fr = None


def _face_recognition():
    global _fr
    if _fr is None:
        import face_recognition  # type: ignore

        _fr = face_recognition
    return _fr


def is_available() -> bool:
    try:
        _face_recognition()
        return True
    except Exception:  # pragma: no cover - depends on the host environment
        return False


def _decode_image(image_bytes: bytes) -> "np.ndarray":
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("RGB")
        return np.array(img)
    except Exception as exc:
        raise ValueError(f"Unreadable image: {exc}") from exc


def register_faces(subject_id: str, image_bytes: bytes) -> List[List[float]]:
    """Detect all faces in the image and return their encodings.

    Raises ValueError with a human-readable reason when 0 faces are found.
    """
    fr = _face_recognition()
    rgb = _decode_image(image_bytes)
    boxes = fr.face_locations(rgb, model="hog")
    if not boxes:
        raise ValueError("No face detected in the image. Use a clear frontal photo with good lighting.")

    encodings = fr.face_encodings(rgb, known_face_locations=boxes)
    if not encodings:
        raise ValueError("Faces found but encodings could not be computed.")

    encoded = [enc.astype(float).tolist() for enc in encodings]
    logger.info("Registered %d face(s) for subject=%s", len(encoded), subject_id)
    return encoded


def verify_against_subject(
    subject_id: str, image_bytes: bytes, tolerance: Optional[float] = None
) -> Tuple[bool, float, str]:
    """Verify a probe face against one specific subject. Returns (ok, confidence, reason)."""
    fr = _face_recognition()
    rgb = _decode_image(image_bytes)
    boxes = fr.face_locations(rgb, model="hog")
    if not boxes:
        return False, 0.0, "No face detected in the probe image."
    if len(boxes) > 1:
        return False, 0.0, "Multiple faces detected. Present exactly one face."

    probe = fr.face_encodings(rgb, known_face_locations=boxes)[0]
    row = _identity_encodings(subject_id)
    if not row:
        return False, 0.0, f"No registered identity for subject '{subject_id}'."

    distances = fr.face_distance(np.array(row), np.array([probe]))
    best = float(np.min(distances))
    tol = tolerance if tolerance is not None else config.MATCH_TOLERANCE
    if best <= tol:
        confidence = round(max(0.0, min(1.0, 1.0 - best)), 4)
        return True, confidence, f"Match found with face distance {best:.3f} (tolerance {tol})."
    return False, round(max(0.0, min(1.0, 1.0 - best)), 4), (
        f"Closest match distance {best:.3f} exceeds tolerance {tol}."
    )


def verify_globally(image_bytes: bytes, tolerance: Optional[float] = None) -> Tuple[bool, Optional[str], float, str]:
    """Verify a probe face against every registered subject. Returns (ok, subject_id, confidence, reason)."""
    fr = _face_recognition()
    rgb = _decode_image(image_bytes)
    boxes = fr.face_locations(rgb, model="hog")
    if not boxes:
        return False, None, 0.0, "No face detected in the probe image."
    if len(boxes) > 1:
        return False, None, 0.0, "Multiple faces detected. Present exactly one face."

    probe = fr.face_encodings(rgb, known_face_locations=boxes)[0]
    tol = tolerance if tolerance is not None else config.MATCH_TOLERANCE

    best_id: Optional[str] = None
    best_dist = 1.0
    for subject_id, encodings in _encoding_registry().items():
        distances = fr.face_distance(np.array(encodings), np.array([probe]))
        d = float(np.min(distances))
        if d < best_dist:
            best_dist = d
            best_id = subject_id

    confidence = round(max(0.0, min(1.0, 1.0 - best_dist)), 4)
    if best_id is not None and best_dist <= tol:
        return True, best_id, confidence, f"Global match on '{best_id}' (distance {best_dist:.3f})."
    return False, None, confidence, (
        f"No identity within tolerance (closest distance {best_dist:.3f})."
    )


def extract_landmarks(image_bytes: bytes) -> List[dict]:
    """Return 68-point facial landmarks per detected face (for liveness analysis)."""
    fr = _face_recognition()
    rgb = _decode_image(image_bytes)
    boxes = fr.face_locations(rgb, model="hog")
    landmarks = fr.face_landmarks(rgb, face_locations=boxes)
    # face_recognition landmark keys: 'chin', 'left_eye', 'right_eye', 'left_eyebrow', ...
    return [{k: [tuple(p) for p in pts] for k, pts in lm.items()} for lm in landmarks]


# ── internal helpers (kept module-level so tests can stub them) ─────────────

def _identity_encodings(subject_id: str) -> List[List[float]]:
    from .. import storage

    row = storage.get_identity(subject_id)
    if not row:
        return []
    return _parse_encodings(row)


def _encoding_registry():
    from .. import storage

    return storage.load_encoding_registry()


def _parse_encodings(row: dict) -> List[List[float]]:
    import json

    try:
        return json.loads(row["encodings"])
    except (json.JSONDecodeError, TypeError):
        return []
