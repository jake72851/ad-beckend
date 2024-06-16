const mongoose = require('mongoose')

const dashboardSchema = new mongoose.Schema({
  user_id: { type: String },
  name: { type: String },
  date_range: {
    title: String,
    value: String,
  },
  filtering: [{
    id: { type: String },
    value: { type: String },
    operator: { type: String },
  }]
})
module.exports = mongoose.model('Dashboard', dashboardSchema)