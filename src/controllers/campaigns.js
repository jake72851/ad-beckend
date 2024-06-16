const request = require('request')
const moment = require('moment')
const momentTZ = require('moment-timezone')

const User = require('../models/users')
const CONF = require('../../config')

exports.insights = async(req, res) => {
  const { page_id, date_preset, time_range, filtering } = req.query
  try {
    if(!page_id) throw 'PAGE_ID_UNDEFINED'
    const user = await User.findOne({fb_page_id: page_id})
    let campaigns = await campaignsLevel(page_id,date_preset, time_range, filtering, user.fb_ad_account_id, user.fb_access_token)
    if(JSON.stringify(campaigns).indexOf('error') != -1) return res.json({code: campaigns[0].error, data: null})
    let insights = await insightsLevel(page_id,date_preset, time_range, filtering, user.fb_ad_account_id, user.fb_access_token)
    if(JSON.stringify(insights).indexOf('error') != -1) return res.json({code: insights[0].error, data: null})
        
    for(let campaign of campaigns){
      for(let insight of insights){
        if(campaign.id == insight.campaign_id){
          let keys = Object.keys(insight)
          for(let key of keys){
            if(key == 'id') continue
            campaign[key] = insight[key]
          }
        }
      }
    }

    return res.json({
      code: 'SUCCESS',
      data: campaigns//insights
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: 'FAIL',
      data: error
    })
  }
}

function campaignsLevel(page_id,date_preset, time_range, filtering, accountId = null, accessToken = null){
  const userAccountId = accountId && accessToken ? accountId : 'act_' +CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken = accountId && accessToken ? accessToken : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId  + '/campaigns',
    qs: {
      level: 'campaign',
      fields:'status,daily_budget,ads{targeting{publisher_platforms}},objective',
      access_token: userAccessToken
    }
  }
  if(accountId === 'act_2607869862847972') options.qs.filtering = filtering
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) {
        console.log(err)
        reject(err)
        return
      }
      console.log(JSON.parse(body))
	    let results = JSON.parse(body).data
      let fieldsList = (options.qs.fields).split(',')
      let data = []
      console.log('function campaignsLevel : ' + results)
      if(!results[0]){
        let input = {}
        for(let field of fieldsList){
          if( field == 'ads{targeting{publisher_platforms}}') continue
          input[field] = null
        }
        input['channels'] = null
        input['error'] = 'DATA_NOT_FOUND'
        data.push(input)
      }else{
        fieldsList.push('id')
        for(let result of results){
          let input = {}
          for(let field of fieldsList){
            if( field == 'ads{targeting{publisher_platforms}}'){
              if(result.ads.data[0].targeting){
                if(!result.ads.data[0].targeting.publisher_platforms) input['channels'] = null
                else input['channels'] = result.ads.data[0].targeting.publisher_platforms
              }else {
                input['channels'] = null
              }
            }
            if(!result[field]) input[field] = null
            else if( typeof result[field] == 'object'){
              input['channels'] = result[field][0].value
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


function insightsLevel(page_id, date_preset, time_range, filtering, accountId = null, accessToken = null){
  const userAccountId = accountId && accessToken ? accountId : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken = accountId && accessToken ? accessToken : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId + '/insights',
    qs: {
      level: 'campaign',
      fields:'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,campaign_id,campaign_name,actions,objective',
      access_token: userAccessToken
    }
  }
  if(accountId === 'act_2607869862847972') options.qs.filtering = filtering
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      let results = JSON.parse(body).data
      let fieldsList = (options.qs.fields).split(',')
      let data = []
      console.log('function insightsLevel : ' + results)
      if(!results || !results[0]){
        let input = {}
        for(let field of fieldsList){
          if(field == 'actions') continue
          input[field] = null
        }
        input['offsite_conversion.fb_pixel_purchase'] = null
        input['error'] = 'DATA_NOT_FOUND'
        data.push(input)
      }else{
	      console.log('objective : '+results[0].objective)
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

















async function campaignsList(start, end, accountId = null, accessToken = null){
  const userAccountId = accountId && accessToken ? accountId : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken = accountId && accessToken ? accessToken : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId + '/campaigns',
    qs: {
      // time_range: {since:'2021-11-27',until:'2021-12-27'},
      fields: 'name,daily_budget,insights{reach,spend,clicks,cpc,ctr,impressions,objective},ads{targeting{publisher_platforms}}',
      limit: 10,
      access_token: userAccessToken
    }
  }
  if(!!start && !!end) options.qs.time_range = {since: start, until: end}
  else if(!!start && !end){
    let today = momentTZ.tz(moment(), 'Asia/Seoul').format('YYYY-MM-DD').toString()
    options.qs.time_range = {since: start, until: today}
  }
  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      let data = []
      for(let campaign of JSON.parse(body).data){
        if(page_id === campaign.ads.data[0].adcreatives.data[0].object_story_spec.page_id){
          let input = {
            name : campaign.name,
            daily_budget : campaign.daily_budget,
            insights : {
              reach: campaign.insights.data[0].reach,
              spend: campaign.insights.data[0].spend,
              clicks: campaign.insights.data[0].clicks,
              cpc: campaign.insights.data[0].cpc,
              ctr: campaign.insights.data[0].ctr,
              impressions: campaign.insights.data[0].impressions,
              objective: campaign.insights.data[0].objective
            },
            page_id : campaign.ads.data[0].adcreatives.data[0].object_story_spec.page_id
          }
          data.push(input)
        }
      }
      if(JSON.parse(body).paging.next){
        data.push({next : JSON.parse(body).paging.next})
      }
      resolve(data)
    })
  })
}

async function campaignsNext(nextUrl){
  let options = {
    uri: nextUrl
  }
   
  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      let data = []
      for(let campaign of JSON.parse(body).data){
        if(page_id === campaign.ads.data[0].adcreatives.data[0].object_story_spec.page_id){
          let input = {
            name : campaign.name,
            daily_budget : campaign.daily_budget,
            insights : {
              reach: campaign.insights.data[0].reach,
              spend: campaign.insights.data[0].spend,
              clicks: campaign.insights.data[0].clicks,
              cpc: campaign.insights.data[0].cpc,
              ctr: campaign.insights.data[0].ctr,
              impressions: campaign.insights.data[0].impressions,
              objective: campaign.insights.data[0].objective
            },
            page_id : campaign.ads.data[0].adcreatives.data[0].object_story_spec.page_id
          }
          data.push(input)
        }
      }
      if(JSON.parse(body).paging.next){
        console.log(JSON.parse(body).paging.next)
        data.push({next : JSON.parse(body).paging.next})
      }
      resolve(data)
    })
  })
}

exports.list = async(req, res) => {
  const { start, end }= req.params
  try {
    if(!page_id) throw 'PAGEID_UNDEFINED'
    const user = await User.findOne({fb_page_id: page_id})
    let campaigns = await campaignsList(start, end, user.fb_ad_account_id, user.fb_access_token)
        
    if(!!campaigns[campaigns.length - 1].next){
      let next = true
      let nextUrl = campaigns[campaigns.length - 1].next
      while(next){
        let nextCampaigns = await campaignsNext(page_id, nextUrl)
        for(let nextCampaign of nextCampaigns){
          campaigns.push(nextCampaign)
        }
        if(!nextCampaigns[nextCampaigns.length - 1].next) break
        else nextUrl = nextCampaigns[nextCampaigns.length - 1].next
      }
    }
        
    return res.json({
      code: 'SUCCESS',
      data: campaigns 
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: 'FAIL',
      data: error
    })
  }
}


function campaignInsights(campaignId, page_id, start, end){
  const accountId = CONF.fb_info.FB_ACCOUNT_ID
  let options = {
    uri: CONF.api_url.uri + accountId + '/campaigns',
    qs: {
      // time_range: {since:'2021-11-27',until:'2021-12-27'},
      fields: 'name,daily_budget,insights{reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,objective}',
      filters: [{field:'id',value:campaignId,operator:'EQUAL'}],
      limit: 10,
      access_token: CONF.fb_info.FB_LONG_ACCESS_TOKEN
    }
  }
  if(!!start && !!end) options.qs.time_range = {since: start, until: end}
  else if(!!start && !end){
    let today = momentTZ.tz(moment(), 'Asia/Seoul').format('YYYY-MM-DD').toString()
    options.qs.time_range = {since: start, until: today}
  }
  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      let data = []
            
      for(let campaign of JSON.parse(body).data){
        if(page_id === campaign.ads.data[0].adcreatives.data[0].object_story_spec.page_id){
          let input = {
            name : campaign.name,
            daily_budget : campaign.daily_budget,
            insights : {
              reach: campaign.insights.data[0].reach,
              spend: campaign.insights.data[0].spend,
              clicks: campaign.insights.data[0].clicks,
              cpc: campaign.insights.data[0].cpc,
              ctr: campaign.insights.data[0].ctr,
              impressions: campaign.insights.data[0].impressions,
              objective: campaign.insights.data[0].objective
            },
            page_id : campaign.ads.data[0].adcreatives.data[0].object_story_spec.page_id
          }
          data.push(input)
        }
      }
      if(JSON.parse(body).paging.next){
        data.push({next : JSON.parse(body).paging.next})
      }else{
        data.push({next : null})
      }
      resolve(data)
    })
  })
}

exports.detail = async(req, res) => {
  const { page_id, campaignId, start, end }= req.params
    
  try {
    if(!page_id || !campaignId) throw 'PAGEID_OR_CAMPAIGNID_NOT_EXITST'
    let campaigns = await campaignInsights(campaignId, page_id, start, end)
        
    if(campaigns[campaigns.length - 1].next != null){
      let next = true
      let nextUrl = campaigns[campaigns.length - 1].next
      while(next){
        let nextCampaigns = await campaignsNext(page_id, nextUrl)
        for(let nextCampaign of nextCampaigns){
          campaigns.push(nextCampaign)
        }
        if(!nextCampaigns[nextCampaigns.length - 1].next) break
        else nextUrl = nextCampaigns[nextCampaigns.length - 1].next
      }
    }

    return res.json({
      code: 'SUCCESS',
      data: campaigns 
    })
  } catch (error) {
    console.log(error)
    return res.json({
      code: 'FAIL',
      data: error
    })
  }
}
