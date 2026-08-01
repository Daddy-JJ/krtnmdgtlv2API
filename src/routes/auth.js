const express = require('express');
const controller = require('../controllers/auth.controller');

const router = express.Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.post('/register', wrap(controller.register));
router.post('/login', wrap(controller.login));

module.exports = router;
