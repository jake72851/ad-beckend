const mongoose = require('mongoose')

const usersSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
    },
    password: {
      type: String,
    },
    company_name: {
      type: String,
    },
    company_reg_num: {
      type: String,
    },
    fb_ad_account_id: {
      type: String,
    },
    fb_bussiness_id: {
      type: String,
    },
    fb_page_id: {
      type: String,
    },
    fb_page_name: {
      type: String,
    },
    fb_pixel_id: {
      type: String,
    },
    fb_pixel_name: {
      type: String,
    },
    ga_properties: [
      {
        account_id: { type: String },
        property_id: { type: String },
        property_name: { type: String },
        view_id: { type: String },
        view_name: { type: String },
      },
    ],
    report: {
      overall: String,
      plan: String,
      done: String,
      goal: String,
    },
    fb_access_token: {
      type: String,
    },
    fb_page_info: {
      type: Object,
    },
    fb_user_info: {
      type: Object,
    },
    fb_user_name: {
      type: String,
    },
    fb_instagram_info: {
      type: Object,
    },
    tiktok_user_info: {
      type: Object,
    },
    tiktok_account_info: {
      type: Object,
    },

    google_token_info: {
      type: Object,
    },
    google_user_info: {
      type: Object,
    },
    youtube_channel_info: {
      type: Object,
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('Users', usersSchema)
