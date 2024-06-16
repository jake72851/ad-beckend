var express = require('express')
var router = express.Router()

const adsControllers = require('../controllers/ads')

router.get('/', adsControllers.insights)
router.get('/creatives', adsControllers.creativesInsights)

module.exports = router
