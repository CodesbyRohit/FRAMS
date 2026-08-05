"""Pure-logic unit tests for the Trust Service (no face engine required).

The app modules use relative imports, so they must be imported as package
modules (`app.<module>`) with the trust service root on sys.path.
"""

import sys
import unittest
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parent.parent)  # trust/ (contains the app package)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app.models import ScoreRequest  # noqa: E402
from app.services.liveness_service import eye_aspect_ratio  # noqa: E402
from app.services.trust_service import compute_score  # noqa: E402


class TestEyeAspectRatio(unittest.TestCase):
    def test_open_eye_ratio_is_high(self):
        # A wide-open eye: vertical distances large relative to width.
        pts = [(0, 0), (1, -2), (2, -2), (3, 0), (2, 2), (1, 2)]
        self.assertGreater(eye_aspect_ratio(pts), 0.25)

    def test_closed_eye_ratio_is_low(self):
        # A nearly closed eye: vertical distances collapse.
        pts = [(0, 0), (1, -0.2), (2, -0.2), (3, 0), (2, 0.2), (1, 0.2)]
        self.assertLess(eye_aspect_ratio(pts), 0.15)

    def test_degenerate_geometry_does_not_crash(self):
        self.assertEqual(eye_aspect_ratio([(0, 0)] * 6), 0.0)


class TestCompositeScore(unittest.TestCase):
    def test_strong_signals_yield_low_risk(self):
        res = compute_score(
            ScoreRequest(
                face_confidence=0.95,
                liveness_passed=True,
                device_score=0.9,
                behavioral_score=0.85,
            )
        )
        self.assertGreaterEqual(res.identity_score, 0.85)
        self.assertEqual(res.risk, "low")

    def test_failed_liveness_penalizes_score(self):
        live = compute_score(ScoreRequest(face_confidence=0.95, liveness_passed=True))
        spoof = compute_score(ScoreRequest(face_confidence=0.95, liveness_passed=False))
        self.assertGreater(live.identity_score, spoof.identity_score)

    def test_stale_verification_decays(self):
        fresh = compute_score(ScoreRequest(face_confidence=0.9, liveness_passed=True))
        stale = compute_score(
            ScoreRequest(
                face_confidence=0.9,
                liveness_passed=True,
                verification_age_seconds=12 * 3600,
            )
        )
        self.assertGreater(fresh.identity_score, stale.identity_score)

    def test_breakdown_is_explainable(self):
        res = compute_score(ScoreRequest(face_confidence=0.8, liveness_passed=True))
        self.assertIn("face", res.breakdown)
        self.assertIn("liveness", res.breakdown)
        self.assertIn("device", res.breakdown)


if __name__ == "__main__":
    unittest.main()
