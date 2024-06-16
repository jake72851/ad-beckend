const { verify } = require('./jwt')

exports.isAuthenticated = (req, res, next) => {
  if (req.headers.authorization) {
    const token = req.headers.authorization.split('Bearer ')[1]
    const result = verify(token)
    console.log('token result =', result)
    if (result.ok && result.id) {
      req.id = result.id
      req.user = {
        id: result.id,
        fb_ad_account_id: result.fb_ad_account_id,
      }
      next()
      return
    }
  }
  res.status(401).send({
    code: 'WRONG_TOKEN',
    message: 'login again',
  })
}
