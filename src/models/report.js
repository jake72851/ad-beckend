const mongoose = require('mongoose')

const tableSchema = {
  columnHeaders: [{
    field: String,
    name: String,
    checkable: Boolean,
    selected: Boolean,
    is_result: Boolean,
  }],
  rows: [[String]],
}

const funnelSchema = {
  fields: [String],
  labels: [String],
  values: [Number],
}

const creativeSchema = [{
  image_url: String,
  video_id: Number,
  spend: Number,
  cpc: Number,
  ctr: Number,
  result: {
    field: String,
    value: Number,
  }
}]

const reportSchema = new mongoose.Schema({
  user_id: String,
  week: String,
  date_start: String,
  insight: {
    overall: String,
    plan: String,
    done: String,
    goal: String,
  },
  weekly_performance: tableSchema,
  weekly_performance_ga: tableSchema,
  daily_performance: tableSchema,
  daily_performance_ga: tableSchema,
  weekly_funnel: funnelSchema,
  weekly_funnel_ga: funnelSchema,
  group_performance: {
    fields: [String]
  },
  group_performance_ga: {
    fields: [String]
  },
  best_creative_ctr: creativeSchema,
  best_creative_cpc: creativeSchema,
  best_creative_conversion: [{
    result_field: String,
    creatives: creativeSchema,
  }],
  groupby_age: tableSchema,
  groupby_gender: tableSchema,
  groupby_impression_device: tableSchema,
  groupby_publisher_platform: tableSchema,
})
module.exports = mongoose.model('Report', reportSchema)