const bcrypt = require('bcrypt')
const axios = require('axios')
const { google } = require('googleapis')
const config = require('../../config')

const fs = require('fs')
const FormData = require('form-data')

const jwt = require('../lib/jwt')
const User = require('../models/users')

const jwt2 = require('jsonwebtoken')

const CLIENT_ID = '...'

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID, // Google Cloud에서 생성한 OAuth 2.0 클라이언트 ID
  '...', // 클라이언트 시크릿
  'postmessage'
)

//페이스북 페이지 엑세스 토큰 확인
async function checkToken(token) {
  if (!token) {
    return 'param_err'
  }
  const appToken = '...'
  const url = `https://graph.facebook.com/v18.0/debug_token?input_token=${token}&access_token=${appToken}`
  const result = await axios.get(url)

  if (!result.data.data.is_valid) {
    return 'expired'
  } else {
    return 'passed'
  }
}

//페이스북 권한 확인
async function permissionCheck(permissionsToCheckString, resData) {
  // 사용자가 승인한 권한과 페이스북 로그인에 필요한 권한이 올바른지 확인
  const permissionsToCheck = permissionsToCheckString.split(',')
  const checkPermissions = (permissions) => {
    const notGrantedPermissions = []
    permissions.forEach((permissionName) => {
      const permissionObject = resData.find((item) => item.permission === permissionName)
      if (!(permissionObject && permissionObject.status === 'granted')) {
        notGrantedPermissions.push(permissionName)
      }
    })
    return notGrantedPermissions
  }
  return checkPermissions(permissionsToCheck)
}

//페이스북 사용자 장기 엑세스 토큰 요청
async function longToken(token) {
  if (!token) {
    return 'param_err'
  }
  const url =
    config.api_url.uri +
    'oauth/access_token?grant_type=fb_exchange_token&' +
    'client_id=...&' +
    'client_secret=...&' +
    'fb_exchange_token=' +
    token
  const result = await axios.get(url)
  // console.log('result.data.data =', result.data.data)
  console.log('longToken > result.data =', result.data)
  return result.data
}
//페이스북 사용자 페이지 장기 엑세스 토큰 요청
async function longTokenPage(userId, token) {
  if (!token || !userId) {
    return 'param_err'
  }
  const url = config.api_url.uri + userId + '/accounts?access_token=' + token
  let result = await axios.get(url)
  // console.log('result.data.data =', result.data.data)
  console.log('longTokenPage > result.data =', result.data)

  const resultResponse = []
  resultResponse.push(...result.data.data)
  while (result.data.paging.next) {
    result = await axios.get(result.data.paging.next)
    resultResponse.push(...result.data.data)
  }
  return resultResponse
}

exports.fetchUserInfo = async (req, res) => {
  const { id } = req.user
  try {
    const user = await User.findById(id).lean()
    res.status(200).json({ code: 'SUCCESS', data: user })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.fetchBusinesses = async (req, res) => {
  const { id } = req.user
  if (id !== process.env.VPLATE_ADMIN_ID) {
    res.status(401).json({ code: 'Unauthorized', error: '관리자 권한이 없습니다' })
    return
  }
  try {
    const users = await User.find().lean()
    res.status(200).json({ code: 'SUCCESS', data: users })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.signIn = async (req, res) => {
  try {
    const { id, password } = req.body
    if (!id || !password) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter id, password are required',
      })
    }
    const user = await User.findOne({
      user_id: id,
    })
      .select('+password +fb_ad_account_id')
      .exec()
    if (user == null) {
      return res.status(401).json({
        code: 'USER_NOT_EXITS',
        message: 'user not exits',
      })
    }
    if (user.userStatus === -1) {
      return res.status(401).json({
        code: 'USER_EXPIRED',
        message: '탈퇴 하신 회원 계정입니다.',
      })
    }
    if (!password) {
      return res.status(401).json({
        code: 'PASSWORD_REQUIRED',
        message: 'password is required',
      })
    }
    const success = bcrypt.compareSync(password, user.password)
    if (success) {
      const accessToken = jwt.sign({ user_id: id, id: user.id, fb_ad_account_id: user.fb_ad_account_id })
      res.status(200).json({ code: 'SUCCESS', data: { accessToken } })
    } else {
      res.status(401).json({ code: 'WRONG_INFO' })
    }
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.signUp = async (req, res) => {
  try {
    const { user_id, password, company_name, company_reg_num } = req.body
    const passwordHash = bcrypt.hashSync(password, 8)
    const user = {
      user_id,
      password: passwordHash,
      company_name,
      company_reg_num,
    }
    const dbUser = await User.create(user)
    res.status(200).json({ code: 'SUCCESS', data: dbUser })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error })
  }
}

exports.authGA = async (req, res) => {
  const { _id, account_id, property_id, property_name, view_id, view_name } = req.body

  try {
    const user = await User.findById(_id).select('ga_properties')
    if (user.ga_properties.some((item) => item.property_id === property_id)) {
      res.status(409).json({
        code: 'DUPLICATED',
        message: 'property_id는 중복될 수 없습니다.',
      })
      return
    }
    user.ga_properties = [
      ...user.ga_properties,
      {
        account_id,
        property_id,
        property_name,
        view_id,
        view_name,
      },
    ]
    await user.save()
    res.status(200).json({
      code: 'SUCCESS',
      message: '연동 완료',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}

exports.authFbPage = async (req, res) => {
  try {
    const { access_token, user_id } = req.query
    const { id } = req.user
    if (!user_id || !access_token || !id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter user_id, access_token, id are required',
      })
    }

    const url = 'https://graph.facebook.com/v18.0/' + user_id + '/accounts?access_token=' + access_token
    const result = await axios.get(url)
    // console.log('result =', result)
    console.log('result.data.data =', result.data.data)

    const user = await User.findById(id)
    console.log('user =', user)

    user.fb_page_info = result.data.data
    await user.save()

    res.status(200).json({
      code: 'SUCCESS',
      data: result.data.data,
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}

exports.fbPage = async (req, res) => {
  try {
    const userId = req.user.id

    const { page_info, user_info, user_name, instagram_info } = req.body

    if (!userId) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const user = await User.findById(userId)

    if (user_info) {
      const resultToken = await longToken(user_info.accessToken)
      if (resultToken !== 'param_err' && resultToken) {
        user.fb_user_info = {}
        user.fb_user_info.userID = user_info.userID
        user.fb_user_info.expiresIn = resultToken.expires_in
        user.fb_user_info.accessToken = resultToken.access_token
        user.fb_user_info.signedRequest = user_info.signedRequest
        user.fb_user_info.graphDomain = user_info.graphDomain
        user.fb_user_info.data_access_expiration_time = user_info.data_access_expiration_time
        user.fb_user_info.token_type = resultToken.token_type
      } else {
        return res.status(401).json({
          code: 'ACCESS_TOKEN_LONG_TOKEN_EXCHANGE_FAIL',
          message: 'Please try linking your Facebook account again.',
        })
      }
    }
    if (page_info) {
      user.fb_page_info = page_info
      const resultToken = await longTokenPage(user.fb_user_info.userID, user.fb_user_info.accessToken)
      const extractToken = resultToken.reduce((acc, curr) => {
        if (curr.id === page_info.id) return curr
      })

      if (resultToken !== 'param_err' && resultToken.length > 0 && extractToken) {
        user.fb_page_info = extractToken
      } else {
        return res.status(401).json({
          code: 'PAGE_ACCESS_TOKEN_LONG_TOKEN_EXCHANGE_FAIL',
          message: 'Please try linking your Facebook account again.',
        })
      }
    }
    if (user_name) user.fb_user_name = user_name
    if (instagram_info) user.fb_instagram_info = instagram_info

    const result = await user.save()
    console.log('계정연동 결과 정보 result =', result)

    res.status(200).json({
      code: 'SUCCESS',
      data: {
        user_info: user.fb_user_info,
        user_name: user.fb_user_name,
        page_info: user.fb_page_info,
        instagram_info: user.fb_instagram_info,
      },
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}

exports.fbPageDelete = async (req, res) => {
  try {
    console.log('req.user.id =', req.user.id)
    const userId = req.user.id
    if (!userId) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(userId)
    console.log('user =', user)

    // 엑세스토큰 확인 - 토큰이 유효해야 권한 삭제가 가능함
    // user.fb_user_info.userID 이 존재할때만 앱 삭제 가능
    if (!user.fb_user_info || !user.fb_user_info.userID) {
      console.log('페이스북 권한 삭제 결과 = userID가 없어 삭제 불가능')
    } else {
      // 페이스북 권한 삭제
      const url =
        'https://graph.facebook.com/' +
        user.fb_user_info.userID +
        '/permissions?access_token=705376398052681|ISzuu8LajgOf2VZ6gWhVwzsK2kQ'
      // user.fb_user_info.accessToken
      const result = await axios.delete(url)
      console.log('페이스북 권한 삭제 결과 =', result.data)
    }

    if (user.fb_page_info) {
      await User.updateOne({ _id: userId }, { $unset: { fb_page_info: '' } })
    }
    if (user.fb_user_info) {
      await User.updateOne({ _id: userId }, { $unset: { fb_user_info: '' } })
    }
    if (user.fb_user_name) {
      await User.updateOne({ _id: userId }, { $unset: { fb_user_name: '' } })
    }
    if (user.fb_instagram_info) {
      await User.updateOne({ _id: userId }, { $unset: { fb_instagram_info: '' } })
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Facebook account removal complete',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}
exports.accountDelete = async (req, res) => {
  try {
    console.log('req.user.id =', req.user.id)
    const userId = req.user.id
    if (!userId) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(userId)
    console.log('user =', user)

    if (user.fb_user_info) {
      await User.updateOne({ _id: userId }, { $unset: { fb_user_info: '' } })
    }
    if (user.fb_user_name) {
      await User.updateOne({ _id: userId }, { $unset: { fb_user_name: '' } })
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Facebook account removal complete',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}
exports.pageDelete = async (req, res) => {
  try {
    console.log('req.user.id =', req.user.id)
    const userId = req.user.id
    if (!userId) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(userId)
    console.log('user =', user)

    if (user.fb_page_info) {
      await User.updateOne({ _id: userId }, { $unset: { fb_page_info: '' } })
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Facebook page removal complete',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}
exports.instagramDelete = async (req, res) => {
  try {
    const userId = req.user.id
    if (!userId) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(userId)
    console.log('user =', user)

    if (user.fb_instagram_info) {
      await User.updateOne({ _id: userId }, { $unset: { fb_instagram_info: '' } })
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Facebook instagram removal complete',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}

exports.pageList = async (req, res) => {
  try {
    const { id } = req.user
    console.log('id =', id)

    const user = await User.findById(id).lean()
    console.log('user =', user)

    if (!user.fb_page_info) {
      res.status(401).json({
        code: 'facebook account not found',
        message: '페이스북 계정을 연동해 주세요',
      })
    } else {
      res.status(200).json({ code: 'SUCCESS', data: user.fb_page_info })
    }
  } catch (error) {
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.id = async (req, res) => {
  try {
    const { user_id, access_token } = req.body
    const { id } = req.user
    if (!user_id || !access_token || !id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter user_id, access_token, id are required',
      })
    }

    const url = 'https://graph.facebook.com/v18.0/' + user_id + '/accounts?access_token=' + access_token
    const result = await axios.get(url)

    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    res.status(400).json({ success: false, error })
  }
}

exports.createText = async (req, res) => {
  try {
    const { id } = req.user
    const { page_id, message, access_token } = req.body
    if (!page_id || !id || !message || !access_token) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, message, access_token are required',
      })
    }

    const url = 'https://graph.facebook.com/v18.0/' + page_id + '/feed'
    const data = {
      message: message,
      access_token: access_token,
    }
    const headers = {
    }
    const result = await axios.post(url, data, { headers })

    res.status(200).json({ code: 'SUCCESS', message: '페이지 게시 완료' })
  } catch (error) {
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.createImage = async (req, res) => {
  try {
    const { id } = req.user
    const { page_id, url, access_token } = req.body
    if (!page_id || !id || !url || !access_token) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, url, access_token are required',
      })
    }

    const reqUrl = 'https://graph.facebook.com/v18.0/' + page_id + '/photos'
    const data = {
      url: url,
      access_token: access_token,
    }
    const headers = {
    }
    const result = await axios.post(reqUrl, data, { headers })

    res.status(200).json({ code: 'SUCCESS', message: '페이지 게시 완료' })
  } catch (error) {
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.createVideo = async (req, res) => {
  try {
    const { id } = req.user
    const { page_id, access_token } = req.body

    const file = req.file
    if (!page_id || !id || !file || !access_token) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, file, access_token are required',
      })
    }

    const reqUrl = 'https://graph.facebook.com/v18.0/' + page_id + '/videos'
    const uploadFile = await fs.createReadStream(file.path)

    const form = new FormData()
    form.append('source', uploadFile)

    const headers = {
      'Content-Type': 'multipart/form-data; boundary=' + form.getBoundary(),
      Authorization: `Bearer ${access_token}`,
    }
    const result = await axios.post(reqUrl, form, { headers })
    console.log('result.data =', result.data)
    // result.data = { id: '875439737310673' }

    res.status(200).json({ code: 'SUCCESS', message: '페이지 게시 완료' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.permissionList = async (req, res) => {
  try {
    const { id } = req.user
    console.log('id =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const { type } = req.query
    console.log('type =', type)
    if (!type) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter type are required',
      })
    }

    const user = await User.findById(id).lean()
    console.log('user =', user)

    if (!user.fb_user_info || !user.fb_user_info.userID || !user.fb_user_info.accessToken) {
      res.status(401).json({
        code: 'USERID_NOT_EXITS',
        message: 'There is no Facebook user ID information. Please link your Facebook account.',
      })
    }

    // 엑세스토큰 검증
    const checkTokenResult = await checkToken(user.fb_user_info.accessToken)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook page access token has expired. Please try linking the Facebook page again.',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter access token are required',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' +
      user.fb_user_info.userID +
      '/permissions?access_token=' +
      user.fb_user_info.accessToken
    const result = await axios.get(url)

    // facebook page 게시물 생성시 필요한 권한
    const page_per = 'pages_show_list,pages_read_engagement,pages_manage_posts'
    // facebook instagram 게시물 생성시 필요한 권한
    const instar_per =
      'instagram_basic,instagram_content_publish,instagram_shopping_tag_products,catalog_management,instagram_manage_insights,pages_show_list'

    let responseResult
    if (type === 'page') {
      responseResult = await permissionCheck(page_per, result.data.data)
    } else if (type === 'instagram') {
      responseResult = await permissionCheck(instar_per, result.data.data)
    }
    res.status(200).json({ code: 'SUCCESS', type: type, data: responseResult })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.youtubeCode = async (req, res) => {
  try {
    const { id } = req.user
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const { code } = req.body
    if (!code) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter code are required',
      })
    }

    const user = await User.findById(id)
    // console.log('user =', user)

    const codeResult = await oauth2Client.getToken(code)
    oauth2Client.setCredentials({
      access_token: codeResult.tokens.access_token,
      refresh_token: codeResult.tokens.refresh_token, // refresh_token은 최초 앱 설치시에만 한번만 확인 가능함
    })

    // 사용자 정보
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    })
    // 사용자의 유튜브 채널 정보를 가져오는 함수
    const channelResult = await youtube.channels.list({
      part: 'snippet,contentDetails,statistics',
      mine: true, // 인증된 사용자의 채널 정보를 요청
    })
    const channelInfo = channelResult.data.items

    const responses = {
      google_token_info: codeResult.tokens,
      google_user_info: userInfo.data,
      youtube_channel_info: channelInfo,
    }

    // 토큰, 사용자 정보만 우선 저장. 채널은 프론트에서 선택후 저장
    user.google_token_info = codeResult.tokens
    user.google_user_info = userInfo.data

    const result = await user.save()

    res.status(200).json({ code: 'SUCCESS', data: responses })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}

exports.youtubeInsert = async (req, res) => {
  try {
    const userId = req.user.id

    const { youtube_channel_info } = req.body

    if (!userId || !youtube_channel_info) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token), youtube_channel_info are required',
      })
    }

    const user = await User.findById(userId)

    if (youtube_channel_info) user.youtube_channel_info = youtube_channel_info

    const result = await user.save()

    res.status(200).json({
      code: 'SUCCESS',
      message: 'success',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}

exports.youtubeDelete = async (req, res) => {
  try {
    console.log('req.user.id =', req.user.id)
    const userId = req.user.id
    if (!userId) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(userId)
    console.log('user.google_token_info =', user.google_token_info)

    if (!user.google_token_info) {
      return res.status(401).json({
        code: 'NOT_FOUND_GOOGLE_USER_INFO',
        message: 'There is no Google user information. Please link your Google account.',
      })
    }

    oauth2Client.setCredentials({
      access_token: user.google_token_info.access_token,
      refresh_token: user.google_token_info.refresh_token,
    })

    // 엑세스 토큰 만료시 감지하여 업데이트
    oauth2Client.on('tokens', async (tokens) => {
      user.google_token_info.access_token = tokens.access_token
      user.google_token_info.scope = tokens.scope
      user.google_token_info.token_type = tokens.token_type
      user.google_token_info.id_token = tokens.id_token
      user.google_token_info.expiry_date = tokens.expiry_date
      if (tokens.refresh_token) user.google_token_info.refresh_token = tokens.refresh_token
      await user.save()
    })

    // 엑세스 토큰 검증을 위한 임시 사용자 정보 요청
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()

    // 액세스 토큰을 취소합니다.
    const revokeRes = await oauth2Client.revokeToken(user.google_token_info.access_token)
    // console.log('revokeRes =', revokeRes)

    if (revokeRes.statusText !== 'OK') {
      return res.status(401).json({
        code: 'FAILED_REQUEST',
        message: 'Failed to delete app linked to user. please try again',
      })
    }

    if (user.google_token_info) await User.updateOne({ _id: userId }, { $unset: { google_token_info: '' } })
    if (user.google_user_info) await User.updateOne({ _id: userId }, { $unset: { google_user_info: '' } })
    if (user.youtube_channel_info) await User.updateOne({ _id: userId }, { $unset: { youtube_channel_info: '' } })

    res.status(200).json({
      code: 'SUCCESS',
      message: 'google, youtube account removal complete',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}

exports.refreshTokenTiktok = async (req, res) => {
  try {
    const { userId, token } = req.body

    var decoded = jwt2.verify(token, '...')

    res.status(200).json({
      code: 'SUCCESS',
      message: 'ok!!!',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}
