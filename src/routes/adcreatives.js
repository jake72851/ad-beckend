var express = require('express')
var router = express.Router()

const adcreativesControllers = require('../controllers/adcreatives')
const { isAuthenticated } = require('../lib/auth')

router.get('/', isAuthenticated, adcreativesControllers.detail)

module.exports = router
