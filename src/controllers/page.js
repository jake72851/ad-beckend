const wait = require('waait')
const adsSdk = require('facebook-nodejs-business-sdk')
const Page = adsSdk.Page
const PagePost = adsSdk.PagePost

const axios = require('axios')
const fs = require('fs')
const FormData = require('form-data')

const User = require('../models/users')

const accessToken = process.env.FB_LONG_ACCESS_TOKEN

//페이스북 페이지 엑세스 토큰 확인
async function checkToken(token, userId, pageId) {
  console.log('checkToken > pageId =', pageId)
  if (!token || !userId || !pageId) {
    return 'param_err'
  }
  const appToken = '...'
  const url = `https://graph.facebook.com/v18.0/debug_token?input_token=${token}&access_token=${appToken}`
  const result = await axios.get(url)
  console.log('checkToken > result.data.data.is_valid =', result.data.data.is_valid)

  if (!result.data.data.is_valid) {
    const user = await User.findById(userId)
    console.log('checkToken > user =', user)

    if (user.fb_page_info) {
      const tempArr = []
      for (const item of user.fb_page_info) {
        if (item.id !== pageId) tempArr.push(item)
      }
      user.fb_page_info = [...tempArr]
      await user.save()
    }
    return 'expired'
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
        code: 'facebook page info not found',
        message: 'Please link your facebook page',
      })
    } else {
      res.status(200).json({ code: 'SUCCESS', data: [user.fb_page_info] })
    }
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.id = async (req, res) => {
  try {
    const { user_id, access_token } = req.body
    console.log('user_id =', user_id)
    console.log('access_token =', access_token)
    const { id } = req.user
    console.log('id =', id)
    if (!user_id || !access_token || !id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter user_id, access_token, id are required',
      })
    }

    const url = 'https://graph.facebook.com/v18.0/' + user_id + '/accounts?access_token=' + access_token
    const result = await axios.get(url)
    console.log('result =', result)
    console.log('result.data.paging =', result.data.paging)

    res.status(200).json({ code: 'SUCCESS', data: result.data.data })
  } catch (error) {
    console.log(error)
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

    // 엑세스토큰 처리
    const checkTokenResult = await checkToken(access_token, id, page_id)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook page access token has expired. Please try linking the Facebook page again',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, url, access_token are required',
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
    console.log('result.data =', result.data)

    res.status(200).json({ code: 'SUCCESS', message: '페이지 게시 완료' })
  } catch (error) {
    console.log(error)
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

    // 엑세스토큰 처리
    const checkTokenResult = await checkToken(access_token, id, page_id)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook page access token has expired. Please try linking the Facebook page again',
      })
    } else if (checkTokenResult === 'param_err') {
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
    console.log('result.data =', result.data)
    // result.data = { id: '347764637938409', post_id: '101969912155163_347764651271741' }

    res.status(200).json({ code: 'SUCCESS', message: '페이지 게시 완료' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.createVideo = async (req, res) => {
  try {
    const { id } = req.user
    const { page_id, access_token } = req.body
    console.log('page_id =', page_id)
    console.log('access_token =', access_token)

    console.log('req.file =', req.file)

    const file = req.file
    if (!page_id || !id || !file || !access_token) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, file, access_token are required',
      })
    }

    // 엑세스토큰 처리
    const checkTokenResult = await checkToken(access_token, id, page_id)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook page access token has expired. Please try linking the Facebook page again',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, url, access_token are required',
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
    const result = await axios.post(reqUrl, form, { headers, maxContentLength: 1073741824, maxBodyLength: 1073741824 })
    console.log('result.data =', result.data)

    // 게시물이 등록되는데 시간이 걸리므로 게시물 리스트에서 나오는지 확인한다.
    let statusCheck = true
    while (statusCheck) {
      await wait(4000)
      const url =
        'https://graph.facebook.com/v18.0/' +
        result.data.id +
        '?fields=id,updated_time,published,created_time,post_id,status&access_token=' +
        access_token
      const postResult = await axios.get(url)
      console.log('postResult.data.status =', postResult.data.status)
      if (postResult.data.status.publishing_phase.status === 'complete') statusCheck = false
    }
    console.log('비디오 게시물 업로드 확인 완료!')

    res.status(200).json({ code: 'SUCCESS', message: '페이지 게시 완료' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.postList = async (req, res) => {
  try {
    const { id } = req.user
    const { page_id, access_token } = req.query
    if (!page_id || !id || !access_token) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, access_token are required',
      })
    }

    // 엑세스토큰 처리
    const checkTokenResult = await checkToken(access_token, id, page_id)
    if (checkTokenResult === 'expired') {
      return res.status(401).json({
        code: 'ACCESS_DENIED',
        message: 'The facebook page access token has expired. Please try linking the Facebook page again',
      })
    } else if (checkTokenResult === 'param_err') {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter page_id, id, url, access_token are required',
      })
    }

    const url =
      'https://graph.facebook.com/v18.0/' + page_id + '/feed?fields=message,attachments&access_token=' + access_token
    const result = await axios.get(url)
    const resData = result.data.data

    const responseData = []
    for (const resItem of resData) {
      const tempObject = {}
      tempObject.id = resItem.id
      if (resItem.message) {
        tempObject.message = resItem.message
      }
      tempObject.mediaData = []
      if (resItem.attachments && resItem.attachments.data) {
        const temp = {}
        for (const attItem of resItem.attachments.data) {
          temp.type = attItem.type
          temp.media = attItem.media
          tempObject.mediaData.push(temp)
        }
      }
      responseData.push(tempObject)
    }
    res.status(200).json({ code: 'SUCCESS', data: responseData })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
