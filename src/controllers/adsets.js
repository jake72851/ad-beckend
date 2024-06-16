const request = require('request')

const CONF = require('../../config')


exports.insights = async(req, res) => {
  const { campaign_id, date_preset, time_range, filtering } = req.query
  try {
    if(!campaign_id) throw 'CAMPAIGNID_UNDEFINED'
    let adsets = await adsetsLevel(campaign_id, date_preset, time_range, filtering)
    if(JSON.stringify(adsets).indexOf('error') != -1) return res.json({code: adsets[0].error, data: null})
    let insights = await insightsLevel(campaign_id, date_preset, time_range, filtering)

    if(!insights.length || !adsets.length) return res.json({code:'DATA_NOT_FOUND', data:null})
        
    for(let insight of insights){
      for(let adset of adsets){
        if(adset.id == insight.adset_id){
          let keys = Object.keys(adset)
          for(let key of keys){
            if(key == 'id') continue
            insight[key] = adset[key]
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
      code: 'FAIL',
      data: error
    })
  }
}

function insightsLevel(campaign_id, date_preset, time_range, filtering){
  let options = {
    uri: CONF.api_url.uri + campaign_id + '/insights',
    qs: {
      // time_range: {since:'2021-11-27',until:'2021-12-27'},
      level: 'adset',
      fields:'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,adset_id,adset_name,actions',
      //filtering,
      access_token: CONF.fb_info.FB_LONG_ACCESS_TOKEN
    }
  }
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      let results = JSON.parse(body).data
      let fieldsList = (options.qs.fields).split(',')
      let data = []
      console.log(results)
      if(!results){
        let input = {}
        for(let field of fieldsList){
          if(field == 'actions'){
            input['offsite_conversion.fb_pixel_purchase'] = null
          }else{
            input[field] = null
          }
        }
        input['error'] = 'DATA_NOT_FOUND'
        data.push(input)
      }else{
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
function adsetsLevel(campaign_id, date_preset, time_range, filtering){
  let options = {
    uri: CONF.api_url.uri + campaign_id + '/adsets',
    qs: {
      level: 'adset',
      fields:'status,daily_budget,ads{targeting{publisher_platforms}}',
      //filtering,
      access_token: CONF.fb_info.FB_LONG_ACCESS_TOKEN
    }
  }
  if(time_range) options.qs.time_range = time_range
  else if(date_preset) options.qs.date_preset = date_preset

  return new Promise (function (resolve, reject){
    request.get(options, function (err, response, body) {
      if (err) reject(err)
      let results = JSON.parse(body).data
      let fieldsList = (options.qs.fields).split(',')
      let data = []
      console.log(results)
      if(!results){
        let input = {}
        for(let field of fieldsList){
          if( field == 'ads{targeting{publisher_platforms}}'){
            input['channels'] = null
          }else{
            input[field] = null
          }
        }
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
              continue
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
