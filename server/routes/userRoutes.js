const express = require('express');
const router = express.Router();
const { getUsers, getUserById, createUser, deleteUser, deleteAllUsers } = require('../controllers/userController');
const { protect, admin, faculty } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, faculty, getUsers)
  .post(protect, admin, createUser);

router.route('/:id')
  .get(protect, faculty, getUserById)
  .delete(protect, admin, deleteUser);

router.delete('/bulk/clear', protect, admin, deleteAllUsers);

module.exports = router;
