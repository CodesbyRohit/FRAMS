const express = require('express');
const router = express.Router();
const c = require('../controllers/userController');
const { protect, admin, faculty } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, faculty, c.getUsers)
  .post(protect, admin, c.createUser);

router.delete('/bulk/clear', protect, admin, c.deleteAllUsers);

router.route('/:id')
  .get(protect, faculty, c.getUserById)
  .delete(protect, admin, c.deleteUser);

router.get('/:id/photo', protect, faculty, c.getUserPhoto);
router.put('/:id/update-behavior', c.updateBehavior);

module.exports = router;
