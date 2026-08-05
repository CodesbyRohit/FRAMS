"""Trust service configuration — environment driven, zero hardcoding."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("TRUST_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# DB file holding identity records + face encodings (SQLite, stdlib only).
DB_PATH = DATA_DIR / "trust.db"

# Bearer token shared with the API gateway (set in .env).
SERVICE_TOKEN = os.getenv("TRUST_SERVICE_TOKEN", "anima-trust-local")

# Face matching threshold (0 = strict, 1 = loose). face_recognition default is 0.6.
MATCH_TOLERANCE = float(os.getenv("TRUST_MATCH_TOLERANCE", "0.5"))

# Liveness: eye aspect ratio below this is considered "closed" for blink detection.
EAR_CLOSED_THRESHOLD = float(os.getenv("TRUST_EAR_THRESHOLD", "0.21"))
# Minimum frames in the closed state to register a blink at ~15 fps.
BLINK_MIN_FRAMES = int(os.getenv("TRUST_BLINK_MIN_FRAMES", "2"))

# Weighting for the composite identity confidence score.
SCORE_WEIGHTS = {
    "face": 0.45,
    "liveness": 0.15,
    "device": 0.20,
    "behavioral": 0.20,
}
