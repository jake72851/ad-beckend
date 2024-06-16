const request = require('request')
const url = require('url')
const adsSdk = require('facebook-nodejs-business-sdk')

// const accessToken = process.env.FB_LONG_ACCESS_TOKEN
// const API = adsSdk.FacebookAdsApi.init(accessToken)
const Ad = adsSdk.Ad
const AdAccount = adsSdk.AdAccount
const AdVideo = adsSdk.AdVideo

const CONF = require('../../config')

exports.detail = async (req, res) => {
  const { fb_ad_account_id } = req.user
  const { ad_id } = req.query

  try {
    if(!ad_id) throw 'AD_ID_UNDEFINED'

    let adcreative = await adcreativesLevel(ad_id)
    if(adcreative.error) return res.json({ code: adcreative.error, data: null})
    const advideo = await advideoLevel(fb_ad_account_id, adcreative.video_id)
    adcreative = { ...adcreative, ...advideo }
    
    return res.json({
      code: 'SUCCESS',
      data: adcreative
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: 'FAIL',
      data: error
    })
  }
}

async function adcreativesLevel(ad_id) {
  const ad = new Ad(ad_id)
  const errorObj = {
    error: 'DATA_NOT_FOUND',
    video_url: null,
    title: null,
    message: null,
    link_description: null,
    call_to_action: null,
    image_url: null,
    utm_data: null,
  }
  try {
    const adCreatives = await ad.getAdCreatives(['object_story_spec'])
    let data = null
    if (!adCreatives || adCreatives.length === 0) {
      data = errorObj
    } else {
      const { video_data } = adCreatives[0].object_story_spec
      if (!video_data) return errorObj
      data = { ...video_data }
      data.utm_data = url.parse(video_data.call_to_action.value.link, true).query
    }
    return data
  } catch (e) {
    console.log(e)
    throw e
  }
}

async function advideoLevel(fb_ad_account_id, video_id) {
  const adVideo = new AdVideo(video_id)
  try {
    const _adVideo = await adVideo.read(['source', 'thumbnails{uri,is_preferred}'])
    const data = { video_url: _adVideo.source }
    let thumbnail = null
    if (_adVideo.thumbnails.data && _adVideo.thumbnails.data.length > 0) {
      thumbnail = _adVideo.thumbnails.data.find(item => item.is_preferred)
    }
    data.thumbnail_url = thumbnail
    return data
  } catch (e) {
    console.log(e)
    throw e
  }
}
