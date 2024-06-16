const express = require('express')
const router = express.Router()

const controllers = require('../controllers/youtube')
const { isAuthenticated } = require('../lib/auth')

const multer = require('multer')
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + file.originalname)
  },
})
const upload = multer({ storage: storage })

// 구글 로그인
router.get('/', controllers.auth)
router.get('/auth', controllers.authFront)
// oauth callback
router.get('/oauth2callback', controllers.oauth2callback)
router.post('/code', isAuthenticated, controllers.code)
router.get('/channel_list', isAuthenticated, controllers.channelList)
router.get('/media_list', isAuthenticated, controllers.mediaList)
router.get('/media', isAuthenticated, controllers.mediaInfo)
router.post('/media', isAuthenticated, upload.single('media'), controllers.mediaCreate)
router.patch('/media', isAuthenticated, controllers.mediaEdit)
router.delete('/media', isAuthenticated, controllers.mediaDelete)
// 리포트
router.get('/report', isAuthenticated, controllers.report)

module.exports = router
