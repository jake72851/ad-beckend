const mongoose = require('mongoose')

const insightsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
    },
    postId: {
      type: String,
    },
    thumbnail_url: {
      type: String,
    },
    caption: {
      type: String,
    },
    permalink: {
      type: String,
    },
    provider: {
      type: String,
    },

    duration: {
      type: String,
    },
    dimension: {
      type: String,
    },
    definition: {
      type: String,
    },

    viewCount: {
      type: String,
    },
    likeCount: {
      type: String,
    },
    dislikeCount: {
      type: String,
    },
    favoriteCount: {
      type: String,
    },
    commentCount: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('insights', insightsSchema)
