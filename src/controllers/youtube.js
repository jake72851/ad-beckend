// const axios = require('axios')
const fs = require('fs')
const User = require('../models/users')

const wait = require('waait')

const { google } = require('googleapis')
const CLIENT_ID = '342481640978-cj1rj4csu3dsnmam6fk0qg23c7qsjggn.apps.googleusercontent.com'
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID, // Google Cloud에서 생성한 OAuth 2.0 클라이언트 ID
  '...', // 클라이언트 시크릿
  'postmessage'
)

//구글 사용자 엑세스 검증
async function googleCheckToken(token) {
  try {
    if (!token) return 'param_err'
    console.log('googleCheckToken > token =', token)

    // 액세스 토큰을 검증합니다.
    const ticket = await oauth2Client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID, // 클라이언트 ID와 일치해야 합니다.
    })

    const payload = ticket.getPayload()
    const userid = payload['sub']

    return 'passed'
  } catch (error) {
    console.log('googleCheckToken() > error !!!!= ', error)
  }
}

exports.auth = async (req, res) => {
  try {
    // 권한 범위 설정
    const scopes = [
      // 민감하지 않은 범위
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/yt-analytics.readonly', // YouTube Analytics API
      // 'https://www.googleapis.com/auth/youtube.download', // YouTube Data API v3

      // 민감한 범위 - 승인이 필요
      // 'https://www.googleapis.com/auth/youtube.readonly', // YouTube Data API v3 - YouTube 계정 보기
      'https://www.googleapis.com/auth/youtube', // YouTube Data API v3 - YouTube 계정 관리
      // 'https://www.googleapis.com/auth/youtube.force-ssl', // YouTube Data API v3 - YouTube 동영상, 평가, 댓글, 자막 보기, 수정 및 완전 삭제
      // 'https://www.googleapis.com/auth/youtube.upload', // YouTube Data API v3 - YouTube 동영상 관리
    ]

    // 인증 URL 생성
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
    })
    console.log('구글 로그인 url =', url)
    res.send('<a href="' + url + '">구글 로그인</a>')
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.authFront = async (req, res) => {
  try {
    // 권한 범위 설정
    const scopes = [
      // 민감하지 않은 범위
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/yt-analytics.readonly', // YouTube Analytics API
      // 'https://www.googleapis.com/auth/youtube.download', // YouTube Data API v3

      // 민감한 범위 - 승인이 필요
      // 'https://www.googleapis.com/auth/youtube.readonly', // YouTube Data API v3 - YouTube 계정 보기
      'https://www.googleapis.com/auth/youtube', // YouTube Data API v3 - YouTube 계정 관리
      // 'https://www.googleapis.com/auth/youtube.force-ssl', // YouTube Data API v3 - YouTube 동영상, 평가, 댓글, 자막 보기, 수정 및 완전 삭제
      // 'https://www.googleapis.com/auth/youtube.upload', // YouTube Data API v3 - YouTube 동영상 관리
    ]

    // 인증 URL 생성
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
    })
    console.log('구글 로그인 url =', url)
    res.status(200).json({ code: 'SUCCESS', data: url })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.oauth2callback = async (req, res) => {
  try {
    const { code } = req.query
    console.log('google code =', code)

    res.status(200).json({ code: 'SUCCESS', data: code })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.oauth2callback_backup = async (req, res) => {
  try {
    const { code } = req.query
    console.log('google code =', code)

    const codeResult = await oauth2Client.getToken(code)
    console.log('google codeResult =', codeResult)
    oauth2Client.setCredentials({
      access_token: codeResult.tokens.access_token,
      refresh_token: codeResult.tokens.refresh_token,
    })

    // 사용자 정보
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()
    console.log('google userInfo =', userInfo.data)

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
    console.log('google channelInfo = ', channelInfo)

    const channel = channelInfo[0] // 첫 번째 채널 정보
    console.log('google channel.id = ', channel.id)

    // video list
    const videoList = await youtube.search.list({
      part: 'snippet',
      channelId: channel.id,
      type: 'video',
      // maxResults: 2,
    })
    // console.log('videoList = ', videoList)
    console.log('videoList.data.items = ', videoList.data.items)

    res.status(200).json({ code: 'SUCCESS', data: 'ok' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.code = async (req, res) => {
  try {
    const { id } = req.user
    console.log('id =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const { code } = req.body
    console.log('youtubeCode > google code =', code)
    if (!code) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter code are required',
      })
    }

    const user = await User.findById(id)
    // console.log('user =', user)

    const codeResult = await oauth2Client.getToken(code)
    console.log('google codeResult =', codeResult)
    oauth2Client.setCredentials({
      access_token: codeResult.tokens.access_token,
      refresh_token: codeResult.tokens.refresh_token, // refresh_token은 최초 앱 설치시에만 한번만 확인 가능함
    })

    // 사용자 정보
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()
    console.log('google userInfo =', userInfo.data)

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
    console.log('google channelInfo = ', channelInfo)

    const responses = {
      google_token_info: codeResult.tokens,
      google_user_info: userInfo.data,
      youtube_channel_info: channelInfo,
    }

    // 토큰, 사용자 정보만 우선 저장. 채널은 프론트에서 선택후 저장
    user.google_token_info = codeResult.tokens
    user.google_user_info = userInfo.data

    const result = await user.save()
    console.log('계정연동 결과 정보 result =', result)

    res.status(200).json({ code: 'SUCCESS', data: responses })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.channelList = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token id =', id)

    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)

    res.status(200).json({ code: 'SUCCESS', data: [user.youtube_channel_info] })
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error })
  }
}

exports.mediaCreate = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token id =', id)

    console.log('req.body =', req.body)
    const { channelId, title, description, tags, privacyStatus, notifySubscribers } = req.body
    if (!id || !channelId || !title || !description || !tags || !privacyStatus || !notifySubscribers) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message:
          'parameter vad userId(jwt token), channelId, title, description, tags, privacyStatus, notifySubscribers are required',
      })
    }

    console.log('req.file =', req.file)
    if (!req.file.originalname) {
      return res.status(401).json({
        code: 'FILE_UPLOAD_ERROR',
        message: 'An error occurred while uploading the file. please try again.',
      })
    }
    const videoStream = fs.createReadStream(req.file.path)

    const user = await User.findById(id)

    // 토큰 정보 유무 확인
    if (
      !user.google_token_info ||
      !user.google_token_info.id_token ||
      !user.google_token_info.access_token ||
      !user.google_token_info.refresh_token
    ) {
      return res.status(401).json({
        code: 'NONE_ACCESS_TOKEN_INFO',
        message: 'There is no access token information. Please proceed with linking your Google account.',
      })
    }

    // 엑세스 토큰 만료시 감지하여 업데이트
    oauth2Client.on('tokens', async (tokens) => {
      // console.log('tokens!!!!!!!!!! = ', tokens)
      user.google_token_info.access_token = tokens.access_token
      user.google_token_info.scope = tokens.scope
      user.google_token_info.token_type = tokens.token_type
      user.google_token_info.id_token = tokens.id_token
      user.google_token_info.expiry_date = tokens.expiry_date
      if (tokens.refresh_token) user.google_token_info.refresh_token = tokens.refresh_token
      await user.save()
      console.log('mediaCreate > 엑세스 토큰 갱신 완료!!!')
    })

    // 토큰 설정 (이전에 OAuth 플로우를 완료하여 얻은 토큰)
    oauth2Client.setCredentials({
      access_token: user.google_token_info.access_token,
      refresh_token: user.google_token_info.refresh_token,
    })

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    })

    const uploadRes = await youtube.videos.insert({
      part: 'id,snippet,status',
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: title, // 비디오 제목
          description: description, // 비디오 설명
          tags: tags, // 비디오 태그
        },
        status: {
          privacyStatus: privacyStatus, // 비디오 공개 상태: 'private', 'public', 'unlisted'
        },
      },
      media: {
        body: videoStream,
      },
    })
    console.log('uploadRes =', uploadRes)

    // 영상 업로드 상태체크
    let uploadCheck = false
    while (!uploadCheck) {
      // video list
      const video = await youtube.videos.list({
        part: 'snippet,status',
        id: uploadRes.data.id,
      })
      const list = video.data.items[0]
      console.log('list =', list)

      if (list.status.uploadStatus === 'processed') uploadCheck = true
      if (
        list.status.uploadStatus === 'deleted' ||
        list.status.uploadStatus === 'failed' ||
        list.status.uploadStatus === 'rejected'
      ) {
        return res.status(401).json({
          code: 'VIDEO_UPLOAD_ERROR',
          message: 'Video upload failed. please try again',
        })
      }
      await wait(10000)
    }

    res.status(200).json({ code: 'SUCCESS', message: 'Video registration completed' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.mediaList = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token id =', id)

    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)
    // 토큰 정보 유무 확인
    if (
      !user.google_token_info ||
      !user.google_token_info.id_token ||
      !user.google_token_info.access_token ||
      !user.google_token_info.refresh_token
    ) {
      return res.status(401).json({
        code: 'NONE_ACCESS_TOKEN_INFO',
        message: 'There is no access token information. Please proceed with linking your Google account.',
      })
    }

    // 엑세스 토큰 만료시 감지하여 업데이트
    oauth2Client.on('tokens', async (tokens) => {
      // console.log('tokens!!!!!!!!!! = ', tokens)
      user.google_token_info.access_token = tokens.access_token
      user.google_token_info.scope = tokens.scope
      user.google_token_info.token_type = tokens.token_type
      user.google_token_info.id_token = tokens.id_token
      user.google_token_info.expiry_date = tokens.expiry_date
      if (tokens.refresh_token) user.google_token_info.refresh_token = tokens.refresh_token
      await user.save()
      console.log('mediaList > 엑세스 토큰 갱신 완료!!!')
    })

    // 토큰 설정 (이전에 OAuth 플로우를 완료하여 얻은 토큰)
    oauth2Client.setCredentials({
      access_token: user.google_token_info.access_token,
      refresh_token: user.google_token_info.refresh_token,
    })

    oauth2Client.on('tokens', (tokens) => {
      console.log('tokens = ', tokens)
      if (tokens.refresh_token) {
        // 새로운 refresh_token을 데이터베이스에 저장합니다!
        console.log('기존 tokens.refresh_token = ', tokens.refresh_token)
      }
    })

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    })

    if (!user.youtube_channel_info) {
      return res.status(401).json({
        code: 'NONE_CHANNEL_INFO',
        message: 'There is no channel information. Please proceed with linking your Google account.',
      })
    }

    // video list
    const videoList = await youtube.search.list({
      part: 'snippet',
      // channelId: user.youtube_channel_info.id,
      type: 'video',
      forMine: true,
      maxResults: 100,
    })
    console.log('videoList =', videoList)

    res.status(200).json({ code: 'SUCCESS', data: videoList.data.items })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.mediaInfo = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token id =', id)

    const { video_id } = req.query
    console.log('video_id =', video_id)

    if (!id || !video_id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), video_id are required',
      })
    }

    const user = await User.findById(id)
    // 토큰 정보 유무 확인
    if (
      !user.google_token_info ||
      !user.google_token_info.id_token ||
      !user.google_token_info.access_token ||
      !user.google_token_info.refresh_token
    ) {
      return res.status(401).json({
        code: 'NONE_ACCESS_TOKEN_INFO',
        message: 'There is no access token information. Please proceed with linking your Google account.',
      })
    }

    // 엑세스 토큰 만료시 감지하여 업데이트
    oauth2Client.on('tokens', async (tokens) => {
      // console.log('tokens!!!!!!!!!! = ', tokens)
      user.google_token_info.access_token = tokens.access_token
      user.google_token_info.scope = tokens.scope
      user.google_token_info.token_type = tokens.token_type
      user.google_token_info.id_token = tokens.id_token
      user.google_token_info.expiry_date = tokens.expiry_date
      if (tokens.refresh_token) user.google_token_info.refresh_token = tokens.refresh_token
      await user.save()
      console.log('mediaInfo > 엑세스 토큰 갱신 완료!!!')
    })

    // 토큰 설정 (이전에 OAuth 플로우를 완료하여 얻은 토큰)
    oauth2Client.setCredentials({
      access_token: user.google_token_info.access_token,
      refresh_token: user.google_token_info.refresh_token,
    })

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    })

    // video list
    const video = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: video_id,
      // maxResults: 100,
    })
    console.log('video =', video)

    res.status(200).json({ code: 'SUCCESS', data: video.data.items[0] })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.mediaEdit = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token id =', id)

    const { video_id, title, description, tags, privacyStatus, categoryId } = req.body
    console.log('req.body =', req.body)

    if (!id || !video_id || !title || !description || !tags || !privacyStatus || !categoryId) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message:
          'parameter vad userId(jwt token), video_id, title, description, tags, privacyStatus, categoryId are required',
      })
    }

    const user = await User.findById(id)
    // 토큰 정보 유무 확인
    if (
      !user.google_token_info ||
      !user.google_token_info.id_token ||
      !user.google_token_info.access_token ||
      !user.google_token_info.refresh_token
    ) {
      return res.status(401).json({
        code: 'NONE_ACCESS_TOKEN_INFO',
        message: 'There is no access token information. Please proceed with linking your Google account.',
      })
    }

    // 엑세스 토큰 만료시 감지하여 업데이트
    oauth2Client.on('tokens', async (tokens) => {
      // console.log('tokens!!!!!!!!!! = ', tokens)
      user.google_token_info.access_token = tokens.access_token
      user.google_token_info.scope = tokens.scope
      user.google_token_info.token_type = tokens.token_type
      user.google_token_info.id_token = tokens.id_token
      user.google_token_info.expiry_date = tokens.expiry_date
      if (tokens.refresh_token) user.google_token_info.refresh_token = tokens.refresh_token
      await user.save()
      console.log('mediaEdit > 엑세스 토큰 갱신 완료!!!')
    })

    // 토큰 설정 (이전에 OAuth 플로우를 완료하여 얻은 토큰)
    oauth2Client.setCredentials({
      access_token: user.google_token_info.access_token,
      refresh_token: user.google_token_info.refresh_token,
    })

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    })

    const result = await youtube.videos.update({
      part: 'snippet,status',
      notifySubscribers: false,
      requestBody: {
        id: video_id,
        snippet: {
          categoryId: categoryId,
          title: title, // 비디오 제목
          description: description, // 비디오 설명
          tags: tags, // 비디오 태그
        },
        status: {
          privacyStatus: privacyStatus, // 비디오 공개 상태: 'private', 'public', 'unlisted'
        },
      },
    })
    console.log('result =', result)

    res.status(200).json({ code: 'SUCCESS', message: 'Video editing completed' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.mediaDelete = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token id =', id)

    const { video_id } = req.body
    console.log('req.body =', req.body)

    if (!id || !video_id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token), video_id are required',
      })
    }

    const user = await User.findById(id)
    // 토큰 정보 유무 확인
    if (
      !user.google_token_info ||
      !user.google_token_info.id_token ||
      !user.google_token_info.access_token ||
      !user.google_token_info.refresh_token
    ) {
      return res.status(401).json({
        code: 'NONE_ACCESS_TOKEN_INFO',
        message: 'There is no access token information. Please proceed with linking your Google account.',
      })
    }

    // 엑세스 토큰 만료시 감지하여 업데이트
    oauth2Client.on('tokens', async (tokens) => {
      // console.log('tokens!!!!!!!!!! = ', tokens)
      user.google_token_info.access_token = tokens.access_token
      user.google_token_info.scope = tokens.scope
      user.google_token_info.token_type = tokens.token_type
      user.google_token_info.id_token = tokens.id_token
      user.google_token_info.expiry_date = tokens.expiry_date
      if (tokens.refresh_token) user.google_token_info.refresh_token = tokens.refresh_token
      await user.save()
      console.log('mediaDelete > 엑세스 토큰 갱신 완료!!!')
    })

    // 토큰 설정 (이전에 OAuth 플로우를 완료하여 얻은 토큰)
    oauth2Client.setCredentials({
      access_token: user.google_token_info.access_token,
      refresh_token: user.google_token_info.refresh_token,
    })

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    })

    const result = await youtube.videos.delete({
      id: video_id,
    })
    console.log('result =', result)

    // 영상 삭제 상태체크
    let uploadCheck = false
    while (!uploadCheck) {
      // video list
      const video = await youtube.videos.list({
        part: 'snippet,contentDetails,statistics',
        id: video_id,
        // maxResults: 100,
      })
      console.log('video =', video)
      if (video.data.items.length === 0) uploadCheck = true
      await wait(10000)
    }

    res.status(200).json({ code: 'SUCCESS', message: 'Video deletion complete' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.report = async (req, res) => {
  try {
    const { id } = req.user
    console.log('token id =', id)

    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(jwt token) are required',
      })
    }

    const user = await User.findById(id)
    // 토큰 정보 유무 확인
    if (
      !user.google_token_info ||
      !user.google_token_info.id_token ||
      !user.google_token_info.access_token ||
      !user.google_token_info.refresh_token
    ) {
      return res.status(401).json({
        code: 'NONE_ACCESS_TOKEN_INFO',
        message: 'There is no access token information. Please proceed with linking your Google account.',
      })
    }

    // 토큰 설정 (이전에 OAuth 플로우를 완료하여 얻은 토큰)
    oauth2Client.setCredentials({
      access_token: user.google_token_info.access_token,
      refresh_token: user.google_token_info.refresh_token,
    })

    if (!user.youtube_channel_info) {
      return res.status(401).json({
        code: 'NONE_CHANNEL_INFO',
        message: 'There is no channel information. Please proceed with linking your Google account.',
      })
    }

    const youtubeAnalytics = google.youtubeAnalytics('v2')

    const report = await youtubeAnalytics.reports.query({
      auth: oauth2Client,
      ids: `channel==${user.youtube_channel_info.id}`,
      metrics: 'views',
      dimensions: 'video',
    })

    res.status(200).json({ code: 'SUCCESS', data: report.data })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
