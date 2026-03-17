const express = require('express');
const router = express.Router();
const { loginUser, getProfile, registerUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.post('/register', registerUser); // For initial setup or internal use
router.get('/profile', protect, getProfile);

module.exports = router;
