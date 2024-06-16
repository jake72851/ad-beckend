const mongoose = require('mongoose')

const scopeSchema = new mongoose.Schema(
  {
    scope: {
      type: Array,
    },
    type: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('scope', scopeSchema)
