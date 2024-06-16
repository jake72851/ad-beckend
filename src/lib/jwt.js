const jwt = require('jsonwebtoken')

const { JWT_SECRET } = process.env

module.exports = {
  sign: (user) => {
    // access token 발급
    const payload = {
      // access token에 들어갈 payload
      id: user.id,
      fb_ad_account_id: user.fb_ad_account_id,
    }
    console.log(payload)
    const token = jwt.sign(payload, JWT_SECRET, {
      // secret으로 sign하여 발급하고 return
      algorithm: 'HS256', // 암호화 알고리즘
      expiresIn: '7d', // 유효기간
    })
    return token
  },
  verify: (token) => {
    // access token 검증
    let decoded = null
    try {
      decoded = jwt.verify(token, JWT_SECRET)
      return {
        ok: true,
        id: decoded.id,
        fb_ad_account_id: decoded.fb_ad_account_id
      }
    } catch (err) {
      return {
        ok: false,
        message: err.message,
      }
    }
  },
}