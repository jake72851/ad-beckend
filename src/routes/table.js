const express = require('express')
const router = express.Router()

const tableControllers = require('../controllers/table')
const { isAuthenticated } = require('../lib/auth')

router.get('/', isAuthenticated, tableControllers.fetchTables)
router.post('/', isAuthenticated, tableControllers.createTable)
router.patch('/:table_id', isAuthenticated, tableControllers.updateTable)
router.delete('/:table_id', isAuthenticated, tableControllers.deleteTable)

module.exports = router
