const Scope = require('../models/scope')

exports.facebook = async (req, res) => {
  try {
    const result = await Scope.findOne({ type: 'facebook' }).lean()
    // console.log('result =', result)
    const joinedStr = result.scope.join(',')
    res.status(200).json({ code: 'SUCCESS', data: joinedStr })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.google = async (req, res) => {
  try {
    const result = await Scope.findOne({ type: 'google' }).lean()
    // console.log('result =', result)
    res.status(200).json({ code: 'SUCCESS', data: result.scope })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}
