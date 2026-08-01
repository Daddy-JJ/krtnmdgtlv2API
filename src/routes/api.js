const express = require('express');
const crud = require('../controllers/crud.controller');
const { loadSchema } = require('../services/schema.service');
const { databaseName } = require('../config/database');

const router = express.Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.get('/health', async (req, res, next) => {
  try {
    const schema = await loadSchema();
    res.json({ success: true, message: 'API aktif', database: databaseName, tables: [...schema.keys()] });
  } catch (error) { next(error); }
});
router.get('/:table', wrap(crud.list));
router.get('/:table/:id', wrap(crud.show));
router.post('/:table', wrap(crud.create));
router.put('/:table/:id', wrap(crud.update));
router.patch('/:table/:id', wrap(crud.update));
router.delete('/:table/:id', wrap(crud.remove));

module.exports = router;
