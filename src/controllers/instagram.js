const URL = require('url')
const path = require('path')

const https = require('https')
const mime = require('mime-types')

const axios = require('axios')
// 요청 인터셉터 추가
axios.interceptors.request.use((request) => {
  console.log('[axios] Request =', JSON.stringify(request, null, 2))
  return request
})

const wait = require('waait')

const User = require('../models/users')

// 페이스북 페이지 엑세스 토큰 확인
async function checkToken(token) {
  if (!token) {
    return 'param_err'
  }
  const appToken = '...' // 앱	705376398052681 : V-AD - Test2
  const url = `https://graph.facebook.com/v18.0/debug_token?input_token=${token}&access_token=${appToken}`
  const result = await axios.get(url)

  if (!result.data.data.is_valid) {
    return 'expired'
  } else {
    return 'passed'
  }
}

// 인스타그램 컨테이너 생성시 영상 파일 업로드 완료 체크 - 업로드 완료 이전에 게시요청시 에러
async function checkUpload(mediaObjectId, accessToken) {
  try {
    const url = `https://graph.facebook.com/v18.0/${mediaObjectId}`
    const params = {
      fields: 'status_code',
      access_token: accessToken,
    }
    const response = await axios.get(url, { params })
    return response.data.status_code
  } catch (error) {
    console.error('Error checking media status:', error.response.data)
    throw error
  }
}

// 업로드 영상 게시 요청
async function postStart(instagram_business_account, creationId, accessToken) {
  try {
    const url = 'https://graph.facebook.com/v18.0/' + instagram_business_account + '/media_publish'
    const data = {
      access_token: accessToken,
      creation_id: creationId,
    }
    const response = await axios.post(url, data)
    return response.data
  } catch (error) {
    console.error('Error posting media :', error.response.data)
    throw error
  }
}

exports.id = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token user id =', id)

    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const user = await User.findById(id)

    if (!user.fb_page_info || !user.fb_page_info.id) {
      res.status(401).json({
        code: 'FACEBOOK_PAGE_INFO_NOT_EXITS',
        message:
          'There is no Facebook page information to check your Instagram business account information. Please link your Facebook page.',
      })
    }

    if (!user.fb_user_info || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'FACEBOOK_USER_INFO_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' +
      user.fb_page_info.id +
      '?access_token=' +
      user.fb_user_info.accessToken +
      '&fields=id,name,instagram_business_account{id,username}'
    const result = await axios.get(url)
    console.log('[axios] Response.data =', result.data)

    res.status(200).json({ code: 'SUCCESS', data: [result.data.instagram_business_account] })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.businessAccount = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account } = req.query

    if (!id || !instagram_business_account) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), instagram_business_account are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken || !user.fb_instagram_info) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user, instagram information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const responses = {}

    // 인스타그램 비즈니스 계정 정보 확인
    const url =
      'https://graph.facebook.com/v18.0/' +
      instagram_business_account +
      '?access_token=' +
      user.fb_user_info.accessToken +
      '&fields=biography,followers_count,follows_count,id,ig_id,media_count,name,profile_picture_url,username'
    const result = await axios.get(url)

    if (result.data.username) {
      responses.id = instagram_business_account
      responses.username = result.data.username
      responses.profile_picture_url = result.data.profile_picture_url
      responses.media_count = result.data.media_count
      responses.followers_count = result.data.followers_count
      responses.follows_count = result.data.follows_count
    }

    res.status(200).json({ code: 'SUCCESS', data: responses })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.publishingLimit = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account } = req.query

    if (!id || !instagram_business_account) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), instagram_business_account are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    // 인스타그램 계정 콘텐츠 게시 사용량
    const url =
      'https://graph.facebook.com/v18.0/' +
      instagram_business_account +
      '/content_publishing_limit?fields=quota_usage,config&access_token=' +
      user.fb_user_info.accessToken
    const result = await axios.get(url)

    const responses = {}

    if (result.data.data.length > 0) {
      responses.quota_usage = result.data.data[0].quota_usage
      responses.quota_duration = Number(result.data.data[0].config.quota_duration) / 3600
      responses.quota_total = result.data.data[0].config.quota_total
    }

    res.status(200).json({ code: 'SUCCESS', data: responses })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.tagEligibility = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account } = req.query

    if (!id || !instagram_business_account) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), instagram_business_account are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' +
      instagram_business_account +
      '?fields=shopping_product_tag_eligibility&access_token=' +
      user.fb_user_info.accessToken
    const result = await axios.get(url)
    console.log('result.data =', result.data)

    let responses
    if (result.data.shopping_product_tag_eligibility) {
      responses = 'Instagram Shop set up'
    } else {
      responses = 'Instagram Shop not set up'
    }

    res.status(200).json({ code: 'SUCCESS', data: responses })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.catalog = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account } = req.query

    if (!id || !instagram_business_account) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), instagram_business_account are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' +
      instagram_business_account +
      '/available_catalogs?access_token=' +
      user.fb_user_info.accessToken
    const result = await axios.get(url)

    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.catalogProduct = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account, catalog_id } = req.query

    if (!id || !instagram_business_account || !catalog_id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter instagram_business_account, vad userId(jwt token), catalog_id are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' +
      instagram_business_account +
      '/catalog_product_search?access_token=' +
      user.fb_user_info.accessToken +
      '&catalog_id=' +
      catalog_id
    const result = await axios.get(url)

    const resultMap = result.data.data.map((data) => {
      if (data.product_id === 6892429700879553) data.review_status = 'rejected'
      return data
    })
    console.log('catalogProduct > resultMap =', resultMap)

    res.status(200).json({ code: 'SUCCESS', data: resultMap })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.productAppeal = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account, product_id, appeal_reason } = req.body

    if (!id || !instagram_business_account || !product_id || !appeal_reason) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter instagram_business_account, vad userId(jwt token), product_id, appeal_reason are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url = 'https://graph.facebook.com/v18.0/' + instagram_business_account + '/product_appeal'
    const data = {
      access_token: user.fb_user_info.accessToken,
      product_id: product_id,
      appeal_reason: appeal_reason,
    }
    const headers = {}
    const result = await axios.post(url, data, { headers })
    console.log('result.data =', result.data)

    let responses
    if (result.data.success) {
      responses = 'success'
    } else {
      responses = 'fail'
    }

    res.status(200).json({ code: 'SUCCESS', message: responses })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.mediaCreate = async (req, res) => {
  try {
    const { id } = req.user

    // const { instagram_business_account, page_id, video_url, product_tags } = req.body
    const { instagram_business_account, video_url, caption } = req.body

    if (!id || !instagram_business_account || !video_url || !caption) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter instagram_business_account, vad userId(jwt token), video_url, caption are required',
      })
    }

    // video_url 확인
    const pathname = URL.parse(video_url).pathname
    const extname = path.extname(pathname)
    if (extname !== '.mp4') {
      res.status(401).json({
        code: 'VIDEO_URL_ERROR',
        message: 'The video URL is not mp4. please try again.',
      })
    }

    https.get(video_url, (response) => {
      const contentType = response.headers['content-type']
      if (contentType && mime.extension(contentType) === 'mp4') {
        console.log('이 URL은 mp4 동영상입니다.')
      } else {
        res.status(401).json({
          code: 'VIDEO_URL_ERROR',
          message: 'The video URL is not mp4. please try again.',
        })
      }
    })

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    // 컨테이너 생성
    const url = 'https://graph.facebook.com/v18.0/' + instagram_business_account + '/media'
    const data = {
      video_url: video_url,
      access_token: user.fb_user_info.accessToken,
      caption: caption,
      media_type: 'REELS',
      share_to_feed: true,
    }
    const headers = {}
    const result = await axios.post(url, data, { headers })

    const creationId = result.data.id

    // 영상 업로드
    let uploadCheck = false
    while (!uploadCheck) {
      const status = await checkUpload(creationId, user.fb_user_info.accessToken)
      if (status === 'FINISHED') {
        uploadCheck = true
      } else if (status === 'ERROR') {
        return res.status(401).json({
          code: 'VIDEO_UPLOAD_ERROR',
          message: 'Video upload failed. please try again',
        })
      }
      await wait(5000)
    }

    // 영상 게시 요청
    const postResult = await postStart(instagram_business_account, creationId, user.fb_user_info.accessToken)

    res.status(200).json({ code: 'SUCCESS', message: 'Instagram posting completed' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.mediaList = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account } = req.query

    if (!id || !instagram_business_account) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter instagram_business_account, vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' +
      instagram_business_account +
      '/media?access_token=' +
      user.fb_user_info.accessToken +
      '&fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,children'
    const result = await axios.get(url)

    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.mediaProductTagList = async (req, res) => {
  try {
    const { id } = req.user

    const { instagram_business_account } = req.query

    if (!id || !instagram_business_account) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter instagram_business_account, vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    // Instagram 비즈니스 계정의 미디어 개체 가져오기
    const url =
      'https://graph.facebook.com/v18.0/' +
      instagram_business_account +
      '/media?fields=id,media_type,media_url,permalink,thumbnail_url,timestamp,username&access_token=' +
      user.fb_user_info.accessToken
    let listResult = await axios.get(url)
    const result = []
    result.push(...listResult.data.data)

    while (listResult.data.paging.next) {
      const url = listResult.data.paging.next
      listResult = await axios.get(url)
      result.push(...listResult.data.data)
    }

    for (item of result) {
      const url =
        'https://graph.facebook.com/v18.0/' + item.id + '/product_tags?access_token=' + user.fb_user_info.accessToken
      const result = await axios.get(url)
      if (result.data.data.length > 0) {
        const resultMap = result.data.data.map((data) => {
          if (data.product_id === 6892429700879553) data.review_status = 'rejected'
          return data
        })
        item.product_tag = resultMap
      } else {
        item.product_tag = []
      }
    }

    res.status(200).json({ code: 'SUCCESS', message: result })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.updatedTags = async (req, res) => {
  try {
    const { id } = req.user

    const { product_id, media_id } = req.body

    if (!id || !product_id || !media_id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter product_id, media_id, vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url = 'https://graph.facebook.com/v18.0/' + media_id + '/product_tags'
    const data = {
      access_token: user.fb_user_info.accessToken,
      updated_tags: [{ product_id: product_id }],
    }
    const headers = {}
    const result = await axios.post(url, data, { headers })

    let responses
    if (result.data.success) {
      responses = 'success'
    } else {
      responses = 'fail'
    }

    res.status(200).json({ code: 'SUCCESS', message: responses })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.deleteTags = async (req, res) => {
  try {
    const { id } = req.user

    const { product_id, media_id, merchant_id } = req.body

    if (!id || !product_id || !media_id || !merchant_id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter product_id, media_id, merchant_id, vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook access token has expired. Please try linking the Facebook account again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' +
      media_id +
      '/product_tags?deleted_tags=[{product_id:"' +
      product_id +
      '",merchant_id:"' +
      merchant_id +
      '"}]&access_token=' +
      user.fb_user_info.accessToken
    const result = await axios.delete(url)

    let responses
    if (result.data.success) {
      responses = 'success'
    } else {
      responses = 'fail'
    }

    res.status(200).json({ code: 'SUCCESS', message: responses })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
