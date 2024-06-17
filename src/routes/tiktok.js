const express = require('express')
const router = express.Router()


const controllers = require('../controllers/tiktok')
const { isAuthenticated } = require('../lib/auth')

router.get('/', controllers.start)

router.get('/auth', controllers.auth)
router.get('/auth_localhost', controllers.authLocalhost)

// 백엔드 테스트 전용
router.get('/authBack', controllers.authBack)

router.get('/callback', controllers.callback)

router.post('/code', isAuthenticated, controllers.code)
router.post('/code_localhost', isAuthenticated, controllers.codeLocalhost)

router.get('/user_info', isAuthenticated, controllers.userInfo)
router.post('/video', isAuthenticated, controllers.video)
router.post('/status', isAuthenticated, controllers.status)
router.post('/list', isAuthenticated, controllers.list)

router.delete('/account', isAuthenticated, controllers.accountDelete)

module.exports = router
