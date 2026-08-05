"""Liveness detection — blink challenge via Eye Aspect Ratio (EAR).

Anti-spoofing rationale: a printed photo or a phone-screen replay cannot produce
a natural blink pattern. We challenge the user to present a short video burst,
track their eye-openness over time, and require at least one genuine blink.
"""

import base64
import io
import logging
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image

from .. import config
from . import face_service

logger = logging.getLogger(__name__)

# Indices of the 68-point landmark model for each eye.
LEFT_EYE = [36, 37, 38, 39, 40, 41]
RIGHT_EYE = [42, 43, 44, 45, 46, 47]


def eye_aspect_ratio(eye_pts: List[Tuple[int, int]]) -> float:
    """EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|). ~0.30 open, <0.20 closed."""
    a = np.linalg.norm(np.array(eye_pts[1]) - np.array(eye_pts[5]))
    b = np.linalg.norm(np.array(eye_pts[2]) - np.array(eye_pts[4]))
    c = np.linalg.norm(np.array(eye_pts[0]) - np.array(eye_pts[3]))
    if c == 0:
        return 0.0
    return float((a + b) / (2.0 * c))


def _ear_for_frame(image_bytes: bytes) -> Optional[float]:
    """Compute average EAR across faces in one decoded frame. None if no face."""
    landmarks = face_service.extract_landmarks(image_bytes)
    if not landmarks:
        return None
    ratios = []
    for lm in landmarks:
        left = lm.get("left_eye", [])
        right = lm.get("right_eye", [])
        if len(left) == 6 and len(right) == 6:
            ratios.append((eye_aspect_ratio(left) + eye_aspect_ratio(right)) / 2.0)
    if not ratios:
        return None
    return float(np.mean(ratios))


def _decode_base64_frame(data: str) -> bytes:
    try:
        raw = base64.b64decode(data)
    except Exception as exc:
        raise ValueError("Frame is not valid base64.") from exc
    # Normalize through PIL to reject non-image payloads early.
    try:
        Image.open(io.BytesIO(raw)).load()
    except Exception as exc:
        raise ValueError("Frame does not decode to a valid image.") from exc
    return raw


def analyze_blink_sequence(frames: List[Tuple[bytes, int]]) -> dict:
    """Run blink analysis over an ordered frame sequence.

    Returns a dict with: passed, blinks, ear_series, notes.
    """
    ear_series: List[float] = []
    for frame_bytes, _ts in frames:
        ear = _ear_for_frame(frame_bytes)
        if ear is None:
            continue
        ear_series.append(round(ear, 4))

    blinks = 0
    closed_streak = 0
    for ear in ear_series:
        if ear < config.EAR_CLOSED_THRESHOLD:
            closed_streak += 1
            if closed_streak == config.BLINK_MIN_FRAMES:
                blinks += 1
        else:
            closed_streak = 0

    passed = blinks >= 1 and len(ear_series) >= 4
    notes = []
    if len(ear_series) < 4:
        notes.append("Insufficient frames with a detectable face.")
    if blinks == 0:
        notes.append("No blink detected — possible static photo or replay.")
    return {
        "passed": passed,
        "blinks": blinks,
        "ear_series": ear_series,
        "notes": notes,
    }


def run_liveness_challenge(base64_frames: List[str]) -> Tuple[bool, dict]:
    """Public entry: list of base64 frames -> (passed, detail)."""
    frames = []
    for i, frame in enumerate(base64_frames):
        try:
            frames.append((_decode_base64_frame(frame), i))
        except ValueError as exc:
            raise ValueError(f"Frame {i}: {exc}") from exc
    if len(frames) < 8:
        raise ValueError("Provide at least 8 frames for a reliable blink challenge.")
    return analyze_blink_sequence(frames)
