var schedule = require('node-schedule')
var nodemailer = require('nodemailer')
var sendmailTransport = require('nodemailer-sendmail-transport')

var plugins = {
  'fuelSpain': require('./fetcher/fuel-spain.js')
}

var config = {
  'mail': '',
  'fetcher': {
    'fuelSpain': {
      settings: {
        targetFile: '../simple-geojson-server/data/fuelSpain.geojson',
        serverSocket: '/tmp/simple-geojson-server.sock',
        serverService: 'fuelSpain'
      },
      schedule: {
        hour: 5
      },
      rescheduleOnFailAfterMinutes: 15,
      retryCount: 10
    }
  }
}

// TODO settings manager
// TODO plugin manager
// TODO move deploy-step out of fetcher

// process args
var runOnce = false
if (process.argv.length >= 3 && process.argv[2].trim() === 'run-once') {
  runOnce = true
}

console.log('Starting fetcher')

for (var key in config.fetcher) {
  if (!runOnce) {
    schedule.scheduleJob(config.fetcher[key].schedule, function () {
      run(key)
    })
  } else {
    run(key)
  }
}

function run (plugin, counter) {
  // set retry counter
  counter = counter || config.retryCount

  console.log('[' + plugin + ']', 'Run')
  // settings
  var settings = config.fetcher[plugin].settings
  // fetch data
  console.log('[' + plugin + ']', 'Fetch...')
  plugins[plugin].fetch(settings, function (err, data) {
    if (err) {
      handleError(plugin, 'Fetch failed', err, counter)
    } else {
      console.log('[' + plugin + ']', 'Process...')
      plugins[plugin].process(settings, data, function (err, data) {
        if (err) {
          handleError(plugin, 'Process failed', err, counter)
        } else {
          console.log('[' + plugin + ']', 'Test...')
          plugins[plugin].test(settings, data, function (err, data) {
            if (err) {
              handleError(plugin, 'Test failed', err, counter)
            } else {
              console.log('[' + plugin + ']', 'Deploy...')
              plugins[plugin].deploy(settings, data, function (err) {
                if (err) {
                  handleError(plugin, 'Deploy failed', err, counter)
                } else {
                  console.log('[' + plugin + ']', 'Finished')
                }
              })
            }
          })
        }
      })
    }
  })
}

// set up mail
var transporter = nodemailer.createTransport(sendmailTransport({}))

// error handler
function handleError (plugin, text, err, counter) {
  console.error('[' + plugin + ']', 'Error: ' + text + ': ', err)

  // retry later
  if (config.rescheduleOnFailAfterMinutes > 0 && !runOnce && counter > 0) {
    var date = new Date(Date.now() + config.rescheduleOnFailAfterMinutes * 60000)
    schedule.scheduleJob(date, function () {
      run(plugin, counter - 1)
    })
  } else if (config.mail !== '') { // send mail
    var mailData = {
      from: config.mail,
      to: config.mail,
      subject: 'data-fetcher: ' + plugin + ' failed',
      text: text + ': ' + err
    }

    transporter.sendMail(mailData, function (err) {
      if (err) {
        console.log('Sending mail failed', err)
      } else {
        console.log('Mail sent')
      }
    })
  }
}
