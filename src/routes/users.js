const express = require('express')
const router = express.Router()

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

const usersControllers = require('../controllers/users')
const { isAuthenticated } = require('../lib/auth')

router.get('/', isAuthenticated, usersControllers.fetchUserInfo)
router.get('/business', isAuthenticated, usersControllers.fetchBusinesses)
router.post('/signin', usersControllers.signIn)
router.post('/signup', usersControllers.signUp)
router.post('/permission/ga', usersControllers.authGA)

router.get('/permission', isAuthenticated, usersControllers.permissionList)

router.get('/permission/fbpage', isAuthenticated, usersControllers.authFbPage)
router.post('/permission/fbpage', isAuthenticated, usersControllers.fbPage)

router.delete('/permission/fbpage', isAuthenticated, usersControllers.fbPageDelete)
router.delete('/permission/account', isAuthenticated, usersControllers.accountDelete)
router.delete('/permission/page', isAuthenticated, usersControllers.pageDelete)
router.delete('/permission/instagram', isAuthenticated, usersControllers.instagramDelete)

router.get('/facebook', isAuthenticated, usersControllers.pageList)
router.post('/facebook/id', isAuthenticated, usersControllers.id)
router.post('/facebook/text', isAuthenticated, usersControllers.createText)
router.post('/facebook/image', isAuthenticated, usersControllers.createImage)
router.post('/facebook/video', isAuthenticated, upload.single('source'), usersControllers.createVideo)

router.post('/permission/youtube/code', isAuthenticated, usersControllers.youtubeCode)
router.post('/permission/youtube', isAuthenticated, usersControllers.youtubeInsert)
router.delete('/permission/youtube', isAuthenticated, usersControllers.youtubeDelete)

// vplate lambda test
router.post('/refreshToken/tiktok', usersControllers.refreshTokenTiktok)

module.exports = router
