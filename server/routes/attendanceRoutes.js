const express = require('express');
const router = express.Router();
const { markAttendance, getAttendance, getStudentAttendance, clearAllAttendance } = require('../controllers/attendanceController');
const { protect, faculty } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, faculty, getAttendance)
  .post(markAttendance);

router.post('/mark', markAttendance);

router.delete('/clear', protect, faculty, clearAllAttendance); // Faculty/Admin can clear

router.get('/student/:id', protect, getStudentAttendance);

module.exports = router;
