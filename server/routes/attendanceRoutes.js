const express = require('express');
const router = express.Router();
const c = require('../controllers/attendanceController');
const { protect, admin, faculty } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, faculty, c.getAttendance)
  .post(protect, faculty, c.markManual);

router.post('/mark', c.markLegacy);
router.get('/me', protect, c.getMyAttendance);
router.get('/review-queue', protect, faculty, c.getReviewQueue);
router.patch('/:id/review', protect, faculty, c.reviewRecord);
router.delete('/clear', protect, admin, c.clearAllAttendance);
router.get('/student/:id', protect, c.getStudentAttendance);

module.exports = router;
