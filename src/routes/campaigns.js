var express = require('express')
var router = express.Router()

const campaignsControllers = require('../controllers/campaigns')

router.get('/', campaignsControllers.insights)

module.exports = router
