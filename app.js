require('dotenv').config()
var createError = require('http-errors')
var express = require('express')
var path = require('path')
var cookieParser = require('cookie-parser')
// var bodyParser = require('body-parser')
var logger = require('morgan')
const mongoose = require('mongoose')
const cors = require('cors')

const indexRouter = require('./src/routes/index')
const campaignsRouter = require('./src/routes/campaigns')
const adsetsRouter = require('./src/routes/adsets')
const adsRouter = require('./src/routes/ads')
const adcreativesRouter = require('./src/routes/adcreatives')
const insightsRouter = require('./src/routes/insights')
const channelsRouter = require('./src/routes/channels')
const usersRouter = require('./src/routes/users')
const dashboardRouter = require('./src/routes/dashboard')
const tableRouter = require('./src/routes/table')
const reportRouter = require('./src/routes/report')
const pageRouter = require('./src/routes/page')
const instagramRouter = require('./src/routes/instagram')
const tiktokRouter = require('./src/routes/tiktok')
const scopeRouter = require('./src/routes/scope')
const youtubeRouter = require('./src/routes/youtube')

const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const swaggerDocument = YAML.load('./swagger.yaml')

const CONF = require('./config')

var app = express()

mongoose.Promise = global.Promise
mongoose
  .connect(CONF.api_db.url, CONF.api_db.option)
  // .connect(CONF.local_db.url)
  .then(() => console.log('connected successfully'))
  .catch((err) => console.error(err))

// view engine setup
app.set('views', path.join(__dirname, '/src/views'))
app.set('view engine', 'ejs')
app.engine('html', require('ejs').renderFile)

app.use(cors())
app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
// app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))
app.use('/insight-api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.use('/', indexRouter)
app.get('/healthcheck', (req, res) => {
  res.json({
    success: true,
  })
})
app.use('/campaigns', campaignsRouter)
app.use('/adsets', adsetsRouter)
app.use('/ads', adsRouter)
app.use('/adcreatives', adcreativesRouter)
app.use('/insights', insightsRouter)
app.use('/channels', channelsRouter)
app.use('/dashboard', dashboardRouter)
app.use('/table', tableRouter)
app.use('/users', usersRouter)
app.use('/report', reportRouter)
app.use('/page', pageRouter)
app.use('/instagram', instagramRouter)
app.use('/tiktok', tiktokRouter)
app.use('/scope', scopeRouter)
app.use('/youtube', youtubeRouter)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404))
})

// error handler
app.use(function (err, req, res) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

module.exports = app
