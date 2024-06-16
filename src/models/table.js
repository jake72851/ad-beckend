const mongoose = require('mongoose')

const tableSchema = new mongoose.Schema({
  dashboard_id: { type: String },
  name: { type: String },
  breakdowns: { type: Array, default: ['campaign', 'adset', 'ad'] },
  fields: { type: Array },
}, {
  versionKey: false,
  timestamps: true,
  toJSON: { virtuals: true }
})
module.exports = mongoose.model('Table', tableSchema)