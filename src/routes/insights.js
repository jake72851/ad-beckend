const express = require('express')
const router = express.Router()

const insightsControllers = require('../controllers/insights')
const { isAuthenticated } = require('../lib/auth')

router.get('/', isAuthenticated, insightsControllers.FBinsightsAll)
router.get('/insight-sdk', insightsControllers.FBinsightsAll)
router.get('/action', isAuthenticated, insightsControllers.fetchActions)
router.post('/excel', insightsControllers.downloadExcel)

router.get('/all', insightsControllers.all)
router.get('/gender', insightsControllers.gender)
router.get('/age', insightsControllers.age)
router.get('/location', insightsControllers.location)

router.get('/facebook', isAuthenticated, insightsControllers.facebook)
router.get('/instagram', isAuthenticated, insightsControllers.instagram)
router.get('/youtube', isAuthenticated, insightsControllers.youtube)
router.get('/youtube/refresh', isAuthenticated, insightsControllers.youtubeRefresh)
router.get('/youtube/updateInfo', isAuthenticated, insightsControllers.youtubeUpdateInfo)

router.delete('/youtube', isAuthenticated, insightsControllers.youtubeDataDelete)

module.exports = router
