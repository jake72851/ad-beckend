const mongoose = require('mongoose')

const fieldsSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  type: {
    type: String
  },
  fields: {
    type: Array
  }
})
module.exports = mongoose.model('Fields', fieldsSchema)