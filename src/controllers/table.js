const Table = require('../models/table')

exports.fetchTables = async (req, res) => {
  const { dashboard_id } = req.query

  try {
    const tables = await Table.find({ dashboard_id }).lean()
    res.status(200).json({
      code: 'SUCCESS',
      data: tables,
    })
  } catch (e) {
    console.log(e)
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      error: e.message
    })
  }
}

exports.createTable = async (req, res) => {
  try {
    const { dashboard_id } = req.body
    const table = new Table({
      dashboard_id,
      name: '테이블',
      breakdowns: ['campaign', 'adset', 'ad'],
      fields: [
        'status',
        'reach',
        'impressions',
        'spend',
        'frequency',
        'clicks',
        'cpm',
        'ctr',
        'cpc',
        'purchase_roas',
        'daily_budget',
      ],
    })
    const dbTable = await table.save()
    res.status(200).json({
      code: 'SUCCESS',
      data: dbTable,
    })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.updateTable = async (req, res) => {
  try {
    const { table_id } = req.params
    const updateData = req.body
    await Table.findByIdAndUpdate(
      table_id,
      {
        $set: updateData,
      },
      { new: true },
    )
    res.status(200).json({ code: 'SUCCESS' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}

exports.deleteTable = async (req, res) => {
  try {
    const { table_id } = req.params
    await Table.findByIdAndDelete(table_id)
    res.status(200).json({ code: 'SUCCESS' })
  } catch (error) {
    console.log(error)
    res.status(400).json({ code: 'ERROR', error: error.message })
  }
}