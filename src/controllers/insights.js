const adsSdk = require('facebook-nodejs-business-sdk')
const moment = require('moment')
const url = require('url')
const fs = require('fs')
const axios = require('axios')

const CONF = require('../../config')
const { fetchUADatas, fetchGoals } = require('../lib/ga')
const { breakdownMetaData, action_attribution_windows, adLevelFieldList, breakdownList } = require('../lib/res')
const { dataToExcel } = require('../lib/excelHelper')
const User = require('../models/users')
const Insights = require('../models/insights')

const AdAccount = adsSdk.AdAccount

const adStructure = ['account', 'campaign', 'adset', 'ad']
const accessToken = CONF.fb_info.FB_LONG_ACCESS_TOKEN
const API = adsSdk.FacebookAdsApi.init(accessToken)
API.setDebug(true)

const { google } = require('googleapis')
const CLIENT_ID = '...'
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID, 
  '...', // 클라이언트 시크릿
  'postmessage'
)

exports.FBinsightsAll = async (req, res) => {
  const { accountID, fields, adLevel, hierarchy, breakdowns = '', filtering = '[]', time_range, limit } = req.query

  try {
    if (!accountID)
      return res.status(400).json({ code: 'AD_ACCOUNT_ID_NOT_FOUND', message: 'AdAccount가 명시되어있지 않습니다.' })
    const accountId = `act_${accountID}`
    const account = new AdAccount(accountId)
    const breakdownArr = breakdowns.split(',')
    const breakdown = breakdownArr[Number(hierarchy)]
    const metaData = breakdownMetaData[breakdown]
    const params = { filtering, time_range }
    if (limit) params.limit = limit
    let level = adLevel
    if (metaData.type === 'level') {
      level = breakdown
      params.level = breakdown
    } else {
      if (metaData.type === 'breakdown') params.breakdowns = [breakdown]
      else if (metaData.type === 'period') params.time_increment = metaData.time_increment
    }
    breakdownArr.splice(0, hierarchy).forEach((item) => {
      if (breakdownMetaData[item].type === 'breakdown') {
        if (!params.breakdowns) params.breakdowns = [item]
        else params.breakdowns.push(item)
      }
    })
    if (params.breakdowns) params.breakdowns = JSON.stringify(params.breakdowns)
    if (!level) {
      level = 'account'
    }
    const adLevelFields = ['id', 'name']
    const insightsFields = [`${level}_id`, 'actions', 'cost_per_action_type']
    const gaFields = []

    const tempField = fields.split(',')
    const filteredField = tempField.filter((item) => {
      return !item.includes('actions|') && !item.includes('cost_per_action_type|')
    })
    filteredField.forEach((field) => {
      if (field.includes('ga:')) gaFields.push(field)
      else if (adLevelFieldList.includes(field)) {
        if (level === 'account') return
        adLevelFields.push(field)
      } else insightsFields.push(field)
    })

    if (!insightsFields.includes('optimization_goal')) insightsFields.push('optimization_goal')

    if (level === 'ad') {
      adLevelFields.push('adcreatives{object_story_spec{video_data}}')
    }
    let insightsData = []
    let adLevelData = []
    const parsedFiltering = JSON.parse(filtering)
    let insightss = await account.getInsights(insightsFields, { ...params, action_attribution_windows })
    insightsData = [...insightsData, ...insightss]
    while (insightss.hasNext()) {
      insightss = await insightss.next()
      insightsData = [...insightsData, ...insightss]
    }
    const adLevelFiltering = parsedFiltering.filter(
      (item) => !breakdownList.includes(item.field) && item.field !== 'action_type'
    )
    adLevelFiltering.push({
      field: 'id',
      operator: 'IN',
      value: insightsData.map((insights) => insights._data[`${level}_id`]),
    })
    params.filtering = adLevelFiltering
    if (level === 'account') {
      const accountData = await account.get(adLevelFields, params)
      adLevelData = [...adLevelData, accountData]
    } else {
      let adLevels = null
      if (level === 'campaign') {
        adLevelFields.push('objective')
        adLevels = await account.getCampaigns(adLevelFields, params)
      } else if (level === 'adset') {
        adLevelFields.push('promoted_object')
        adLevelFields.push('campaign{objective}')
        adLevels = await account.getAdSets(adLevelFields, params)
      } else if (level === 'ad') {
        adLevelFields.push('adset{promoted_object}')
        adLevelFields.push('campaign{objective}')
        adLevels = await account.getAds(adLevelFields, params)
      } else {
        res.status(400).json({ code: 'WRONG_ADLEVEL_INFO', message: 'adLevel 값이 잘못되었습니다.' })
        return
      }
      adLevelData = [...adLevelData, ...adLevels]
      while (adLevels.hasNext()) {
        adLevels = await adLevels.next()
        adLevelData = [...adLevelData, ...adLevels]
      }
    }
    let gaData = {}
    if (gaFields.length) {
      gaData = await fetchUADatas(gaFields, time_range, level, breakdown)
    }

    // 결과값 정제
    const result = insightsData.map((insights) => {
      let obj = { ...insights._data }
      const adLevelObj = adLevelData.find((adLevel) => {
        return adLevel._data.id === insights._data[`${level}_id`]
      })
      if (adLevelObj) {
        const tempParams = {}
        if (level === 'campaign') {
          tempParams.objective = adLevelObj.objective
        } else if (level === 'adset') {
          tempParams.objective = adLevelObj.campaign.objective
          tempParams.promoted_object = adLevelObj.promoted_object
        } else if (level === 'ad') {
          tempParams.objective = adLevelObj.campaign.objective
          tempParams.promoted_object = adLevelObj.adset.promoted_object
        }
        obj = { ...insights._data, ...adLevelObj._data, ...tempParams }
      }

      if (gaFields.length) {
        try {
          let identifier = ''
          if (level === 'account') {
            if (metaData.type === 'period') {
              if (breakdown === 'period_weekly') {
                identifier = moment(obj.date_start).week() - 1
              } else if (breakdown === 'period_daily') {
                identifier = moment(obj.date_start).format('YYYYMMDD')
              }
            } else if (level === 'level') {
              identifier = 'all'
            }
          } else if (obj.name) {
            const tempArr = obj.name.split('_')
            if (tempArr.length >= 1) {
              if (level === 'campaign') identifier = tempArr[0]
              else if (level === 'adset') identifier = tempArr.slice(0, 2).join('_')
              else if (level === 'ad') identifier = tempArr.slice(0, 3).join('_')
            }
          }
          if (identifier !== '') {
            Object.keys(gaData).some((viewId) => {
              const rowsData = gaData[viewId]
              if (rowsData[identifier]) {
                Object.keys(rowsData[identifier]).forEach(
                  (gaField) => (obj[`${gaField}|${viewId}`] = rowsData[identifier][gaField])
                )
              }
            })
          }
        } catch (e) {
          console.log(e)
        }
      }

      if (obj.actions) {
        obj.actions.forEach((action) => {
          Object.keys(action).forEach((key) => {
            const data = action[key]
            const tempFieldName = `actions|${action.action_type}|${key}`
            if (tempField.includes(tempFieldName)) {
              obj[tempFieldName] = data
            }
          })
        })
      }

      if (obj.cost_per_action_type) {
        obj.cost_per_action_type.forEach((action) => {
          Object.keys(action).forEach((key) => {
            const data = action[key]
            const tempFieldName = `cost_per_action_type|${action.action_type}|${key}`
            if (tempField.includes(tempFieldName)) obj[`cost_per_action_type|${action.action_type}|${key}`] = data
          })
        })
      }

      // 결과값 파싱
      if (obj.objective) {
        obj.result = parseResult(obj)
      }

      if (obj.video_avg_time_watched_actions) {
        obj.video_avg_time_watched_actions = obj.video_avg_time_watched_actions[0].value
      }
      if (obj.purchase_roas) {
        obj.purchase_roas = obj.purchase_roas[0].value
      }
      if (obj.adcreatives) {
        obj.thumbnail_uri = obj.adcreatives.data[0].object_story_spec.video_data.image_url
      }

      if (metaData.type === 'period') {
        const strDate = breakdown === 'period_daily' ? obj.date_start : `${obj.date_start} ~ ${obj.date_stop}`
        obj.id = strDate
        obj.name = strDate
      } else if (metaData.type === 'breakdown') {
        obj.id = obj[breakdown]
        obj.name = obj[breakdown]
      }
      return obj
    })
    return res.json({
      code: 'SUCCESS',
      data: result,
    })
  } catch (error) {
    console.log(error)
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      error,
    })
  }
}

exports.fetchActions = async (req, res) => {
  const { accountID, filtering = '[]', time_range, mode } = req.query

  const result = {}
  if (!mode || mode === 'FB_ONLY') {
    if (!accountID)
      return res.status(400).json({ code: 'AD_ACCOUNT_ID_NOT_FOUND', message: 'AdAccount가 명시되어있지 않습니다.' })
    const accountId = `act_${accountID}`
    const account = new AdAccount(accountId)
    const fields = ['actions', 'cost_per_action_type']
    const params = { filtering, time_range, action_attribution_windows }
    let insightss = await account.getInsights(fields, params)
    const actionSet = new Set()
    const cpaSet = new Set()
    insightss.forEach((item) => {
      if (item.actions) {
        item.actions.forEach((action) => {
          Object.keys(action).forEach((key) => {
            if (key !== 'action_type') {
              actionSet.add(`actions|${action.action_type}|${key}`)
            }
          })
        })
      }
      if (item.cost_per_action_type) {
        item.cost_per_action_type.forEach((action) => {
          Object.keys(action).forEach((key) => {
            if (key !== 'action_type') {
              cpaSet.add(`cost_per_action_type|${action.action_type}|${key}`)
            }
          })
        })
      }
    })
    const actions = Array.from(actionSet)
    const cpas = Array.from(cpaSet)
    result.fbActions = [...actions, ...cpas]
  }

  if (!mode || mode === 'GA_ONLY') {
    let gaGoals = []
    const dbResult = await User.findById(req.id).select('ga_properties')
    await Promise.all(
      dbResult.ga_properties.map((item) =>
        fetchGoals(item.account_id, item.property_id, item.property_name, item.view_id)
      )
    ).then((result) => {
      if (result && result.length > 0) gaGoals = result[0]
    })
    result.gaGoals = gaGoals
  }

  res.json({
    code: 'SUCCESS',
    data: result,
  })
}

exports.downloadExcel = async (req, res) => {
  const excelData = req.body
  const filename = `result${moment().format('YYYYMMDDhhmmss')}.xlsx`
  const filePath = await dataToExcel(excelData, filename)
  res.download(filePath, filename, function (err) {
    if (err) {
      console.log(err)
    }
    fs.unlink(filePath, function () {
      console.log(`${filePath} deleted`)
    })
  })
}

const optimizationGoalMap = {
  NONE: 'none',
  APP_INSTALLS: 'app_install',
  IMPRESSIONS: 'impressions',
  LINK_CLICKS: 'clicks',
  OFFSITE_CONVERSIONS: 'offsite_conversion',
  PAGE_LIKES: 'like',
  POST_ENGAGEMENT: 'post_engagement',
  REACH: 'reach',
  LANDING_PAGE_VIEWS: 'landing_page_view',

  AD_RECALL_LIFT: '',
  ENGAGED_USERS: '',
  EVENT_RESPONSES: '',
  LEAD_GENERATION: '',
  QUALITY_LEAD: '',
  QUALITY_CALL: '',
  VISIT_INSTAGRAM_PROFILE: '',
  VALUE: '',
  THRUPLAY: '',
  DERIVED_EVENTS: '',
  APP_INSTALLS_AND_OFFSITE_CONVERSIONS: '',
  CONVERSATIONS: '',
  IN_APP_VALUE: '',
}

const customEventTypeMap = {
  ADD_TO_CART: 'offsite_conversion.fb_pixel_add_to_cart',
  ADD_TO_WISHLIST: 'offsite_conversion.fb_pixel_add_to_wishlist',
  INITIATED_CHECKOUT: 'offsite_conversion.fb_pixel_initiate_checkout',
  ADD_PAYMENT_INFO: 'offsite_conversion.fb_pixel_add_payment_info',
  PURCHASE: 'offsite_conversion.fb_pixel_purchase',
  LEAD: 'offsite_conversion.fb_pixel_lead',
  COMPLETE_REGISTRATION: 'offsite_conversion.fb_pixel_complete_registration',
  CONTENT_VIEW: 'offsite_conversion.fb_pixel_view_content',
  SEARCH: 'offsite_conversion.fb_pixel_search',
  RATE: 'offsite_conversion.fb_pixel_custom',
  TUTORIAL_COMPLETION: 'offsite_conversion.fb_pixel_custom',
  CONTACT: 'offsite_conversion.fb_pixel_custom',
  CUSTOMIZE_PRODUCT: 'offsite_conversion.fb_pixel_custom',
  DONATE: 'offsite_conversion.fb_pixel_custom',
  FIND_LOCATION: 'offsite_conversion.fb_pixel_custom',
  SCHEDULE: 'offsite_conversion.fb_pixel_custom',
  START_TRIAL: 'offsite_conversion.fb_pixel_custom',
  SUBMIT_APPLICATION: 'offsite_conversion.fb_pixel_custom',
  SUBSCRIBE: 'offsite_conversion.fb_pixel_custom',
  SERVICE_BOOKING_REQUEST: 'offsite_conversion.fb_pixel_custom',
  MESSAGING_CONVERSATION_STARTED_7D: 'offsite_conversion.fb_pixel_custom',
  LEVEL_ACHIEVED: 'offsite_conversion.fb_pixel_custom',
  ACHIEVEMENT_UNLOCKED: 'offsite_conversion.fb_pixel_custom',
  SPENT_CREDITS: 'offsite_conversion.fb_pixel_custom',
  LISTING_INTERACTION: 'offsite_conversion.fb_pixel_custom',
  D2_RETENTION: 'offsite_conversion.fb_pixel_custom',
  D7_RETENTION: 'offsite_conversion.fb_pixel_custom',
  OTHER: 'offsite_conversion.fb_pixel_custom',
}

const parseResult = (data) => {
  let result = {
    field: '',
    value: null,
  }
  if (!data.objective || !data.optimization_goal || data.optimization_goal === 'NONE') return result

  if (data.objective === 'CONVERSIONS' && data.promoted_object && data.actions) {
    const field = customEventTypeMap[data.promoted_object.custom_event_type]
    const action = data.actions.find((item) => item.action_type === field)
    result = {
      field,
      value: Number(action?.value || '0'),
    }
  } else {
    const field = optimizationGoalMap[data.optimization_goal]
    result = {
      field,
      value: data[field],
    }
  }
  return result
}

const request = require('request')

const basic = {
  Status: 'status',
  // Channels
  // Results
  // CPR - insight cpr
  // CVR
  // Ad spend - insight spend
  Budget: 'daily_budget',
  // Level
  // Ad account
  // Campaign ID
  'Bid strategy': 'bid_strategy',
  'Bid cap': 'bid_amount',
  // "Objective":"objective", - insight objective
  Starts: 'start_time',
  Ends: 'end_time',
  'Result indicator': 'optimization_goal',
  // Campaign

  'Budget Remaining': 'budget_remaining',
  'Buying Type': 'buying_type',
  'Billing Event': 'billing_event',
  Targeting: 'targeting',
  'Conversion Domain': 'conversion_domain',
  'Preview Shareable Link': 'preview_shareable_link',
  'Video ID': 'adcreatives{object_story_spec{video_data{video_id}}}',
  'Video Title': 'adcreatives{object_story_spec{video_data{title}}}',
  'Video Message': 'adcreatives{object_story_spec{video_data{message}}}',
  'Video Link Description': 'adcreatives{object_story_spec{video_data{link_description}}}',
  'Call To Action': 'adcreatives{object_story_spec{video_data{call_to_action}}}',
  'Image Url': 'adcreatives{object_story_spec{video_data{image_url}}}',
}
const insight = {
  //Click performance
  CPC: 'cpc',
  CTR: 'ctr',
  'Clicks (all)': 'clicks',
  'Outbound Clicks': 'outbound_clicks',
  'Outbound CTR': 'outbound_clicks_ctr',
  'Cost per Outbound Clicks': 'cost_per_outbound_click',
  'Website CTR': 'website_ctr',
  //Reach performance
  Impressions: 'impressions',
  CPM: 'cpm',
  Reach: 'reach',
  Frequency: 'frequency',

  Objective: 'objective',
  //Video performance
  'Video played to 25% (Views)': 'video_p25_watched_actions',
  'Video played to 50% (Views)': 'video_p50_watched_actions',
  'Video played to 75% (Views)': 'video_p75_watched_actions',
  'Video played to 100% (Views)': 'video_p100_watched_actions',
  'Video avg_time_watched_actions': 'video_avg_time_watched_actions',

  'Ad spend': 'spend',
  'Ad account': 'account_id',
  'Campaign ID': 'campaign_id',
  'Campaign Name': 'campaign_name',
  'Adset ID': 'adset_id',
  'Adset Name': 'adset_name',
  'Ad ID': 'ad_id',
  'Ad Name': 'ad_name',
  Objective: 'objective',
  'Purchase ROAS': 'purchase_roas',
  CPP: 'cpp',
  'Website Purchase ROAS': 'website_purchase_roas',
}

const action = {
  //Click performance
  'Link clicks': 'link_click', // 링크 클릭

  //Engagement
  'Post saves': 'onsite_conversion.post_save',
  'Post shares': 'post', // 포스트 공유
  //Engagement - x
  'Post comments': 'comment', // 댓글 게시
  'Post reactions': 'post_reaction', // 포스트 반응
  'Page engagement': 'page_engagement', // 페이지 참여
  'Post engagement': 'post_engagement', // 참여

  //Conversion performance

  'App fb_mobile_achievement_unlocked': 'app_custom_event.fb_mobile_achievement_unlocked', // 모바일 앱 기능 잠금 해제
  'App fb_mobile_activate_app': 'app_custom_event.fb_mobile_activate_app', // 모바일 앱 시작
  'App fb_mobile_add_payment_info': 'app_custom_event.fb_mobile_add_payment_info', // 모바일 앱 결제 세부 정보
  'App fb_mobile_add_to_cart': 'app_custom_event.fb_mobile_add_to_cart', // 모바일 앱 장바구니에 추가
  'App fb_mobile_add_to_wishlist': 'app_custom_event.fb_mobile_add_to_wishlist', // 모바일 앱 위시리스트에 추가
  'App fb_mobile_complete_registration': 'app_custom_event.fb_mobile_complete_registration', // 모바일 앱 등록
  'App fb_mobile_content_view': 'app_custom_event.fb_mobile_content_view', // 모바일 앱 콘텐츠 조회수
  'App fb_mobile_initiated_checkout': 'app_custom_event.fb_mobile_initiated_checkout', // 모바일 앱 체크아웃
  'App fb_mobile_level_achieved': 'app_custom_event.fb_mobile_level_achieved', // 모바일 앱 업적
  'App fb_mobile_purchase': 'app_custom_event.fb_mobile_purchase', // 모바일 앱 구매
  'App fb_mobile_rate': 'app_custom_event.fb_mobile_rate', // 모바일 앱 평가
  'App fb_mobile_search': 'app_custom_event.fb_mobile_search', // 모바일 앱 검색
  'App fb_mobile_spent_credits': 'app_custom_event.fb_mobile_spent_credits', // 모바일 앱 크레딧 지출
  'App fb_mobile_tutorial_completion': 'app_custom_event.fb_mobile_tutorial_completion', // 모바일 앱 튜토리얼 완료
  'App other': 'app_custom_event.other', // 기타 모바일 앱 액션

  'App app_install': 'app_install', // 앱 설치
  'App app_use': 'app_use', // 앱 사용
  Checkin: 'checkin', // 체크인

  Credit_spent: 'credit_spent', // 크레딧 지출
  'Games plays': 'games.plays', // 게임 플레이
  Landing_page_view: 'landing_page_view', // 랜딩 페이지 조회수
  Like: 'like', // 페이지 좋아요

  Mobile_app_install: 'mobile_app_install', // 모바일 앱 설치

  'Pixel custom.<custom_conv_id>': 'offsite_conversion.custom.<custom_conv_id>', // 광고주가 정의한 사용자 정의 전환
  'Pixel add_payment_info': 'offsite_conversion.fb_pixel_add_payment_info', // 결제 정보
  'Pixel add_to_cart': 'offsite_conversion.fb_pixel_add_to_cart', // 장바구니에 추가
  'Pixel add_to_wishlist': 'offsite_conversion.fb_pixel_add_to_wishlist', // 위시리스트 에 추가
  'Pixel complete_registration': 'offsite_conversion.fb_pixel_complete_registration', // 등록 완료
  'Pixel custom': 'offsite_conversion.fb_pixel_custom', // 광고주가 정의한 사용자 정의 픽셀 이벤트
  'Pixel initiate_checkout': 'offsite_conversion.fb_pixel_initiate_checkout', // 체크아웃 시작
  'Pixel lead': 'offsite_conversion.fb_pixel_lead', // 리드
  'Pixel purchase': 'offsite_conversion.fb_pixel_purchase', // 구매
  'Pixel search': 'offsite_conversion.fb_pixel_search', // 검색
  'Pixel view_content': 'offsite_conversion.fb_pixel_view_content', // 콘텐츠 보기

  'FB flow_complete': 'onsite_conversion.flow_complete', // 페이스북 내 워크플로 완료
  'FB messaging_block': 'onsite_conversion.messaging_block', // 차단된 메시징 대화
  'FB messaging_conversation_started_7d': 'onsite_conversion.messaging_conversation_started_7d', // 메시징 대화 시작됨
  'FB messaging_first_reply': 'onsite_conversion.messaging_first_reply', // 새 메시징 대화
  'FB post_save': 'onsite_conversion.post_save', // 포스트 저장
  'FB purchase': 'onsite_conversion.purchase', // Facebook 내 구매
  'FB lead_grouped': 'onsite_conversion.lead_grouped', // Facebook 내 모든 리드

  'Outbound click': 'outbound_click', // 아웃바운드 클릭

  'Photo view': 'photo_view', // 페이지 사진 보기

  RSVP: 'rsvp', // 이벤트 응답
  'Video view': 'video_view', // 3초 비디오 보기
  'Contact total': 'contact_total', // 연락처
  'Contact website': 'contact_website', // 웹사이트 연락처
  'Contact mobile_app': 'contact_mobile_app', // 모바일 앱 연락처
  'Contact offline': 'contact_offline', // 오프라인 연락처
  'Customize product_total': 'customize_product_total', // 상품 맞춤형
  'Customize product_website': 'customize_product_website', // 웹사이트 상품 맞춤형
  'Customize product_mobile_app': 'customize_product_mobile_app', // 모바일 앱 상품 맞춤형
  'Customize product_offline': 'customize_product_offline', // 오프라인 상품 맞춤형

  donate_total: 'donate_total', // 기부
  donate_website: 'donate_website', // 웹사이트 기부
  donate_on_facebook: 'donate_on_facebook', // Facebook 기부
  donate_mobile_app: 'donate_mobile_app', // 모바일 앱 기부
  donate_offline: 'donate_offline', // 오프라인 기부

  'Find location_total': 'find_location_total', // 위치 검색
  'Find location_website': 'find_location_website', // 웹사이트 위치 검색
  'Find location_mobile_app': 'find_location_mobile_app', // 모바일 앱 위치 검색
  'Find location_offline': 'find_location_offline', // 오프라인 앱 위치 검색
  'Schedule total': 'schedule_total', // 약속 예약
  'Schedule website': 'schedule_website', // 웹사이트 약속 예약
  'Schedule mobile_app': 'schedule_mobile_app', // 모바일 앱 예약 예약
  'Schedule offline': 'schedule_offline', // 오프라인 앱 예약 예약
  'Start trial_total': 'start_trial_total', // 평가판 시작됨
  'Start trial_website': 'start_trial_website', // 웹사이트 평가판 시작됨
  'Start trial_mobile_app': 'start_trial_mobile_app', // 모바일 앱 평가판 시작됨
  'Start trial_offline': 'start_trial_offline', // 오프라인 평가판 시작됨
  'Submit application_total': 'submit_application_total', // 응용 프로그램 제출 됨
  'Submit application_website': 'submit_application_website', // 웹사이트 신청 접수
  'Submit application_mobile_app': 'submit_application_mobile_app', // 모바일 앱 신청
  'Submit application_offline': 'submit_application_offline', // 오프라인 신청 접수
  'Submit application_on_facebook': 'submit_application_on_facebook', // 페이스북 신청 접수
  'Subscribe total': 'subscribe_total', //: 구독
  'Subscribe website': 'subscribe_website', // 웹사이트 구독
  'Subscribe mobile_app': 'subscribe_mobile_app', // 모바일 앱 구독
  'Subscribe offline': 'subscribe_offline', // 오프라인 구독
  'Recurring subscription_payment_total': 'recurring_subscription_payment_total', // 정기 구독 결제
  'Recurring subscription_payment_website': 'recurring_subscription_payment_website', // 웹사이트 정기 구독 결제
  'Recurring subscription_payment_mobile_app': 'recurring_subscription_payment_mobile_app', // 모바일 앱 정기 정기 결제 결제
  'Recurring subscription_payment_offline': 'recurring_subscription_payment_offline', // 오프라인 정기 구독 결제
  'Cancel subscription_total': 'cancel_subscription_total', // 취소된 구독
  'Cancel subscription_website': 'cancel_subscription_website', // 웹사이트 취소 구독
  'Cancel subscription_mobile_app': 'cancel_subscription_mobile_app', // 모바일 앱 취소 구독
  'Cancel subscription_offline': 'cancel_subscription_offline', // 오프라인 취소 구독
  'Ad click_mobile_app': 'ad_click_mobile_app', // 인앱 광고 클릭
  'Ad impression_mobile_app': 'ad_impression_mobile_app', // 인앱 광고 노출
  Click_to_call_call_confirm: 'click_to_call_call_confirm', // 통화 확인 클릭
  'Leadgen groupe': 'leadgen_groupe', // 메신저 및 인스턴트 양식에서 오는 페이스북 리드

  'Lead (all)': 'lead', // 모든 오프사이트 리드와 모든 페이스북 리드
  'App_install (all)': 'omni_app_install', // 앱 설치
  'Purchase (all)': 'omni_purchase', // 구매
  'Add_to_cart (all)': 'omni_add_to_cart', // 장바구니 담기
  'Complete_registration (all)': 'omni_complete_registration', // 등록 완료
  'View_content (all)': 'omni_view_content', // 콘텐츠 조회수
  'Search (all)': 'omni_search', // 검색
  'Initiated_checkout (all)': 'omni_initiated_checkout', // 체크아웃 시작
  'Achievement_unlocked (all)': 'omni_achievement_unlocked', // 업적 잠금 해제
  'Activate_app (all)': 'omni_activate_app', // 앱 활성화
  'Level_achieved (all)': 'omni_level_achieved', // 달성한 레벨
  'Rate (all)': 'omni_rate', // 제출된 평가
  'Spend_credits (all)': 'omni_spend_credits', // 크레딧 지출
  'Tutorial_completion (all)': 'omni_tutorial_completion', // 튜토리얼 완료
  'Custom (all)': 'omni_custom', // 맞춤 이벤트
}

exports.all = async (req, res) => {
  let {
    filtering,
    campaign_id,
    adset_id,
    ad_id,
    fields,
    level,
    breakdowns,
    breakdowns_filter,
    date_preset,
    time_range,
  } = req.query
  let basicFields = ''
  let insightsFields = ''
  let actionsFields = ''

  try {
    if (!fields || !breakdowns || !level)
      return res.status(400).json({ code: 'FIELDS_OR_BREAKDOWNS_OR_LEVEL_NOT_FOUND', data: null })
    else if (!page_id && !campaign_id && !adset_id && !ad_id)
      return res.status(400).json({ code: 'ID_NOT_FOUND', data: null })

    let options = {
      uri: CONF.api_url.uri + 'act_' + CONF.fb_info.FB_ACCOUNT_ID + '/',
      qs: {
        level: level,
        fields: '',
        //filtering,
        access_token: CONF.fb_info.FB_LONG_ACCESS_TOKEN,
      },
    }

    if (!!time_range) {
      options.qs.time_range = time_range
    } else if (!!date_preset) {
      options.qs.date_preset = date_preset
    }

    // filtering with ad structure
    switch (level) {
      case 'account':
        if (!page_id) return res.status(400).json({ code: 'PAGE_ID_NOT_FOUND', data: null })
        options.qs.filtering = [{ field: 'ad.funding_page_id', value: page_id, operator: 'EQUAL' }]
        break

      case 'campaign':
        if (!page_id) return res.status(400).json({ code: 'PAGE_ID_NOT_FOUND', data: null })
        options.qs.filtering = [{ field: 'ad.funding_page_id', value: page_id, operator: 'EQUAL' }]
        break

      case 'adset':
        if (!campaign_id) return res.status(400).json({ code: 'CAMPAIGN_ID_NOT_FOUND', data: null })
        options.qs.filtering = [{ field: 'campaign.id', value: campaign_id, operator: 'EQUAL' }]
        break

      case 'ad':
        if (!ad_id) {
          if (!adset_id) return res.status(400).json({ code: 'ADSET_ID_NOT_FOUND', data: null })
          options.qs.filtering = [{ field: 'adset.id', value: adset_id, operator: 'EQUAL' }]
        } else {
          if (!ad_id) return res.status(400).json({ code: 'AD_ID_NOT_FOUND', data: null })
          options.qs.filtering = [{ field: 'ad.id', value: ad_id, operator: 'EQUAL' }]
        }
        break

      default:
        return res.status(400).json({ code: 'ID_NOT_FOUND', data: null })
    }

    breakdowns = breakdowns.substring(1, breakdowns.length - 1).split(',')
    let breakdownsField = ''
    for (let breakdown of breakdowns) {
      if (adStructure.indexOf(breakdown) == -1) {
        breakdownsField = breakdown
        break
      }
    }
    options.qs.breakdowns = breakdownsField

    if (!!breakdowns_filter && breakdownsField.length != 0) {
      options.qs.filtering.push({ field: breakdownsField, value: [breakdowns_filter], operator: 'IN' })
    }

    for (let field of fields.replace('[', '').replace(']', '').split(',')) {
      if (Object.keys(basic).indexOf(field) != -1) {
        if (basicFields != '') basicFields += ','
        basicFields += basic[field]
      } else if (Object.keys(insight).indexOf(field) != -1) {
        if (insightsFields != '') insightsFields += ','
        insightsFields += insight[field]
      } else if (Object.keys(action).indexOf(field) != -1) {
        if (actionsFields != '') actionsFields += ','
        actionsFields += action[field]
      }
    }

    if (actionsFields != '') insightsFields += insightsFields != '' ? ',actions' : 'actions'

    if (level == 'account') {
      const result = await insightsAPI(options, insightsFields, actionsFields)

      return res.json({
        code: 'SUCCESS',
        data: result,
      })
    } else {
      let result = await fieldsAPI(options, basicFields)
      result.push(await insightsAPI(options, insightsFields, actionsFields))
      return res.json({
        code: 'SUCCESS',
        data: result,
      })
    }
  } catch (error) {
    console.log(error)
    return res.json({
      code: error,
      data: null,
    })
  }
}

async function fieldsAPI(options, basicFields) {
  if (options.qs.level == 'account')
    options.uri = CONF.api_url.uri + 'act_' + CONF.fb_info.FB_ACCOUNT_ID + '/' + options.qs.level
  else options.uri = CONF.api_url.uri + 'act_' + CONF.fb_info.FB_ACCOUNT_ID + '/' + options.qs.level + 's'
  options.qs.fields = basicFields
  console.log(options)
  return new Promise(function (resolve, reject) {
    request(options, async function (err, response, body) {
      if (err) reject(err)
      resolve(JSON.parse(body).data)
    })
  })
}
async function insightsAPI(options, insightsFields, actionsFields) {
  options.uri = CONF.api_url.uri + 'act_' + CONF.fb_info.FB_ACCOUNT_ID + '/insights'
  if (insightsFields != '') {
    if (options.qs.level != 'ad') {
      insightsFields += ',' + adStructure[adStructure.indexOf(options.qs.level) + 1] + '_id'
    } else {
      insightsFields += ',ad_id'
    }
  } else {
    if (options.qs.level != 'ad') {
      insightsFields += adStructure[adStructure.indexOf(options.qs.level) + 1] + '_id'
    } else {
      insightsFields += 'ad_id'
    }
  }

  if (actionsFields != '') insightsFields += ',actions'

  options.qs.fields = insightsFields
  console.log(options)
  return new Promise(function (resolve, reject) {
    request(options, async function (err, response, body) {
      if (err) reject(err)
      resolve(JSON.parse(body).data)
    })
  })
}

exports.age = async (req, res) => {
  const { filtering, date_preset, time_range, page_id } = req.query
  if (!page_id) throw 'PAGE_ID_UNDEFINED'
  const user = await User.findOne({ fb_page_id: page_id })
  const userAccountId =
    user.fb_ad_account_id && user.fb_access_token ? user.fb_ad_account_id : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken =
    user.fb_ad_account_id && user.fb_access_token ? user.fb_access_token : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId + '/insights',
    qs: {
      // time_range: {since:'2021-11-27',until:'2021-12-27'},
      level: 'account',
      fields:
        'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,actions',
      //filtering,
      breakdowns: 'age',
      access_token: userAccessToken,
    },
  }
  if (userAccountId === 'act_2607869862847972') options.qs.filtering = filtering
  if (time_range) options.qs.time_range = time_range
  else if (date_preset) options.qs.date_preset = date_preset

  request.get(options, function (err, response, body) {
    if (err) return res.json({ code: err, data: null })
    let results = JSON.parse(body).data
    let fieldsList = options.qs.fields.split(',')
    let data = []

    if (!results) return res.json({ code: 'DATA_NOT_FOUND', data: null })

    fieldsList.push('age')
    for (let result of results) {
      let input = {}
      input['offsite_conversion.fb_pixel_purchase'] = null

      for (let field of fieldsList) {
        if (field == 'actions') {
          if (!result.actions) continue
          for (let action of result.actions) {
            if (action.action_type == 'offsite_conversion.fb_pixel_purchase') {
              input['offsite_conversion.fb_pixel_purchase'] = action.value
              break
            }
          }
        } else if (!result[field]) input[field] = null
        else if (typeof result[field] == 'object') {
          input[field] = result[field][0].value
        } else {
          input[field] = result[field]
        }
      }
      data.push(input)
    }
    return res.json({
      code: 'SUCCESS',
      data: data,
    })
  })
}
exports.gender = async (req, res) => {
  const { filtering, date_preset, time_range, page_id } = req.query
  if (!page_id) throw 'PAGE_ID_UNDEFINED'
  const user = await User.findOne({ fb_page_id: page_id })
  const userAccountId =
    user.fb_ad_account_id && user.fb_access_token ? user.fb_ad_account_id : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken =
    user.fb_ad_account_id && user.fb_access_token ? user.fb_access_token : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId + '/insights',
    qs: {
      // time_range: {since:'2021-11-27',until:'2021-12-27'},
      level: 'account',
      fields:
        'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,actions',
      //filtering,
      breakdowns: 'gender',
      access_token: userAccessToken,
    },
  }
  if (userAccountId === 'act_2607869862847972') options.qs.filtering = filtering
  if (time_range) options.qs.time_range = time_range
  else if (date_preset) options.qs.date_preset = date_preset

  request.get(options, function (err, response, body) {
    if (err) reject(err)
    let results = JSON.parse(body).data
    let fieldsList = options.qs.fields.split(',')
    let data = []

    if (!results) return res.json({ code: 'DATA_NOT_FOUND', data: null })

    fieldsList.push('gender')
    for (let result of results) {
      let input = {}
      input['offsite_conversion.fb_pixel_purchase'] = null

      for (let field of fieldsList) {
        if (field == 'actions') {
          if (!result.actions) continue
          for (let action of result.actions) {
            if (action.action_type == 'offsite_conversion.fb_pixel_purchase') {
              input['offsite_conversion.fb_pixel_purchase'] = action.value
              break
            }
          }
        } else if (!result[field]) input[field] = null
        else if (typeof result[field] == 'object') {
          input[field] = result[field][0].value
        } else {
          input[field] = result[field]
        }
      }
      data.push(input)
    }
    return res.json({
      code: 'SUCCESS',
      data: data,
    })
  })
}
exports.location = async (req, res) => {
  const { filtering, date_preset, time_range, page_id } = req.query
  if (!page_id) throw 'PAGE_ID_UNDEFINED'
  const user = await User.findOne({ fb_page_id: page_id })
  const userAccountId =
    user.fb_ad_account_id && user.fb_access_token ? user.fb_ad_account_id : 'act_' + CONF.fb_info.FB_ACCOUNT_ID
  const userAccessToken =
    user.fb_ad_account_id && user.fb_access_token ? user.fb_access_token : CONF.fb_info.FB_LONG_ACCESS_TOKEN
  let options = {
    uri: CONF.api_url.uri + userAccountId + '/insights',
    qs: {
      // time_range: {since:'2021-11-27',until:'2021-12-27'},
      level: 'account',
      fields:
        'reach,impressions,spend,frequency,clicks,video_avg_time_watched_actions,cpm,ctr,cpc,purchase_roas,actions',
      //filtering,
      breakdowns: 'country,region',
      access_token: userAccessToken,
    },
  }
  if (userAccountId === 'act_2607869862847972') options.qs.filtering = filtering
  if (time_range) options.qs.time_range = time_range
  else if (date_preset) options.qs.date_preset = date_preset

  request.get(options, function (err, response, body) {
    if (err) reject(err)
    let results = JSON.parse(body).data
    let fieldsList = options.qs.fields.split(',')
    let data = []

    if (!results) return res.json({ code: 'DATA_NOT_FOUND', data: null })

    fieldsList.push('country')
    fieldsList.push('region')
    for (let result of results) {
      let input = {}
      input['offsite_conversion.fb_pixel_purchase'] = null

      for (let field of fieldsList) {
        if (field == 'actions') {
          if (!result.actions) continue
          for (let action of result.actions) {
            if (action.action_type == 'offsite_conversion.fb_pixel_purchase') {
              input['offsite_conversion.fb_pixel_purchase'] = action.value
              break
            }
          }
        } else if (!result[field]) input[field] = null
        else if (typeof result[field] == 'object') {
          input[field] = result[field][0].value
        } else {
          input[field] = result[field]
        }
      }
      data.push(input)
    }
    return res.json({
      code: 'SUCCESS',
      data: data,
    })
  })
}

exports.facebook = async (req, res) => {
  try {
    const { id } = req.user
    console.log('userId =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_page_info || !user.fb_page_info.access_token) {
      res.status(401).json({
        code: 'FACEBOOK_USER_INFO_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }
    const fields = ['picture', 'description', 'permalink_url', 'video_insights']
    const url =
      'https://graph.facebook.com/v19.0/' +
      user.fb_page_info.id +
      '/video_reels?fields=' +
      fields.join(',') +
      '&access_token=' +
      user.fb_page_info.access_token
    let result = await axios.get(url)
    // console.log('result =', result)
    // console.log('result.data.data =', result.data.data)

    const resData = []
    resData.push(...result.data.data)
    while (result.data.paging.next) {
      result = await axios.get(result.data.paging.next)
      resData.push(...result.data.data)
    }

    const response = resData.map((obj) => {
      const play_count = obj.video_insights.data.find((item) => item.name === 'blue_reels_play_count')
      const replay_count = obj.video_insights.data.find((item) => item.name === 'fb_reels_replay_count')
      const total_plays = obj.video_insights.data.find((item) => item.name === 'fb_reels_total_plays')
      const impressions_unique = obj.video_insights.data.find((item) => item.name === 'post_impressions_unique')
      const time_watched = obj.video_insights.data.find((item) => item.name === 'post_video_avg_time_watched')
      const followers = obj.video_insights.data.find((item) => item.name === 'post_video_followers')
      const view_time = obj.video_insights.data.find((item) => item.name === 'post_video_view_time')
      return {
        picture: obj.picture,
        description: obj.description,
        permalink_url: 'https://www.facebook.com' + obj.permalink_url,
        provider: 'facebook',
        play_count: play_count.values[0].value,
        replay_count: replay_count.values[0].value,
        total_plays: total_plays.values[0].value,
        impressions_unique: impressions_unique.values[0].value,
        time_watched: time_watched.values[0].value,
        followers: followers.values[0].value,
        view_time: view_time.values[0].value,
      }
    })

    res.status(200).json({ code: 'SUCCESS', data: response })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.instagram = async (req, res) => {
  try {
    const { id } = req.user
    console.log('userId =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const user = await User.findById(id)
    if (!user.fb_instagram_info || !user.fb_instagram_info.id || !user.fb_user_info || !user.fb_user_info) {
      res.status(401).json({
        code: 'FACEBOOK_USER_INFO_NOT_EXITS',
        message: 'There is no Facebook user information. Please link your Facebook account.',
      })
    }
    const fields = [
      'thumbnail_url',
      'caption',
      'permalink',
      'insights.metric(clips_replays_count,comments,ig_reels_aggregated_all_plays_count,ig_reels_avg_watch_time,ig_reels_video_view_total_time,likes,plays,reach,saved,shares,total_interactions)',
    ]
    const url =
      'https://graph.facebook.com/v19.0/' +
      user.fb_instagram_info.id +
      '/media?fields=' +
      fields.join(',') +
      '&access_token=' +
      user.fb_page_info.access_token
    let result = await axios.get(url)
    // console.log('result =', result)
    console.log('result.data.data.length =', result.data.data.length)

    const resData = []
    resData.push(...result.data.data)
    while (result.data.paging.next) {
      result = await axios.get(result.data.paging.next)
      resData.push(...result.data.data)
    }
    console.log('resData.length =', resData.length)

    const response = resData.map((obj) => {
      const replays_count = obj.insights.data.find((item) => item.name === 'clips_replays_count')
      const comments = obj.insights.data.find((item) => item.name === 'comments')
      const plays_count = obj.insights.data.find((item) => item.name === 'ig_reels_aggregated_all_plays_count')
      const avg_watch_time = obj.insights.data.find((item) => item.name === 'ig_reels_avg_watch_time')
      const view_total_time = obj.insights.data.find((item) => item.name === 'ig_reels_video_view_total_time')
      const likes = obj.insights.data.find((item) => item.name === 'likes')
      const plays = obj.insights.data.find((item) => item.name === 'plays')
      const reach = obj.insights.data.find((item) => item.name === 'reach')
      const saved = obj.insights.data.find((item) => item.name === 'saved')
      const shares = obj.insights.data.find((item) => item.name === 'shares')
      const total_interactions = obj.insights.data.find((item) => item.name === 'total_interactions')
      return {
        thumbnail_url: obj.thumbnail_url,
        caption: obj.caption,
        permalink: obj.permalink,
        provider: 'instagram',
        replays_count: replays_count.values[0].value,
        comments: comments.values[0].value,
        plays_count: plays_count.values[0].value,
        avg_watch_time: avg_watch_time.values[0].value,
        view_total_time: view_total_time.values[0].value,
        likes: likes.values[0].value,
        plays: plays.values[0].value,
        reach: reach.values[0].value,
        saved: saved.values[0].value,
        shares: shares.values[0].value,
        total_interactions: total_interactions.values[0].value,
      }
    })

    res.status(200).json({ code: 'SUCCESS', data: response })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.youtube = async (req, res) => {
  try {
    const { id } = req.user
    console.log('userId =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const insights = await Insights.find({ userId: id, provider: 'youtube' })

    res.status(200).json({ code: 'SUCCESS', data: insights })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.youtubeRefresh = async (req, res) => {
  try {
    const { id } = req.user
    console.log('userId =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
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

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    })

    if (!user.youtube_channel_info || !user.youtube_channel_info.id) {
      return res.status(401).json({
        code: 'NONE_CHANNEL_INFO',
        message: 'There is no channel information. Please proceed with linking your Google account.',
      })
    }

    const channelId = user.youtube_channel_info.id
    const maxResults = 50

    // video list
    const videoList = await youtube.search.list({
      part: 'id',
      channelId: channelId,
      type: 'video',
      maxResults: maxResults,
    })
    console.info('videoList.data.pageInfo =', videoList.data.pageInfo)
    const videoIds = videoList.data.items.map((item) => item.id.videoId)
    console.info('videoIds.length =', videoIds.length)

    let pageToken = videoList.data.nextPageToken
    console.info('pageToken =', pageToken)

    while (pageToken) {
      const videoList = await youtube.search.list({
        part: 'id',
        channelId: channelId,
        type: 'video',
        maxResults: maxResults,
        pageToken: pageToken,
      })
      const resultIds = videoList.data.items.map((item) => item.id.videoId)
      // console.info('videoList =', videoList);
      videoIds.push(...resultIds)
      pageToken = videoList.data.nextPageToken
      console.info('pageToken =', pageToken)
      // break;
    }
    // console.info('videoIds =', videoIds)
    console.info('videoIds.length =', videoIds.length)

    const resultData = []
    for (const item of videoIds) {
      // video list 기본 지표 요청 ( api 사용량 1 )
      const videoInfo = await youtube.videos.list({
        part: 'snippet,contentDetails,statistics',
        id: item,
      })
      console.info('videoInfo.data.pageInfo =', videoInfo.data.pageInfo)
      const result = videoInfo.data.items[0]
      resultData.push({
        userId: id,
        postId: item,
        thumbnail_url: result.snippet.thumbnails.medium.url,
        caption: result.snippet.title,
        permalink: 'https://www.youtube.com/watch?v=' + item,
        provider: 'youtube',

        duration: result.contentDetails.duration,
        dimension: result.contentDetails.dimension,
        definition: result.contentDetails.definition,

        viewCount: result.statistics.viewCount,
        likeCount: result.statistics.likeCount,
        dislikeCount: result.statistics.dislikeCount,
        favoriteCount: result.statistics.favoriteCount,
        commentCount: result.statistics.commentCount,
      })
    }

    // bulkWrite 작업을 정의합니다.
    let bulkOps = resultData.map((post) => ({
      updateOne: {
        filter: {
          userId: post.userId,
          postId: post.postId,
          provider: post.provider,
          // media_type: post.media_type,
        },
        update: { $set: post },
        upsert: true,
      },
    }))
    const bulkResult = await Insights.bulkWrite(bulkOps)
    console.log('bulkResult = ', bulkResult)

    res.status(200).json({ code: 'SUCCESS' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.youtubeUpdateInfo = async (req, res) => {
  try {
    const { id } = req.user
    console.log('userId =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const insights = await Insights.findOne({ userId: id, provider: 'youtube' }).sort({
      updatedAt: 1,
    })
    console.log('insights =', insights)

    let dataCheck = false
    let updatedAt = ''
    if (insights) {

      const updateDate = moment(insights.updatedAt)
      const today = moment()

      const diff = today.diff(updateDate, 'days') // 일자 차이 계산
      console.log('diff =', diff)

      if (diff > 29) dataCheck = true

      updatedAt = insights.updatedAt
    }

    res.status(200).json({
      code: 'SUCCESS',
      dataCheck: dataCheck,
      data: updatedAt,
    })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
exports.youtubeDataDelete = async (req, res) => {
  try {
    const { id } = req.user
    console.log('userId =', id)
    if (!id) {
      return res.status(401).json({
        code: 'MISSING_PARAM',
        message: 'parameter vad userId(access token) are required',
      })
    }

    const insights = await Insights.deleteMany({ userId: id, provider: 'youtube' })
    console.log('insights =', insights)

    res.status(200).json({
      code: 'SUCCESS',
    })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
