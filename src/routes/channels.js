var express = require('express')
var router = express.Router()

const channelsControllers = require('../controllers/channels')

router.get('/', channelsControllers.insights)
router.get('/increments', channelsControllers.increments)

module.exports = router
