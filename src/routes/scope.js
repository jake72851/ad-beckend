const express = require('express')
const router = express.Router()

const controllers = require('../controllers/scope')
// const { isAuthenticated } = require('../lib/auth')

router.get('/facebook', controllers.facebook)
router.get('/google', controllers.google)

module.exports = router
