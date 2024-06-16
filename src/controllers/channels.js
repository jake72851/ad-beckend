const request = require('request')
const moment = require('moment')

const User = require('../models/users')
const CONF = require('../../config')

exports.insights = async(req, res) => {
  const { page_id, date_preset, time_range, filtering } = req.query
  try {
    if(!page_id) throw 'USERID_UNDEFINED'
    const user = await User.findOne({fb_page_id: page_id})
    const result = await channelsLevel(page_id, date_preset, time_range, filtering, user.fb_ad_account_id, user.fb_access_token)
    if(JSON.stringify(result).indexOf('error') != -1) return res.json({code: result.error, data: null})

    return res.json({
      code: 'SUCCESS',
      data: result
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: error,
      data: null
    })
  }
}

function channelsLevel(page_id,date_preset, time_range, filtering, accountId = null, accessToken = null){
  //console.log(filtering)
  const userAccountId = accountId && accessToken ? accountId : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken = accountId && accessToken ? accessToken : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId + '/insights',
    qs: {
      level: 'account',
      fields:'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,actions',
      //filtering,
      access_token: userAccessToken
    }
  }
  if(accountId === 'act_2607869862847972') options.qs.filtering = filtering
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      let result = JSON.parse(body).data
      let fieldsList = (options.qs.fields).split(',')
      let data = {}
       console.log('body : ' + body) 
	    console.log('res : '+JSON.stringify(response))
      if(result && result.length < 1){
        for(let field of fieldsList){
          if(field == 'actions'){
            data['offsite_conversion.fb_pixel_purchase'] = null
          }else{
            data[field] = null
          }
        }
        data['error'] = 'DATA_NOT_FOUND'
      }else{
        data['offsite_conversion.fb_pixel_purchase'] = null
        for(let field of fieldsList){
          if(body.indexOf(field) == -1) {
            data[field] = null
            continue
          }
          if(field == 'actions'){
            if(!result[0].actions) continue
            for(let action of result[0].actions){
              if(action.action_type == 'offsite_conversion.fb_pixel_purchase'){
                data['offsite_conversion.fb_pixel_purchase'] = action.value
                break
              }
            }
          }else if(!result[0][field]) data[field] = null
          else if( typeof result[0][field] == 'object'){
            data[field] = result[0][field][0].value
          }else{
            data[field] = result[0][field]
          }
        }
      }
      resolve(data)
    })
  })
}

exports.increments = async(req, res) => {
  const { page_id, field, time_range, filtering} = req.query
  try {
    if(!page_id) throw 'USERID_UNDEFINED'
    const user = await User.findOne({fb_page_id: page_id})
    const result = await insightsIncrements(page_id, field, time_range, filtering, user.fb_ad_account_id, user.fb_access_token)    
    if(!!result.error) throw result.error
    return res.json({
      code: 'SUCCESS',
      data: result
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: error,
      data: null
    })
  }
}

async function insightsIncrements(page_id, field, time_range, filtering, accountId = null, accessToken = null){
  //console.log(page_id, field, time_range, filtering)
  const userAccountId = accountId && accessToken ? accountId : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken = accountId && accessToken ? accessToken : CONF.fb_info.FB_LONG_ACCESS_TOKEN
	let options = {
    uri: CONF.api_url.uri + userAccountId + '/insights',
    qs: {
      level: 'account',
      fields: field,
      //filtering,
      access_token: userAccessToken
    }
  }

  if(accountId === 'act_2607869862847972') options.qs.filtering = filtering
  if(time_range) options.qs.time_range = time_range
  let timeIncrement = 1
  let time_rangeJson = {
    since: moment().subtract(6, 'days').format('YYYY-MM-DD').toString(),
    until: moment().format('YYYY-MM-DD').toString()
  }
  let standard
  let during
  try {
    if(!!time_range){
      time_rangeJson = JSON.parse(time_range)
      if(!time_rangeJson) throw 'TIME_RANGE_INVAILID'
	    
      standard = time_rangeJson.since
      during = moment(time_rangeJson.until).diff(moment(time_rangeJson.since), 'days')
    
      if(during <= 60){
        timeIncrement = 1
      }else if(during <= 365){
        timeIncrement = 7
      }else{
        timeIncrement = 'monthly'
      }
    }else{
      let dateJson = await checkDate(userAccountId, userAccessToken, page_id)
      during = moment(dateJson.until).diff(moment(dateJson.since), 'days')
      standard = dateJson.since
            
      if(during <= 60){
        timeIncrement = 1
      }else if(during <= 365){
        timeIncrement = 7
      }else{
        timeIncrement = 'monthly'
      }
    }
        
    options.qs.time_increment = timeIncrement
    return new Promise (function (resolve, reject){
      request.get(options, async function (err, response, body) {
        if (err) reject(err)
        let results = JSON.parse(body).data
        let data = []
                
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

        if(timeIncrement == 'monthly'){   // monthly
          let resultLength = moment(time_rangeJson.until).startOf('month').diff(moment(time_rangeJson.since).startOf('month'), 'months') + 1
          for(let i = 0; i < resultLength; i++){
            let input = {
              date: moment(standard).add(i, 'month').startOf('month').format('YYYY-MM-DD'),
              dateStr: moment(standard).add(i, 'month').startOf('month').format('MMM YYYY')
            }
            input[field] = 0
            data.push(input)
          }
	if(results){
          for(let result of results){
            for(let d of data){
              if(moment(result.date_start).startOf('month').format('YYYY-MM-DD').toString() === moment(d.date).startOf('month').format('YYYY-MM-DD').toString()){
                d[field] = result[field]
                break
              }
            }
          }
	}
        }else{  // 1 or 7
          let resultLength = during / timeIncrement + 1
                    
          for(let i = 0; i < resultLength + 1; i++){
            if(moment(standard).add(timeIncrement * i, 'days').format('YYYY-MM-DD').toString() > moment(time_rangeJson.until).format('YYYY-MM-DD').toString()){
              break
            }
            let input = {
              date: moment(standard).add(timeIncrement * i, 'days').format('YYYY-MM-DD'),
              dateStr: moment(standard).add(timeIncrement * i, 'days').format('MMM DD')
            }
            input[field] = 0
            data.push(input)
          }
	if(results){
          for(let result of results){
            for(let d of data){
              if(moment(result.date_start).format('YYYY-MM-DD').toString() === moment(d.date).format('YYYY-MM-DD').toString()){
                d[field] = result[field]
                break
              }
            }
          }
	}
	}
        resolve(data)
      })
    })
  } catch (error) {
    console.log(error)
    return {error: error}
  }
}

function checkDate(accountId = null, accessToken = null, page_id, filtering){
  let options = {
    uri: CONF.api_url.uri + accountId + '/insights',
    qs: {
      level: 'account',
      fields:'date_start,date_stop',
      //filtering,
      access_token: accessToken
    }
  }
if(accountId === 'act_2607869862847972') options.qs.filtering = filtering
  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      if(body.indexOf('date_start') == -1){
        date = {
          since: moment().subtract(6, 'days').format('YYYY-MM-DD').toString(),
          until: moment().format('YYYY-MM-DD').toString()
        }
      }else {
        date = {
          since: JSON.parse(body).data[0].date_start,
          until: JSON.parse(body).data[0].date_stop
        }
      }
      resolve(date)
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
