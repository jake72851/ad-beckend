const qs = require('qs')
const axios = require('axios')
const moment = require('moment-timezone')

const User = require('../models/users')

const redirectUri = 'https://dashboard.vplate.io:3006/tiktok/callback'

// 틱톡 엑세스 토큰 확인
async function checkToken(userInfo, userId) {
  console.log('checkToken > userInfo =', userInfo)
  if (!userInfo || !userId) {
    return 'param_err'
  }

  const tiktokUserInfo = userInfo.tiktok_user_info
  // 토큰 만료시간 체크
  if (tiktokUserInfo && tiktokUserInfo.expires_in && tiktokUserInfo.expires_createdAt) {
    // 대한민국 시간대인 Asia/Seoul을 사용
    const now = moment().tz('Asia/Seoul').unix()
    console.log('checkToken > now =', now)
    const expiresAt = tiktokUserInfo.expires_createdAt + tiktokUserInfo.expires_in
    console.log('checkToken > expiresAt =', expiresAt)
    if (now < expiresAt) {
      console.log('checkToken > 유효한 토큰입니다.')
    } else {
      console.log('checkToken > 만료된 토큰입니다. 리프레시 토큰 발급을 시도합니다.')
      // 리프레시 토큰 만료시간 체크
      const refreshExpiresAt = tiktokUserInfo.expires_createdAt + tiktokUserInfo.refresh_expires_in * 1000
      console.log('checkToken > refreshExpiresAt =', refreshExpiresAt)
      if (now < refreshExpiresAt) {
        console.log('checkToken > 유효한 리프레시 토큰입니다. users 컬렉션에 업데이트 합니다.')

        const tokenEndpoint = 'https://open.tiktokapis.com/v2/oauth/token/'
        const data = qs.stringify({
          client_key: '...',
          client_secret: '...',
          grant_type: 'refresh_token',
          refresh_token: tiktokUserInfo.refresh_token,
        })
        const headers = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
        }
        const result = await axios.post(tokenEndpoint, data, { headers })
        result.data.expires_createdAt = now
        console.log('checkToken > result.data =', result.data)

        const user = await User.findById(userId)
        user.tiktok_user_info = result.data
        await user.save()
        return 'update'
      } else {
        console.log('checkToken > 만료된 리프레시 토큰입니다.')
        return 'expired'
      }
    }
  } else {
    return 'param_err'
  }
}

exports.start = async (req, res) => {
  try {
    console.log('tiktok 시작')
    res.render('tiktok.html')
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.authLocalhost = async (req, res) => {
  try {
    const csrfState = Math.random().toString(36).substring(2)
    res.cookie('csrfState', csrfState, { maxAge: 60000 })

    let url = 'https://www.tiktok.com/v2/auth/authorize/'

    url += '?client_key=...'
    url += '&scope=user.info.basic,video.upload,video.publish,video.list'
    url += '&response_type=code'
    url += '&redirect_uri=' + 'https://b643-221-146-217-122.ngrok-free.app/auth/tiktok/callback/'
    url += '&state=' + csrfState

    res.redirect(url)
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.auth = async (req, res) => {
  try {
    const csrfState = Math.random().toString(36).substring(2)
    res.cookie('csrfState', csrfState, { maxAge: 60000 })

    let url = 'https://www.tiktok.com/v2/auth/authorize/'

    url += '?client_key=...'
    url += '&scope=user.info.basic,video.upload,video.publish,video.list'
    url += '&response_type=code'
    url += '&redirect_uri=' + 'https://dashboard.vplate.io/auth/tiktok/callback/'
    url += '&state=' + csrfState

    res.redirect(url)
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.authBack = async (req, res) => {
  try {
    const csrfState = Math.random().toString(36).substring(2)
    res.cookie('csrfState', csrfState, { maxAge: 60000 })

    let url = 'https://www.tiktok.com/v2/auth/authorize/'

    url += '?client_key=...'
    url += '&scope=user.info.basic,video.upload,video.publish,video.list'
    url += '&response_type=code'
    url += '&redirect_uri=' + redirectUri
    url += '&state=' + csrfState

    res.redirect(url)
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.callback = async (req, res) => {
  try {
    console.log('req.query =', req.query)

    const id = '65793115d39b4bff8c164e7f' // 사용자 "d" 계정

    // 유효한 id인지 확인
    const existId = await User.exists({
      _id: id,
    })
    if (!existId) throw { status: 400, code: 1, lang: 'ko' }

    const decode = decodeURI(req.query.code)
    const tokenEndpoint = 'https://open.tiktokapis.com/v2/oauth/token/'
    const data = qs.stringify({
      client_key: '...',
      client_secret: '...',
      code: decode,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    }

    const result = await axios.post(tokenEndpoint, data, { headers })
    // 토큰 만료 시간 확인을 위한 등록날짜 추가
    // 대한민국 시간대인 Asia/Seoul을 사용
    const koreaTime = moment().tz('Asia/Seoul')
    result.data.expires_createdAt = koreaTime.unix()
    console.log('result.data =', result.data)
    const config = {
      headers: {
        Authorization: `Bearer ${result.data.access_token}`,
        'Content-Type': 'application/json',
      },
    }
    const result2 = await axios.get(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
      config
    )
    console.log('result2.data =', result2.data)

    // 엑세스 토큰 저장
    const user = await User.findById(id)
    user.tiktok_user_info = result.data
    user.tiktok_account_info = result2.data.data.user
    await user.save()

    res.status(200).json({ code: 'SUCCESS', data: result2.data })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.code = async (req, res) => {
  try {
    const { id } = req.user
    console.log('vad token user id =', id)
    const { code } = req.body
    console.log('code =', code)
    if (!id || !code) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter code, vad userId are required',
      })
    }

    // 유효한 id인지 확인
    const existId = await User.exists({
      _id: id,
    })
    if (!existId) {
      return res.status(401).json({
        code: 'NONE_EXIST_USER',
        message: '존재하지 않는 사용자 입니다',
      })
    }

    const decode = decodeURI(code)
    const tokenEndpoint = 'https://open.tiktokapis.com/v2/oauth/token/'
    const data = qs.stringify({
      client_key: '...',
      client_secret: '...',
      code: decode,
      grant_type: 'authorization_code',
      redirect_uri: 'https://dashboard.vplate.io/auth/tiktok/callback/',
    })

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    }

    const result = await axios.post(tokenEndpoint, data, { headers })
    // 토큰 만료 시간 확인을 위한 등록날짜 추가
    // 대한민국 시간대인 Asia/Seoul을 사용
    const koreaTime = moment().tz('Asia/Seoul')
    result.data.expires_createdAt = koreaTime.unix()
    console.log('result.data =', result.data)

    const config = {
      headers: {
        Authorization: `Bearer ${result.data.access_token}`,
        'Content-Type': 'application/json',
      },
    }
    // console.log('config =', config)
    const result2 = await axios.get(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
      config
    )

    // 엑세스 토큰 저장
    const user = await User.findById(id)
    user.tiktok_user_info = result.data
    user.tiktok_account_info = result2.data.data.user
    await user.save()

    res.status(200).json({ code: 'SUCCESS', data: result2.data.data })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.codeLocalhost = async (req, res) => {
  try {
    const { id } = req.user
    console.log('vad token user id =', id)
    const { code } = req.body
    console.log('code =', code)
    if (!id || !code) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter code, vad userId are required',
      })
    }

    // 유효한 id인지 확인
    const existId = await User.exists({
      _id: id,
    })
    if (!existId) {
      return res.status(401).json({
        code: 'NONE_EXIST_USER',
        message: '존재하지 않는 사용자 입니다',
      })
    }

    const decode = decodeURI(code)
    const tokenEndpoint = 'https://open.tiktokapis.com/v2/oauth/token/'
    const data = qs.stringify({
      client_key: '...',
      client_secret: '...',
      code: decode,
      grant_type: 'authorization_code',
      redirect_uri: 'https://b643-221-146-217-122.ngrok-free.app/auth/tiktok/callback/',
    })

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    }

    const result = await axios.post(tokenEndpoint, data, { headers })
    // 토큰 만료 시간 확인을 위한 등록날짜 추가
    // 대한민국 시간대인 Asia/Seoul을 사용
    const koreaTime = moment().tz('Asia/Seoul')
    result.data.expires_createdAt = koreaTime.unix()
    console.log('result.data =', result.data)
    const config = {
      headers: {
        Authorization: `Bearer ${result.data.access_token}`,
        'Content-Type': 'application/json',
      },
    }
    // console.log('config =', config)
    const result2 = await axios.get(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
      config
    )

    // 엑세스 토큰 저장
    const user = await User.findById(id)
    user.tiktok_user_info = result.data
    user.tiktok_account_info = result2.data.data.user
    await user.save()

    res.status(200).json({ code: 'SUCCESS', data: result2.data.data })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.userInfo = async (req, res) => {
  try {
    const { id } = req.user
    console.log('vad token user id =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    // 엑세스토큰 처리
    const user = await User.findById(id)
    if (user.tiktok_user_info && user.tiktok_user_info.access_token) {
      console.log('user.tiktok_user_info.access_token =', user.tiktok_user_info.access_token)
      const checkTokenResult = await checkToken(user, id)
      if (checkTokenResult === 'expired') {
        return res.status(401).json({
          code: 'ACCESS_DENIED',
          message: '틱톡 엑세스 토큰이 만료되었습니다. 틱톡 계정연동을 다시 진행 해주세요',
        })
      } else if (checkTokenResult === 'param_err') {
        return res.status(401).json({
          code: 'MISSING_PARAM',
          message: 'parameter access_token, id are required',
        })
      } else if (checkTokenResult === 'update') {
        const user2 = await User.findById(id)
        user.tiktok_user_info = user2.tiktok_user_info
      }
    } else {
      return res.status(401).json({
        code: 'NONE_TIKTOK_ACCESS_TOKEN',
        message: '틱톡 엑세스 토큰이 없습니다. 틱톡 계정연동을 진행 해주세요',
      })
    }

    const url = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'
    const data = {}
    const headers = {
      Authorization: 'Bearer ' + user.tiktok_user_info.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    }
    const result = await axios.post(url, data, { headers })
    // console.log('result =', result)
    console.log('result.data =', result.data)

    // 틱톡 에러코드 처리 - http status code가 200 이면서 오류코드가 있는 경우
    if (result.data.error.code === 'spam_risk_too_many_posts') {
      res.status(400).json({
        code: 'spam_risk_too_many_posts',
        error:
          '해당 사용자는 하루에 API를 통해 게시할수 있는 한도에 도달했습니다. 내일 다시 시도해 주시거나 틱톡을 통해 게시물을 등록해주세요.',
      })
    } else if (result.data.error.code === 'spam_risk_user_banned_from_posting') {
      res.status(400).json({
        code: 'spam_risk_user_banned_from_posting',
        error: '해당 사용자는 새 게시물을 작성할 수 없습니다. 틱톡 계정에 로그인하여 계정상태를 확인해주세요.',
      })
    } else if (result.data.error.code === 'reach_active_user_cap') {
      res.status(400).json({
        code: 'reach_active_user_cap',
        error: '클라이언트의 활성 게시 사용자에 대한 일일 할당량에 도달했습니다.',
      })
    } else if (result.data.error.code === 'unaudited_client_can_only_post_to_private_accounts') {
      res.status(400).json({
        code: 'unaudited_client_can_only_post_to_private_accounts',
        error:
          '감사되지 않은 클라이언트는 개인 계정에만 게시할 수 있습니다. publish/*/init/를 호출하면 게시 시도가 차단됩니다.',
      })
    }

    // 정상처리시
    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    if (error.response) {
      // 서버가 응답을 반환했지만, 응답의 상태 코드가 200 범위를 벗어났을 때
      let errMessage = ''
      if (error.response.data.error.code === 'access_token_invalid') {
        errMessage = 'access_token가 잘못되었거나 만료되었습니다.'
      } else if (error.response.data.error.code === 'scope_not_authorized') {
        errMessage = 'access_token에 사용자 권한이 부여되지 않았습니다. (video.publish)'
      } else if (error.response.data.error.code === 'rate_limit_exceeded') {
        errMessage = 'API 속도 제한을 초과하여 요청이 차단되었습니다.'
      }
      res.status(error.response.status).json({ code: error.response.data.error.code, error: errMessage })
    } else {
      res.status(400).json({ code: 'ERROR', error: error.message })
    }
  }
}

exports.video = async (req, res) => {
  try {
    const { id } = req.user
    console.log('vad token user id =', id)
    const { post_info, source_info } = req.body
    console.log('post_info =', post_info)
    if (!id || !post_info || !source_info) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), post_info, source_info are required',
      })
    }

    // 엑세스토큰 처리
    const user = await User.findById(id)
    if (user.tiktok_user_info && user.tiktok_user_info.access_token) {
      console.log('user.tiktok_user_info.access_token =', user.tiktok_user_info.access_token)
      const checkTokenResult = await checkToken(user, id)
      if (checkTokenResult === 'expired') {
        return res.status(401).json({
          code: 'ACCESS_DENIED',
          message: '틱톡 엑세스 토큰이 만료되었습니다. 틱톡 계정연동을 다시 진행 해주세요',
        })
      } else if (checkTokenResult === 'param_err') {
        return res.status(401).json({
          code: 'MISSING_PARAM',
          message: 'parameter access_token, id are required',
        })
      } else if (checkTokenResult === 'update') {
        const user2 = await User.findById(id)
        user.tiktok_user_info = user2.tiktok_user_info
      }
    } else {
      return res.status(401).json({
        code: 'NONE_TIKTOK_ACCESS_TOKEN',
        message: '틱톡 엑세스 토큰이 없습니다. 틱톡 계정연동을 진행 해주세요',
      })
    }

    // 비디오 Direct Post
    // 참고: 각 사용자 access_token는 분당 6개의 요청으로 제한됩니다.
    const url = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
    const headers = {
      Authorization: 'Bearer ' + user.tiktok_user_info.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    }
    const data = {
      post_info: {
        title: post_info.title,
        privacy_level: post_info.privacy_level,
        disable_duet: post_info.disable_duet,
        disable_comment: post_info.disable_comment,
        disable_stitch: post_info.disable_stitch,
        video_cover_timestamp_ms: post_info.video_cover_timestamp_ms,
      },
      source_info: {
        source: source_info.source,
        video_url: source_info.video_url,
      },
    }
    const result = await axios.post(url, data, { headers })

    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    if (error.response) {
      // 서버가 응답을 반환했지만, 응답의 상태 코드가 200 범위를 벗어났을 때
      let errMessage = ''
      let errStatus = error.response.status
      if (error.response.data.error.code === 'access_token_invalid') {
        errMessage = 'access_token가 잘못되었거나 만료되었습니다.'
      } else if (error.response.data.error.code === 'scope_not_authorized') {
        errMessage = 'access_token에 사용자 권한이 부여되지 않았습니다. (video.publish)'
      } else if (error.response.data.error.code === 'rate_limit_exceeded') {
        errMessage = 'API 속도 제한을 초과하여 요청이 차단되었습니다.'
      } else if (error.response.data.error.code === 'spam_risk_too_many_posts') {
        errStatus = 400
        errMessage =
          '해당 사용자는 하루에 API를 통해 게시할수 있는 한도에 도달했습니다. 내일 다시 시도해 주시거나 틱톡을 통해 게시물을 등록해주세요.'
      } else if (error.response.data.error.code === 'spam_risk_user_banned_from_posting') {
        errStatus = 400
        errMessage = '해당 사용자는 새 게시물을 작성할 수 없습니다. 틱톡 계정에 로그인하여 계정상태를 확인해주세요.'
      } else if (error.response.data.error.code === 'reached_active_user_cap') {
        errStatus = 400
        errMessage = '클라이언트의 활성 게시 사용자에 대한 일일 할당량에 도달했습니다.'
      } else if (error.response.data.error.code === 'unaudited_client_can_only_post_to_private_accounts') {
        errStatus = 400
        errMessage =
          '감사되지 않은 클라이언트는 개인 계정에만 게시할 수 있습니다. publish/video/init/를 호출하면 게시 시도가 차단됩니다.'
      } else if (error.response.data.error.code === 'url_ownership_unverified') {
        errStatus = 400
        errMessage = '도메인의 소유권이 확인이 되지 않은 영상URL 입니다.'
      } else if (error.response.data.error.code === 'privacy_level_option_mismatch') {
        errStatus = 400
        errMessage = '동영상 시청 설정이 누락되었습니다. 영상 업로드 옵션을 확인해주세요.'
      } else if (error.response.data.error.code === 'invalid_params') {
        errStatus = 400
        errMessage = '요청 소스 정보가 비어 있거나 잘못되었습니다.'
      }
      res.status(errStatus).json({ code: error.response.data.error.code, error: errMessage })
    } else {
      res.status(400).json({ code: 'ERROR', error: error.message })
    }
  }
}

exports.status = async (req, res) => {
  try {
    const { id } = req.user
    console.log('vad token user id =', id)
    const { publish_id } = req.body
    console.log('publish_id =', publish_id)
    if (!id || !publish_id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), publish_id are required',
      })
    }

    // 엑세스토큰 처리
    const user = await User.findById(id)
    if (user.tiktok_user_info && user.tiktok_user_info.access_token) {
      console.log('user.tiktok_user_info.access_token =', user.tiktok_user_info.access_token)
      const checkTokenResult = await checkToken(user, id)
      if (checkTokenResult === 'expired') {
        return res.status(401).json({
          code: 'ACCESS_DENIED',
          message: '틱톡 엑세스 토큰이 만료되었습니다. 틱톡 계정연동을 다시 진행 해주세요',
        })
      } else if (checkTokenResult === 'param_err') {
        return res.status(401).json({
          code: 'MISSING_PARAM',
          message: 'parameter access_token, id are required',
        })
      } else if (checkTokenResult === 'update') {
        const user2 = await User.findById(id)
        user.tiktok_user_info = user2.tiktok_user_info
      }
    } else {
      return res.status(401).json({
        code: 'NONE_TIKTOK_ACCESS_TOKEN',
        message: '틱톡 엑세스 토큰이 없습니다. 틱톡 계정연동을 진행 해주세요',
      })
    }

    // 영상 게시물 등록 상태 확인
    const url = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
    const headers = {
      Authorization: 'Bearer ' + user.tiktok_user_info.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    }
    const data = {
      publish_id: publish_id,
    }
    const result = await axios.post(url, data, { headers })

    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    if (error.response) {
      // 서버가 응답을 반환했지만, 응답의 상태 코드가 200 범위를 벗어났을 때
      let errMessage = ''
      let errStatus = error.response.status
      if (error.response.data.error.code === 'access_token_invalid') {
        errMessage = 'access_token가 잘못되었거나 만료되었습니다.'
      } else if (error.response.data.error.code === 'scope_not_authorized') {
        errMessage = 'access_token에 사용자 권한이 부여되지 않았습니다. (video.publish)'
      } else if (error.response.data.error.code === 'rate_limit_exceeded') {
        errMessage = 'API 속도 제한을 초과하여 요청이 차단되었습니다.'
      } else if (error.response.data.error.code === 'spam_risk_too_many_posts') {
        errStatus = 400
        errMessage =
          '해당 사용자는 하루에 API를 통해 게시할수 있는 한도에 도달했습니다. 내일 다시 시도해 주시거나 틱톡을 통해 게시물을 등록해주세요.'
      } else if (error.response.data.error.code === 'spam_risk_user_banned_from_posting') {
        errStatus = 400
        errMessage = '해당 사용자는 새 게시물을 작성할 수 없습니다. 틱톡 계정에 로그인하여 계정상태를 확인해주세요.'
      } else if (error.response.data.error.code === 'reached_active_user_cap') {
        errStatus = 400
        errMessage = '클라이언트의 활성 게시 사용자에 대한 일일 할당량에 도달했습니다.'
      } else if (error.response.data.error.code === 'unaudited_client_can_only_post_to_private_accounts') {
        errStatus = 400
        errMessage =
          '감사되지 않은 클라이언트는 개인 계정에만 게시할 수 있습니다. publish/video/init/를 호출하면 게시 시도가 차단됩니다.'
      } else if (error.response.data.error.code === 'url_ownership_unverified') {
        errStatus = 400
        errMessage = '도메인의 소유권이 확인이 되지 않은 영상URL 입니다.'
      } else if (error.response.data.error.code === 'privacy_level_option_mismatch') {
        errStatus = 400
        errMessage = '동영상 시청 설정이 누락되었습니다. 영상 업로드 옵션을 확인해주세요.'
      }
      res.status(errStatus).json({ code: error.response.data.error.code, error: errMessage })
    } else {
      res.status(400).json({ code: 'ERROR', error: error.message })
    }
  }
}

exports.list = async (req, res) => {
  try {
    const { id } = req.user
    const { max_count, cursor } = req.body
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    // 엑세스토큰 처리
    const user = await User.findById(id)
    if (user.tiktok_user_info && user.tiktok_user_info.access_token) {
      console.log('user.tiktok_user_info.access_token =', user.tiktok_user_info.access_token)
      const checkTokenResult = await checkToken(user, id)
      if (checkTokenResult === 'expired') {
        return res.status(401).json({
          code: 'ACCESS_DENIED',
          message: '틱톡 엑세스 토큰이 만료되었습니다. 틱톡 계정연동을 다시 진행 해주세요',
        })
      } else if (checkTokenResult === 'param_err') {
        return res.status(401).json({
          code: 'MISSING_PARAM',
          message: 'parameter access_token, id are required',
        })
      } else if (checkTokenResult === 'update') {
        const user2 = await User.findById(id)
        user.tiktok_user_info = user2.tiktok_user_info
      }
    } else {
      return res.status(401).json({
        code: 'NONE_TIKTOK_ACCESS_TOKEN',
        message: '틱톡 엑세스 토큰이 없습니다. 틱톡 계정연동을 진행 해주세요',
      })
    }

    // 영상 게시물 리스트
    const url =
      'https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,embed_link'
    const headers = {
      Authorization: 'Bearer ' + user.tiktok_user_info.access_token,
      'Content-Type': 'application/json',
    }
    const data = {}
    if (max_count) data.max_count = max_count
    if (cursor) data.cursor = cursor
    const result = await axios.post(url, data, { headers })

    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    if (error.response) {
      // 서버가 응답을 반환했지만, 응답의 상태 코드가 200 범위를 벗어났을 때
      console.log('Error data.error:', error.response.data.error)
      let errMessage = ''
      let errStatus = error.response.status
      if (error.response.data.error.code === 'access_token_invalid') {
        errMessage = 'access_token가 잘못되었거나 만료되었습니다.'
      } else if (error.response.data.error.code === 'scope_not_authorized') {
        errMessage = 'access_token에 사용자 권한이 부여되지 않았습니다. (video.publish)'
      } else if (error.response.data.error.code === 'rate_limit_exceeded') {
        errMessage = 'API 속도 제한을 초과하여 요청이 차단되었습니다.'
      } else if (error.response.data.error.code === 'spam_risk_too_many_posts') {
        errStatus = 400
        errMessage =
          '해당 사용자는 하루에 API를 통해 게시할수 있는 한도에 도달했습니다. 내일 다시 시도해 주시거나 틱톡을 통해 게시물을 등록해주세요.'
      } else if (error.response.data.error.code === 'spam_risk_user_banned_from_posting') {
        errStatus = 400
        errMessage = '해당 사용자는 새 게시물을 작성할 수 없습니다. 틱톡 계정에 로그인하여 계정상태를 확인해주세요.'
      } else if (error.response.data.error.code === 'reached_active_user_cap') {
        errStatus = 400
        errMessage = '클라이언트의 활성 게시 사용자에 대한 일일 할당량에 도달했습니다.'
      } else if (error.response.data.error.code === 'unaudited_client_can_only_post_to_private_accounts') {
        errStatus = 400
        errMessage =
          '감사되지 않은 클라이언트는 개인 계정에만 게시할 수 있습니다. publish/video/init/를 호출하면 게시 시도가 차단됩니다.'
      } else if (error.response.data.error.code === 'url_ownership_unverified') {
        errStatus = 400
        errMessage = '도메인의 소유권이 확인이 되지 않은 영상URL 입니다.'
      } else if (error.response.data.error.code === 'privacy_level_option_mismatch') {
        errStatus = 400
        errMessage = '동영상 시청 설정이 누락되었습니다. 영상 업로드 옵션을 확인해주세요.'
      }
      res.status(errStatus).json({ code: error.response.data.error.code, error: errMessage })
    } else {
      res.status(400).json({ code: 'ERROR', error: error.message })
    }
  }
}

exports.accountDelete = async (req, res) => {
  try {
    const { id } = req.user
    console.log('vad token user id =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)
    console.log('user =', user)

    if (user.tiktok_user_info) {
      // delete user.fb_page_info
      await User.updateOne({ _id: id }, { $unset: { tiktok_user_info: '' } })
    }
    if (user.tiktok_account_info) {
      // delete user.fb_user_info
      await User.updateOne({ _id: id }, { $unset: { tiktok_account_info: '' } })
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Tiktok account removal complete',
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      message: e.message,
    })
  }
}
