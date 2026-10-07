/** API router: every resource router is mounted here under /api. */
const express = require('express');

const router = express.Router();

router.use('/health', require('./healthRoutes'));
router.use('/auth', require('./authRoutes'));
router.use('/transactions', require('./transactionRoutes'));
router.use('/budgets', require('./budgetRoutes'));
router.use('/goals', require('./goalRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/analytics', require('./analyticsRoutes'));
router.use('/regression', require('./regressionRoutes'));
router.use('/alerts', require('./alertRoutes'));

module.exports = router;
