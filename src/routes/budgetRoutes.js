const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getBudgets, upsertBudget, deleteBudget } = require('../controllers/budgetController');

router.use(protect);
router.get('/', getBudgets);
router.put('/',  upsertBudget);
router.delete('/:id', deleteBudget);

module.exports = router;
