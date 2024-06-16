const express = require('express')
const router = express.Router()

const dashboardsControllers = require('../controllers/dashboard')
const { isAuthenticated } = require('../lib/auth')

router.get('/', isAuthenticated, dashboardsControllers.fetchDashboards)
router.post('/', isAuthenticated, dashboardsControllers.createDashboard)
router.patch('/:dashboard_id', isAuthenticated, dashboardsControllers.updateDashboard)
router.delete('/:dashboard_id', isAuthenticated, dashboardsControllers.deleteDashboard)

module.exports = router
