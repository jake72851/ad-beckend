var express = require('express')
var router = express.Router()

const adsetsControllers = require('../controllers/adsets')

router.get('/', adsetsControllers.insights)

module.exports = router
