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

const pageControllers = require('../controllers/page')
const { isAuthenticated } = require('../lib/auth')

router.get('/', isAuthenticated, pageControllers.pageList)
router.post('/id', isAuthenticated, pageControllers.id)
router.post('/text', isAuthenticated, pageControllers.createText)
router.post('/image', isAuthenticated, pageControllers.createImage)
router.post('/video', isAuthenticated, upload.single('source'), pageControllers.createVideo)
router.get('/post', isAuthenticated, pageControllers.postList)

module.exports = router
