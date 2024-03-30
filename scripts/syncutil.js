const debug = require('debug')('debug')
const mongoose = require('mongoose')
const settings = require('../lib/settings')
const db = require('../lib/database')

function check_net_missing(argv) {
  if (argv.length < 3) {
    console.error("Invalid parameters. Use net, one of %s.", settings.getAllNet())
    process.exit(1)
  }
}

function check_net_unknown(net) {
  if (!settings.getAllNet().includes(net)) {
    console.error("Invalid parameters. Use net, one of %s.", settings.getAllNet())
    process.exit(1)
  }
}

function init_db_if_enabled(net) {
  const enabled = settings.getDbOrNull(net).enabled
  if (enabled) {
    db.connection_factory(net, settings.getDbConnectionString(net), function(conn) {
      db.initialize_data_startup(function() {
        // NOOP
      }, net)
    })
  } else {
    console.log("Database for net '%s' is disabled.", net)
  }
}

function init_db(net, cb) {
  db.connection_factory(net, settings.getDbConnectionString(net), function(conn) {
    db.initialize_data_startup(function() {
      cb('initialized')
    }, net)
  })
}

function exit(exitCode) {
  // always disconnect mongo connection
  mongoose.disconnect()
  process.exit(exitCode)
}

function exit_remove_lock(exitCode, lock, net=settings.getDefaultNet()) {
  mongoose.disconnect()

  // remove lock if any
  if (db.lib.is_locked([lock], net)) {
    const fs = require('fs')
    const pid = process.pid.toString()
    const fname = './tmp/' + net + '-' + lock + '.pid'
    const pidFromFile = fs.readFileSync(fname)
    if (pid == pidFromFile) {
      if (db.lib.remove_lock(lock, net) == true) {
        process.exit(exitCode)
      } else {
        // error removing lock
        process.exit(1)    
      }
    }
  }
  process.exit(exitCode)
}

function exit_remove_lock_completed(lock, coin, net=settings.getDefaultNet()) {
  log_completed(lock, net, coin)
  exit_remove_lock(0, lock, net)
}

function gracefully_shut_down(process, stopSync) {
  process.on('SIGINT', () => {
    console.log('Stopping sync process.. Please wait..')
    stopSync = true
  })
  
  // prevent killing of the sync script to be able to gracefully shut down
  process.on('SIGTERM', () => {
    console.log('Stopping sync process.. Please wait..')
    stopSync = true
  })
}

function get_last_usd_price(stopSync, net=settings.getDefaultNet()) {
  db.get_last_usd_price(function(err) {
    if (err == null) {
      const coin = settings.getCoin(net)
      db.update_last_updated_stats(coin.name, { markets_last_updated: Math.floor(new Date() / 1000) }, function(cb) {
        // check if the script stopped prematurely
        if (stopSync) {
          console.log('Market sync was stopped prematurely')
          exit(1)
        } else {
          console.log('Market sync complete')
          exit(0)
        }
      }, net)
    } else {
      console.log('Error: %s', err)
      exit(1)      
    }
  }, net)
}

function log_start(objname, net, coin) {
  console.log("\n****** Sync %s for net '%s' ('%s'). ******\n", objname, net, coin.symbol)
}

function log_completed(objname, net, coin) {
  console.log("\n****** Sync %s for net '%s' ('%s') completed. ******\n", objname, net, coin.symbol)
}

module.exports = {
  check_net_missing: check_net_missing,
  check_net_unknown: check_net_unknown,
  init_db_if_enabled: init_db_if_enabled,
  init_db: init_db,
  exit: exit,
  exit_remove_lock: exit_remove_lock,
  exit_remove_lock_completed: exit_remove_lock_completed,
  gracefully_shut_down: gracefully_shut_down,
  get_last_usd_price: get_last_usd_price,
  log_start: log_start,
  log_completed: log_completed
}
