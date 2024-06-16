const Dashboard = require('../models/dashboard')
const Table = require('../models/table')

exports.fetchDashboards = async (req, res) => {
  const { id } = req
  try {
    const dashboards = await Dashboard.find({ user_id: id }).lean()
    res.status(200).json({
      code: 'SUCCESS',
      data: dashboards,
    })
  } catch (e) {
    console.log(e)
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      error: e.message
    })
  }
}

exports.createDashboard = async (req, res) => {
  const { id } = req
  try {
    const { name } = req.body
    const data = {
      user_id: id,
      name,
      date_range: {
        title: '지난 7일간',
        value: 'last_7d',
      },
      filtering: []
    }
    const dbDashboard = await Dashboard.create(data)
    res.status(200).json({
      code: 'SUCCESS',
      data: dbDashboard,
    })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.updateDashboard = async (req, res) => {
  try {
    const { dashboard_id } = req.params
    const { name, date_range, filtering, tables } = req.body
    console.log(name, date_range, filtering, tables)
    await Dashboard.findByIdAndUpdate(
      dashboard_id,
      {
        $set: {
          name,
          date_range,
          filtering
        },
      },
      { new: true },
    )
    if (tables && tables.length) {
      await Promise.all(
        tables.map(item => Table.findByIdAndUpdate(item._id, { $set: {
          breakdowns: item.breakdowns,
          fields: item.fields
        }}))
      )
    }
    res.status(200).json({ code: 'SUCCESS' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.deleteDashboard = async (req, res) => {
  try {
    const { dashboard_id } = req.params
    await Dashboard.findByIdAndDelete(dashboard_id)
    res.status(200).json({ code: 'SUCCESS' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}