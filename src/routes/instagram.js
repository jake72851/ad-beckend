const express = require('express')
const router = express.Router()

const instagramControllers = require('../controllers/instagram')
const { isAuthenticated } = require('../lib/auth')

router.get('/id', isAuthenticated, instagramControllers.id)
router.get('/business_account', isAuthenticated, instagramControllers.businessAccount)
router.get('/publishing_limit', isAuthenticated, instagramControllers.publishingLimit)
router.get('/tag_eligibility', isAuthenticated, instagramControllers.tagEligibility)
router.get('/catalog', isAuthenticated, instagramControllers.catalog)
router.get('/catalog_product', isAuthenticated, instagramControllers.catalogProduct)
router.post('/product_appeal', isAuthenticated, instagramControllers.productAppeal)
router.post('/media', isAuthenticated, instagramControllers.mediaCreate)
router.get('/media', isAuthenticated, instagramControllers.mediaList)
router.get('/media_product_tag_list', isAuthenticated, instagramControllers.mediaProductTagList)
router.patch('/updated_tags', isAuthenticated, instagramControllers.updatedTags)
router.delete('/updated_tags', isAuthenticated, instagramControllers.deleteTags)

module.exports = router
