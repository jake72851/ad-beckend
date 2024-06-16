const request = require('request')

const User = require('../models/users')
const CONF = require('../../config')


exports.insights = async(req, res) => {
  const { adset_id, date_preset, time_range, filtering } = req.query

  try {
    if(!adset_id) return res.status(400).json({code: 'ADSET_ID_UNDEFINED', data: null})
        
    let ads = await adsLevel(adset_id, date_preset, time_range, filtering)
    if(JSON.stringify(ads).indexOf('error') != -1) return res.json({code: ads[0].error, data: null})

    let insights = await insightsLevel(adset_id, date_preset, time_range, filtering)

    for(let insight of insights){
      for(let ad of ads){
        if(ad.id == insight.ad_id){
          let keys = Object.keys(ad)
          for(let key of keys){
            if(key == 'id') continue
            insight[key] = ad[key]
          }
        }
      }
    }
    console.log('?')
    return res.json({
      code: 'SUCCESS',
      data: insights
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: 'FAIL',
      data: error
    })
  }
}

function insightsLevel(adset_id, date_preset, time_range, filtering){
  let options = {
    uri: `${CONF.api_url.uri}/${adset_id}/insights`,
    qs: {
      level: 'ad',
      fields:'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,ad_id,ad_name,actions',
      access_token: CONF.fb_info.FB_LONG_ACCESS_TOKEN,
      //filtering,
    }
  }
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    console.log(options)
    request.get(options, async function (err, response, body) {
      if (err) reject(err)
      let results = JSON.parse(body).data
      let fieldsList = (options.qs.fields).split(',')
      let data = []
      if(!results){
        let input = {}
        for(let field of fieldsList){
          if(field == 'actions') continue
          input[field] = null
        }
        input['offsite_conversion.fb_pixel_purchase'] = null
        input['error'] = 'DATA_NOT_FOUND'
        data.push(input)
      }else{
        let nextUrl = JSON.parse(body).paging.next
                
        while(!!nextUrl){
          let nextResult = await next(nextUrl)
          for(let next of nextResult.data){
            results.push(next)
          }
          if(!!nextResult.paging.next){
            nextUrl = nextResult.paging.next
          }else{
            break
          }
        }

        for(let result of results){
          let input = {}
          input['offsite_conversion.fb_pixel_purchase'] = null
          for(let field of fieldsList){
            if(field == 'actions'){
              if(!result.actions) continue
              for(let action of result.actions){
                if(action.action_type == 'offsite_conversion.fb_pixel_purchase'){
                  input['offsite_conversion.fb_pixel_purchase'] = action.value
                  break
                }
              }
            }else if(!result[field]) input[field] = null
            else if( typeof result[field] == 'object'){
              input[field] = result[field][0].value
            }else{
              input[field] = result[field]
            }
          }
          data.push(input)
        }
      }
      resolve(data)
    })
  })
}

function adsLevel(adset_id, date_preset, time_range, filtering){
  let options = {
    uri: `${CONF.api_url.uri}/${adset_id}/ads`,
    qs: {
      level: 'ad',
      fields:'status,daily_budget,targeting{publisher_platforms},adcreatives{object_story_spec{video_data}}',
      //filtering,
      access_token: CONF.fb_info.FB_LONG_ACCESS_TOKEN
    }
  }
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, async function (err, response, body) {
      if (err) reject(err)
      let results = JSON.parse(body).data
      let fieldsList = options.qs.fields.split(',')
      let data = []
            
      if(!!JSON.parse(body).error){
        let input = {}
        for(let field of fieldsList){
          if(field == 'targeting{publisher_platforms}' || field == 'adcreatives{object_story_spec{video_data}}') continue
          input[field] = null
        }
        input['channels'] = null
        input['video_id'] = null
        input['thumbnail_uri'] = null
        input['image_url'] = null
        input['error'] = 'DATA_NOT_FOUND'
        data.push(input)
      }else{
        let nextUrl = JSON.parse(body).paging.next
                
        while(!!nextUrl){
          let nextResult = await next(nextUrl)
          for(let next of nextResult.data){
            results.push(next)
          }
          if(!!nextResult.paging.next){
            nextUrl = nextResult.paging.next
          }else{
            break
          }
        }

        let thumbnailsData = await adThumbnails(adset_id)
                
        fieldsList.push('id')
        for(let result of results){
          let input = {}
          for(let field of fieldsList){
            if( field == 'targeting{publisher_platforms}'){
              if(result.targeting){
                if(!result.targeting.publisher_platforms) input['channels'] = null
                else input['channels'] = result.targeting.publisher_platforms
              }else{
                input['channels'] = null
              }
            }else if( field == 'adcreatives{object_story_spec{video_data}}'){
              input['video_id'] = null
              input['thumbnail_uri'] = null
              input['image_url'] = null
              if(!!result.adcreatives.data[0].object_story_spec){
                if(!!result.adcreatives.data[0].object_story_spec.video_data.image_url) input['image_url'] = result.adcreatives.data[0].object_story_spec.video_data.image_url
                if(!!result.adcreatives.data[0].object_story_spec.video_data.video_id){
                  input['video_id'] = result.adcreatives.data[0].object_story_spec.video_data.video_id
                  for(let thumbnails of thumbnailsData){
                    if(thumbnails.id == input.video_id){
                      input['thumbnail_uri'] = thumbnails.uri
                      break
                    }
                  }
                }
              }
            }else{
              if(!result[field]) input[field] = null
              else if( typeof result[field] == 'object'){
                input['channels'] = result[field][0].value
              }else{
                input[field] = result[field]
              }
            }
          }
          data.push(input)
        }
      }
      resolve(data)
    })
  })
}

exports.creativesInsights = async(req, res) => {
  const { filtering, date_preset, time_range, page_id } = req.query
  try {
    if(!filtering) return res.status(400).json({code: 'PAGE_ID_UNDEFINED', data: null})
// need to fix
    let ads = await creativesAdsLevel(page_id, filtering, date_preset, time_range)
    if(JSON.stringify(ads).indexOf('error') != -1) return res.json({code: ads[0].error, data: null})

    let insights = await creativesInsightsLevel(page_id, filtering, date_preset, time_range)
        
    for(let insight of insights){
      for(let ad of ads){
        if(ad.id == insight.ad_id){
          let keys = Object.keys(ad)
          for(let key of keys){
            if(key == 'id') continue
            insight[key] = ad[key]
          }
        }
      }
    }

    return res.json({
      code: 'SUCCESS',
      data: insights
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: error,
      data: null
    })
  }
}

async function creativesInsightsLevel(page_id, filtering, date_preset, time_range){
  if(!page_id) throw 'PAGE_ID_UNDEFINED'
  const user = await User.findOne({fb_page_id: page_id})
  const userAccountId = user.fb_ad_account_id && user.fb_access_token ? user.fb_ad_account_id : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken = user.fb_ad_account_id && user.fb_access_token ? user.fb_access_token : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: `${CONF.api_url.uri}/${userAccountId}/insights`,
    qs: {
      level: 'ad',
      fields:'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,ad_id,ad_name,actions',
      //filtering,
      access_token: userAccessToken
    }
  }
  if(userAccountId === 'act_2607869862847972') options.qs.filtering = filtering
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, async function (err, response, body) {
      if (err) reject(err)
      let results = JSON.parse(body).data
      let fieldsList = (options.qs.fields).split(',')
      let data = []
      if(!results){
        let input = {}
        for(let field of fieldsList){
          if(field == 'actions') continue
          input[field] = null
        }
        input['offsite_conversion.fb_pixel_purchase'] = null
        input['error'] = 'DATA_NOT_FOUND'
        data.push(input)
      }else{
        let nextUrl = !!JSON.parse(body).paging ? JSON.parse(body).paging.next : null
                
        while(!!nextUrl){
          let nextResult = await next(nextUrl)
          for(let next of nextResult.data){
            results.push(next)
          }
          if(!!nextResult.paging.next){
            nextUrl = nextResult.paging.next
          }else{
            break
          }
        }

        for(let result of results){
          let input = {}
          input['offsite_conversion.fb_pixel_purchase'] = null
          for(let field of fieldsList){
            if(field == 'actions'){
              if(!result.actions) continue
              for(let action of result.actions){
                if(action.action_type == 'offsite_conversion.fb_pixel_purchase'){
                  input['offsite_conversion.fb_pixel_purchase'] = action.value
                  break
                }
              }
            }else if(!result[field]) input[field] = null
            else if( typeof result[field] == 'object'){
              input[field] = result[field][0].value
            }else{
              input[field] = result[field]
            }
          }
          data.push(input)
        }
      }
      resolve(data)
    })
  })
}

async function creativesAdsLevel(page_id, filtering, date_preset, time_range){
  if(!page_id) throw 'PAGE_ID_UNDEFINED'
  const user = await User.findOne({fb_page_id: page_id})
  const userAccountId = user.fb_ad_account_id && user.fb_access_token ? user.fb_ad_account_id : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken = user.fb_ad_account_id && user.fb_access_token ? user.fb_access_token : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId + '/ads',
    qs: {
      level: 'ad',
      fields:'status,daily_budget,targeting{publisher_platforms},adcreatives{object_story_spec{video_data}}',
      access_token: userAccessToken
    }
  }
  if(userAccountId === 'act_2607869862847972') options.qs.filtering = filtering
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, async function (err, response, body) {
      if (err) reject(err)
      let results = JSON.parse(body).data
      let fieldsList = options.qs.fields.split(',')
      let data = []
            
      if(JSON.stringify(results).indexOf('id') == -1){
        let input = {}
        for(let field of fieldsList){
          if(field == 'actions') continue
          input[field] = null
        }
        input['offsite_conversion.fb_pixel_purchase'] = null
        input['error'] = 'DATA_NOT_FOUND'
        data.push(input)
      }else{
        let nextUrl = !!JSON.parse(body).paging ? JSON.parse(body).paging.next : null
                
        while(!!nextUrl){
          let nextResult = await next(nextUrl)
          for(let next of nextResult.data){
            results.push(next)
          }
          if(!!nextResult.paging.next){
            nextUrl = nextResult.paging.next
          }else{
            break
          }
        }

        let thumbnailsData = await adThumbnailsForCreatives(userAccountId, userAccessToken)

        fieldsList.push('id')
        for(let result of results){
          let input = {}
          for(let field of fieldsList){
            if( field == 'targeting{publisher_platforms}'){
              if(result.targeting){
                if(!result.targeting.publisher_platforms) input['channels'] = null
                else input['channels'] = result.targeting.publisher_platforms
              }else{
                input['channels'] = null
              }
            }else if( field == 'adcreatives{object_story_spec{video_data}}'){
              input['video_id'] = null
              input['thumbnail_uri'] = null
              input['image_url'] = null
              if(!!result.adcreatives.data[0].object_story_spec){
                if(!!result.adcreatives.data[0].object_story_spec.video_data.image_url) input['image_url'] = result.adcreatives.data[0].object_story_spec.video_data.image_url
                if(!!result.adcreatives.data[0].object_story_spec.video_data.video_id){
                  input['video_id'] = result.adcreatives.data[0].object_story_spec.video_data.video_id
                                    
                  if(JSON.stringify(thumbnailsData).indexOf('error') != -1){
                    input['thumbnail_uri'] = null
                  }else{
                    for(let thumbnails of thumbnailsData){
                      if(thumbnails.id == input.video_id){
                        input['thumbnail_uri'] = thumbnails.uri
                        break
                      }
                    }
                  }
                }
              }
            }else{
              if(!result[field]) input[field] = null
              else if( typeof result[field] == 'object'){
                input['channels'] = result[field][0].value
              }else{
                input[field] = result[field]
              }
            }
          }
          data.push(input)
        }
      }
      resolve(data)
    })
  })
}

function adThumbnailsForCreatives(accountId, accessToken){
  let options = {
    uri: CONF.api_url.uri + accountId + '/advideos',
    qs: {
      fields: 'thumbnails{uri,is_preferred}',
      access_token: accessToken
    }
  }

  return new Promise (function (resolve, reject){
    request.get(options, async function (err, response, body) {
      if(err) reject(err)

      let results = JSON.parse(body).data
      let data = []
            
      if(!results) {
        let input = {'error': 'THUMBNAIL_DATA_NOT_FOUND'}
        data.push(input)
      }else{
        let nextUrl = JSON.parse(body).paging.next
                
        while(!!nextUrl){
          let nextResult = await next(nextUrl)
          for(let next of nextResult.data){
            results.push(next)
          }
          if(!!nextResult.paging.next){
            nextUrl = nextResult.paging.next
          }else{
            break
          }
        }

        for(let result of results){
          let input = {
            id: result.id,
            uri: ''
          }
          for(let thumbnail of result.thumbnails.data){
            if(thumbnail.is_preferred){
              input.uri = thumbnail.uri
              break
            }
          }
          data.push(input)
        }
      }
      resolve(data)
    })
  })
}

function adThumbnails(adset_id){
  const accountId = CONF.fb_info.FB_ACCOUNT_ID
  let options = {
    uri: `${CONF.api_url.uri}/${adset_id}/advideos`,
    qs: {
      fields: 'thumbnails{uri,is_preferred}',
      access_token: CONF.fb_info.FB_LONG_ACCESS_TOKEN
    }
  }

  return new Promise (function (resolve, reject){
    request.get(options, async function (err, response, body) {
      if(err) reject(err)

      let results = JSON.parse(body).data
      let data = []
            
      if(!results) {
        let input = {'error': 'THUMBNAIL_DATA_NOT_FOUND'}
        data.push(input)
      }else{
        let nextUrl = JSON.parse(body).paging.next
                
        while(!!nextUrl){
          let nextResult = await next(nextUrl)
          for(let next of nextResult.data){
            results.push(next)
          }
          if(!!nextResult.paging.next){
            nextUrl = nextResult.paging.next
          }else{
            break
          }
        }

        for(let result of results){
          let input = {
            id: result.id,
            uri: ''
          }
          for(let thumbnail of result.thumbnails.data){
            if(thumbnail.is_preferred){
              input.uri = thumbnail.uri
              break
            }
          }
          data.push(input)
        }
      }
      resolve(data)
    })
  })
}

function next(nextUrl){
  let options = {
    uri: nextUrl
  }
  return new Promise (function (resolve, reject){
    request.get(options, async function (err, response, body) {
      if (err) reject(err)
      let result = {
        data: JSON.parse(body).data,
        paging: {
          next: JSON.parse(body).paging.next
        }
      }
      resolve(result)
    })
  })
}
