const debug = require('debug')('debug')
const request = require('postman-request')
const settings = require('./settings')
const base_server = 'http://127.0.0.1:' + settings.webserver.port + "/"
const base_url = base_server + 'api/'
const onode = require('./node')
const clients = []

settings.wallets.forEach(function (wallet) {
  clients[wallet.id] = new onode.Client(wallet);
});

function rpcCommand(params, cb) {
  const net = settings.getNet(params[0].net);
  clients[net].cmd([{method: params[0].method, params: params[0].parameters}], function(err, response) {
    if (err)
      return cb('There was an error. Check your console.');
    else
      return cb(response);
  });
}

function prepareRpcCommand(cmd, addParams) {
  var method_name = '';
  var params = addParams || [];

  // Check for null/blank string
  if (cmd != null && cmd.trim() != '') {
    // Split cmd by spaces
    var split = cmd.split(' ');

    for (i = 0; i < split.length; i++) {
      if (i == 0)
        method_name = split[i];
      else
        params.push(split[i]);
    }
  }

  return { method: method_name, parameters: params };
}

function convertHashUnits(hashes, net=settings.getDefaultNet()) {
  const shared_pages = settings.get(net, 'shared_pages')
  if (shared_pages.page_header.panels.network_panel.nethash_units == 'K') {
    // return units in KH/s
    return (hashes / 1000).toFixed(4);
  } else if (shared_pages.page_header.panels.network_panel.nethash_units == 'M') {
    // return units in MH/s
    return (hashes / 1000000).toFixed(4);
  } else if (shared_pages.page_header.panels.network_panel.nethash_units == 'G') {
    // return units in GH/s
    return (hashes / 1000000000).toFixed(4);
  } else if (shared_pages.page_header.panels.network_panel.nethash_units == 'T') {
    // return units in TH/s
    return (hashes / 1000000000000).toFixed(4);
  } else if (shared_pages.page_header.panels.network_panel.nethash_units == 'P') {
    // return units in PH/s
    return (hashes / 1000000000000000).toFixed(4);
  } else {
    // return units in H/s
    return hashes.toFixed(4);
  }
}

function processVoutAddresses(address_list, vout_value, arr_vout, cb) {
  // check if there are any addresses to process
  if (address_list != null && address_list.length > 0) {
    // check if vout address is inside an array
    if (Array.isArray(address_list[0])) {
      // extract the address
      address_list[0] = address_list[0][0];
    }

    // check if vout address is unique, if so add to array, if not add its amount to existing index
    module.exports.is_unique(arr_vout, address_list[0], 'addresses', function(unique, index) {
      if (unique == true) {
        // unique vout
        module.exports.convert_to_satoshi(parseFloat(vout_value), function(amount_sat) {
          arr_vout.push({addresses: address_list[0], amount: amount_sat});

          return cb(arr_vout);
        });
      } else {
        // already exists
        module.exports.convert_to_satoshi(parseFloat(vout_value), function(amount_sat) {
          arr_vout[index].amount = arr_vout[index].amount + amount_sat;

          return cb(arr_vout);
        });
      }
    });
  } else {
    // no address, move to next vout
    return cb(arr_vout);
  }
}

function encodeP2PKaddress(p2pk_descriptor, cb, net=settings.getDefaultNet()) {
  // find the descriptor value
  module.exports.get_descriptorinfo(p2pk_descriptor, function(descriptor_info) {
    // check for errors
    if (descriptor_info != null) {
      // encode the address using the output descriptor
      module.exports.get_deriveaddresses(descriptor_info.descriptor, function(p2pkh_address) {
        // check for errors
        if (p2pkh_address != null) {
          // return P2PKH address
          return cb(p2pkh_address);
        } else {
          // address could not be encoded
          return cb(null);
        }
      }, net);
    } else {
      // address could not be encoded
      return cb(null);
    }
  }, net);
}

module.exports = {
  convert_to_satoshi: function(amount, cb) {
    // fix to 8dp & convert to string
    var fixed = amount.toFixed(8).toString();
    // remove decimal (.) and return integer
    return cb(parseInt(fixed.replace('.', '')));
  },

  get_hashrate: function(cb, net=settings.getDefaultNet(), lookup=-1, height=-1) {
    const shared_pages = settings.get(net, 'shared_pages')
    const api_cmds = settings.get(net, 'api_cmds')
    const algos = settings.get(net, 'algos')
    
    if (shared_pages.show_hashrate == false)
      return cb('-')

    if (shared_pages.page_header.panels.network_panel.nethash == 'netmhashps') {
      const cmd = prepareRpcCommand(api_cmds.getmininginfo)
      if (!(cmd.method == '' && cmd.parameters.length == 0)) {
        if (api_cmds.use_rpc) {
          rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
            if (response == 'There was an error. Check your console.') {
              return cb('-')
            }

            const hashps = {}
            hashps.nethash = !isNaN(body.networkhashps) ? convertHashUnits(body.networkhashps, net) : -1

            algos.forEach((algo) => {
              if (!isNaN(response['networkhashps_' + algo.algo]))
                hashps['nethash_' + algo.algo] = response['networkhashps_' + algo.algo]
            })

            if (Object.keys(hashps).length > 0) {
              return cb(hashps)
            } else {
              return cb('-')
            }
          })
        } else {
          const uri = base_url + 'getmininginfo/' + net
          request({uri: uri, json: true}, function (error, response, body) {
            if (body == 'There was an error. Check your console.') {
              // return a blank value
              return cb('-')
            } else {
              const hashps = {}

              algos.forEach((algo) => {
                if (!isNaN(response['networkhashps_' + algo.algo]))
                  hashps['nethash_' + algo.algo] = response['networkhashps_' + algo.algo]
              })

              if (Object.keys(hashps).length > 0) {
                return cb(hashps)
              } else {
                return cb('-')
              }
            }
          })
        }
      } else {
        // getmininginfo cmd not set
        return cb('-')
      }
    } else if (shared_pages.page_header.panels.network_panel.nethash == 'getnetworkhashps') {
      // load getnetworkhashps rpc call from settings
      var cmd = prepareRpcCommand(api_cmds.getnetworkhashps);
      // check if the rpc cmd is valid
      if (!(cmd.method == '' && cmd.parameters.length == 0)) {
        // check if getting data from wallet rpc or web api request
        if (api_cmds.use_rpc) {
          // get data from wallet via rpc cmd
          if (settings.isButkoin(net)) {
            cmd = prepareRpcCommand('getallnetworkhashps', [lookup, height])
            // cmd.parameters.lookup = -1
            // cmd.parameters.height = -1
          }
          rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
            // TODO: Double check invocation
            // check if an error msg was received from the rpc server
            if (response == 'There was an error. Check your console.')
              return cb('-');
            // check if the response has a value
            if (response) {
              // return hash value with proper units
              if (settings.isButkoin(net)) {
                return cb(response);
              } else 
                return cb(convertHashUnits(response, net));
            } else {
              // response is blank/null
              return cb('-');
            }
          });
        } else {
          // get data via internal web api request
          var uri = base_url + 'getnetworkhashps/' + net
          request({uri: uri, json: true}, function (error, response, body) {
            // check if an error msg was received from the web api server
            if (body == 'There was an error. Check your console.') {
              // return a blank value
              return cb('-');
            } else {
              // return hash value with proper units
              return cb(convertHashUnits(body));
            }
          });
        }
      } else {
        // getnetworkhashps cmd not set
        return cb('-');
      }
    } else {
      // Invalid network hashrate setting value
      return cb('-');
    }
  },

  get_difficulty: function(net, cb) {
    net = settings.getNet(net)
    const api_cmds = settings.get(net, 'api_cmds')
    const algos = settings.get(net, 'algos')
    const cmd = prepareRpcCommand(api_cmds.getdifficulty)

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method: 'getblockchaininfo', parameters: cmd.parameters}], function(response) {
          if (response == 'There was an error. Check your console.')
            return cb(null)
          else {
            const obj =  {}
            obj.height = !isNaN(response.blocks) ? response.blocks : -1
            obj.difficulty = !isNaN(response.difficulty) ? response.difficulty : -1

            algos.forEach((algo) => {
              if (!isNaN(response['difficulty_' + algo.algo]))
                obj['difficulty_' + algo.algo] = response['difficulty_' + algo.algo]
            })

            return cb(obj)
          }
        })
      } else {
        const uri = base_url + 'getdifficulty/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          if (body == 'There was an error. Check your console.')
            return cb(null)
          else
            return cb(body)
        })
      }
    } else {
      // cmd not in use. return null.
      return cb(null)
    }
  },

  get_connectioncount: function(net, cb) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getconnectioncount);

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getconnectioncount/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  // only sync.js
  get_masternodelist: function(net, cb) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getmasternodelist);

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net: net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getmasternodelist/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_blockcount: function(cb, net=settings.getDefaultNet()) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getblockcount);

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getblockcount/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_blockhash: function(height, cb, net=settings.getDefaultNet()) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getblockhash, (height ? [parseInt(height)] : []));

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getblockhash/' + net + '?height=' + (height ? height : '');
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_block: function(hash, cb, net=settings.getDefaultNet()) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getblock, (hash ? [hash] : []));

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getblock/' + net + '?hash=' + hash;
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_rawtransaction: function(hash, cb, net=settings.getDefaultNet()) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getrawtransaction, (hash ? [hash, 1] : []));

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getrawtransaction/' + net + '?txid=' + hash + '&decrypt=1';
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  // only used by heavy
  get_maxmoney: function(cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds.getmaxmoney);
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getmaxmoney/' + net;
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_maxvote: function(cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds.getmaxvote);
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getmaxvote/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_vote: function(cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds.getvote);
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getvote/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_phase: function(cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds.getphase);
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getphase/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_reward: function(cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds.getreward);
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getreward/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_estnext: function(cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds.getnextrewardestimate);
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getnextrewardestimate/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_nextin: function(cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds.getnextrewardwhenstr);
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getnextrewardwhenstr/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_descriptorinfo: function(descriptor, cb, net=settings.getDefaultNet()) {
    // format the descriptor correctly for use in the getdescriptorinfo cmd
    descriptor = 'pkh(' + descriptor.replace(' OP_CHECKSIG', '') + ')';

    var cmd = prepareRpcCommand(settings.blockchain_specific.bitcoin.api_cmds.getdescriptorinfo, (descriptor ? [descriptor] : []));
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getdescriptorinfo/' + net + '?descriptor=' + encodeURIComponent(descriptor);
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  get_deriveaddresses: function(descriptor, cb, net=settings.getDefaultNet()) {
    var cmd = prepareRpcCommand(settings.blockchain_specific.bitcoin.api_cmds.deriveaddresses, (descriptor ? [descriptor] : []));
    const api_cmds = settings.get(net, 'api_cmds')

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'deriveaddresses/' + net + '?descriptor=' + encodeURIComponent(descriptor);
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  // synchonous loop used to interate through an array,
  // avoid use unless absolutely neccessary
  syncLoop: function(iterations, process, exit) {
    var index = 0,
        done = false,
        shouldExit = false;

    var loop = {
      next: function() {
        if (done) {
          if (shouldExit && exit) {
            // exit if we're done
            exit();
          }

          // stop the loop if we're done
          return;
        }

        // if we're not finished
        if (index < iterations) {
          // increment our index
          index++;

          if (index % 100 === 0) {
            // clear stack
            setTimeout(function() {
              // run our process, pass in the loop
              process(loop);
            }, 1);
          } else {
            // run our process, pass in the loop
            process(loop);
          }
        } else {
          // otherwise we're done
          // make sure we say we're done
          done = true;

          if (exit) {
            // call the callback on exit
            exit();
          }
        }
      },
      iteration: function() {
        // return the loop number we're on
        return index - 1;
      },
      break: function(end) {
        // end the loop
        done = true;
        // passing end as true means we still call the exit callback
        shouldExit = end;
      }
    };

    loop.next();

    return loop;
  },

  balance_supply: function(cb, net=settings.getDefaultNet()) {
    AddressDb[net].find({}, 'balance').where('balance').gt(0).exec().then((docs) => {
      var count = 0;
      module.exports.syncLoop(docs.length, function (loop) {
        var i = loop.iteration();

        count = count + docs[i].balance;
        loop.next();
      }, function() {
        return cb(count);
      });
    }).catch((err) => {
      console.error("Failed to find address balances for chain '%s': %s", net, err)
      return cb(0);
    });
  },
  
  get_txoutsetinfo: function(net=settings.getDefaultNet(), cb) {
    const uri = base_url + 'gettxoutsetinfo/' + net
    request({uri: uri, json: true}, function (error, response, body) {
      if (!body || !body.total_amount || body == 'There was an error. Check your console.')
        return cb(null)
      else
        return cb(body)
    })
  },

  get_blockchaininfo: function(net=settings.getDefaultNet(), cb) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getblockchaininfo)

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net: net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          if (response == 'There was an error. Check your console.')
            return cb(null)
          else
            return cb(response)
        })
      } else {
        var uri = base_url + 'getblockchaininfo/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          if (body == 'There was an error. Check your console.')
            return cb(null)
          else
            return cb(body)
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null)
    }
  },

  get_peerinfo: function(net=settings.getDefaultNet(), cb) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.getpeerinfo);

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net: net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'getpeerinfo/' + net
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  verify_message: function(net=settings.getDefaultNet(), address, signature, message, cb) {
    const api_cmds = settings.get(net, 'api_cmds')
    var cmd = prepareRpcCommand(api_cmds.verifymessage, [address, signature, message]);

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          // check if an error msg was received from the rpc server
          if (response == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(response);
        });
      } else {
        var uri = base_url + 'verifymessage/' + net + '?address=' + address + '&signature=' + signature + '&message=' + message;
        request({uri: uri, json: true}, function (error, response, body) {
          // check if an error msg was received from the web api server
          if (body == 'There was an error. Check your console.')
            return cb(null);
          else
            return cb(body);
        });
      }
    } else {
      // cmd not in use. return null.
      return cb(null);
    }
  },

  validate_address: function(net=settings.getDefaultNet(), address, cb) {
    const api_cmds = settings.get(net, 'api_cmds')
    const cmd = prepareRpcCommand(api_cmds.validateaddress, [address])

    if (!(cmd.method == '' && cmd.parameters.length == 0)) {
      if (api_cmds.use_rpc) {
        rpcCommand([{net:net, method:cmd.method, parameters: cmd.parameters}], function(response) {
          if (response == 'Unexpected error.')
            return cb(null)
          else
            return cb(response)
        })
      } else {
        const uri = base_url + 'validateaddress/' + net + '?address=' + address
        request({uri: uri, json: true}, function (error, response, body) {
          if (body == 'Unexpected error.')
            return cb(null)
          else
            return cb(body)
        })
      }
    } else {
      // cmd not in use. return null.
      return cb(null)
    }
  },

  get_geo_location: function(address, cb) {
    request({uri: 'https://reallyfreegeoip.org/json/' + address, json: true}, function (error, response, geo) {
      return cb(error, geo);
    });
  },

  get_exchange_rates: function(cb) {
    request({uri: 'https://api.exchangerate.host/latest?base=USD', json: true}, function (error, response, data) {
      return cb(error, data);
    });
  },

  is_unique: function(array, object, key_name, cb) {
    var unique = true;
    var index = null;

    module.exports.syncLoop(array.length, function (loop) {
      var i = loop.iteration();

      if (array[i][key_name] == object) {
        unique = false;
        index = i;
        loop.break(true);
        loop.next();
      } else
        loop.next();
    }, function() {
      return cb(unique, index);
    });
  },

  calculate_total: function(vout, cb) {
    var total = 0;

    module.exports.syncLoop(vout.length, function (loop) {
      var i = loop.iteration();

      total = total + vout[i].amount;
      loop.next();
    }, function() {
      return cb(total);
    });
  },

  prepare_vout: function(net=settings.getDefaultNet(), vout, txid, vin, vhidden, cb) {
    var arr_vout = [];
    var arr_vin = vin;
    var tx_type = null;

    module.exports.syncLoop(vout.length, function (loop) {
      var i = loop.iteration();
      // make sure vout has an address
      if (vout[i].scriptPubKey.type != 'nonstandard' && vout[i].scriptPubKey.type != 'nulldata') {
        // check if this is a zerocoin tx
        if (vout[i].scriptPubKey.type != 'zerocoinmint') {
          var address_list = vout[i].scriptPubKey.addresses;
          // check if there are one or more addresses in the vout
          if (address_list == null || address_list.length == 0) {
            // no addresses defined
            // check if there is a single address defined
            if (vout[i].scriptPubKey.address == null) {
              // no single address defined
              // check if bitcoin features are enabled
              if (settings.blockchain_specific.bitcoin.enabled == true) {
                // assume the asm value is a P2PK (Pay To Pubkey) public key that should be encoded as a P2PKH (Pay To Pubkey Hash) address
                encodeP2PKaddress(vout[i].scriptPubKey.asm, function(p2pkh_address) {
                  // check if the address was encoded properly
                  if (p2pkh_address != null) {
                    // mark this tx as p2pk
                    tx_type = 'p2pk';
                    // process vout addresses
                    processVoutAddresses(p2pkh_address, vout[i].value, arr_vout, function(vout_array) {
                      // save updated array
                      arr_vout = vout_array;
                      // move to next vout
                      loop.next();
                    });
                  } else {
                    // could not decipher the address, save as unknown and move to next vout
                    console.log('Failed to find vout address from tx ' + txid);
                    // process vout addresses
                    processVoutAddresses(['unknown_address'], vout[i].value, arr_vout, function(vout_array) {
                      // save updated array
                      arr_vout = vout_array;
                      // move to next vout
                      loop.next();
                    });
                  }
                }, net);
              } else {
                // could not decipher the address, save as unknown and move to next vout
                console.log('Failed to find vout address from tx ' + txid);
                // process vout addresses
                processVoutAddresses(['unknown_address'], vout[i].value, arr_vout, function(vout_array) {
                  // save updated array
                  arr_vout = vout_array;
                  // move to next vout
                  loop.next();
                });
              }
            } else {
              // process vout address
              processVoutAddresses([vout[i].scriptPubKey.address], vout[i].value, arr_vout, function(vout_array) {
                // save updated array
                arr_vout = vout_array;
                // move to next vout
                loop.next();
              });
            }
          } else {
            // process vout addresses
            processVoutAddresses(address_list, vout[i].value, arr_vout, function(vout_array) {
              // save updated array
              arr_vout = vout_array;
              // move to next vout
              loop.next();
            });
          }
        } else {
          // TODO: add support for zerocoin transactions
          console.log('Zerocoin tx found. skipping for now as it is unsupported');
          tx_type = "zerocoin";
          loop.next();
        }
      } else {
        // no address, move to next vout
        loop.next();
      }
    }, function() {
      if (typeof vout[0] !== 'undefined' && vout[0].scriptPubKey.type == 'nonstandard') {
        if (arr_vin.length > 0 && arr_vout.length > 0) {
          if (arr_vin[0].addresses == arr_vout[0].addresses) {
            //PoS
            arr_vout[0].amount = arr_vout[0].amount - arr_vin[0].amount;
            arr_vin.shift();

            return cb(arr_vout, arr_vin, tx_type);
          } else
            return cb(arr_vout, arr_vin, tx_type);
        } else
          return cb(arr_vout, arr_vin, tx_type);
      } else
        return cb(arr_vout, arr_vin, tx_type);
    });
  },

  get_input_addresses: function(net=settings.getDefaultNet(), input, vout, cb) {
    var addresses = [];

    if (input.coinbase) {
      var amount = 0;

      module.exports.syncLoop(vout.length, function (loop) {
        var i = loop.iteration();

        amount = amount + parseFloat(vout[i].value);
        loop.next();
      }, function() {
        addresses.push({hash: 'coinbase', amount: amount});
        return cb(addresses, null);
      });
    } else {
      module.exports.get_rawtransaction(input.txid, function(tx) {
        if (tx) {
          var tx_type = null;

          module.exports.syncLoop(tx.vout.length, function (loop) {
            var i = loop.iteration();

            if (tx.vout[i].n == input.vout) {
              if (tx.vout[i].scriptPubKey.addresses || tx.vout[i].scriptPubKey.address) {
                var new_address = tx.vout[i].scriptPubKey.address || tx.vout[i].scriptPubKey.addresses[0];

                // check if address is inside an array
                if (Array.isArray(new_address)) {
                  // extract the address
                  new_address = new_address[0];
                }

                module.exports.is_unique(addresses, new_address, 'hash', function(unique, index) {
                  if (unique == true)
                    addresses.push({hash: new_address, amount: tx.vout[i].value});
                  else
                    addresses[index].amount = addresses[index].amount + tx.vout[i].value;

                  loop.break(true);
                  loop.next();
                });
              } else {
                // no addresses defined
                // check if bitcoin features are enabled
                if (settings.blockchain_specific.bitcoin.enabled == true) {
                  // assume the asm value is a P2PK (Pay To Pubkey) public key that should be encoded as a P2PKH (Pay To Pubkey Hash) address
                  encodeP2PKaddress(tx.vout[i].scriptPubKey.asm, function(p2pkh_address) {
                    // check if the address was encoded properly
                    if (p2pkh_address != null) {
                      // mark this tx as p2pk
                      tx_type = 'p2pk';

                      // check if address is inside an array
                      if (Array.isArray(p2pkh_address)) {
                        // extract the address
                        p2pkh_address = p2pkh_address[0];
                      }

                      // save the P2PKH address
                      module.exports.is_unique(addresses, p2pkh_address, 'hash', function(unique, index) {
                        if (unique == true)
                          addresses.push({hash: p2pkh_address, amount: tx.vout[i].value});
                        else
                          addresses[index].amount = addresses[index].amount + tx.vout[i].value;

                        loop.break(true);
                        loop.next();
                      });
                    } else {
                      // could not decipher the address, save as unknown and move to next vin
                      console.log('Failed to find vin address from tx ' + input.txid);
                      module.exports.is_unique(addresses, 'unknown_address', 'hash', function(unique, index) {
                        if (unique == true)
                          addresses.push({hash: 'unknown_address', amount: tx.vout[i].value});
                        else
                          addresses[index].amount = addresses[index].amount + tx.vout[i].value;

                        loop.break(true);
                        loop.next();
                      });
                    }
                  }, net);
                } else {
                  // could not decipher the address, save as unknown and move to next vin
                  console.log('Failed to find vin address from tx ' + input.txid);
                  module.exports.is_unique(addresses, 'unknown_address', 'hash', function(unique, index) {
                    if (unique == true)
                      addresses.push({hash: 'unknown_address', amount: tx.vout[i].value});
                    else
                      addresses[index].amount = addresses[index].amount + tx.vout[i].value;

                    loop.break(true);
                    loop.next();
                  });
                }
              }
            } else
              loop.next();
          }, function() {
            return cb(addresses, tx_type);
          });
        } else
          return cb();
      }, net);
    }
  },

  prepare_vin: function(net=settings.getDefaultNet(), tx, cb) {
    var arr_vin = [];
    var tx_type = null;

    module.exports.syncLoop(tx.vin.length, function (loop) {
      var i = loop.iteration();

      module.exports.get_input_addresses(net, tx.vin[i], tx.vout, function(addresses, tx_type_vin) {
        // check if the tx type is set
        if (tx_type_vin != null) {
          // set the tx type return value
          tx_type = tx_type_vin;
        }

        if (addresses && addresses.length) {
          module.exports.is_unique(arr_vin, addresses[0].hash, 'addresses', function(unique, index) {
            if (unique == true) {
              module.exports.convert_to_satoshi(parseFloat(addresses[0].amount), function(amount_sat) {
                arr_vin.push({addresses: addresses[0].hash, amount: amount_sat});
                loop.next();
              });
            } else {
              module.exports.convert_to_satoshi(parseFloat(addresses[0].amount), function(amount_sat) {
                arr_vin[index].amount = arr_vin[index].amount + amount_sat;
                loop.next();
              });
            }
          });
        } else {
          // could not decipher the address, save as unknown and move to next vin
          console.log('Failed to find vin address from tx ' + tx.txid);
          module.exports.is_unique(arr_vin, 'unknown_address', 'addresses', function(unique, index) {
            if (unique == true)
              arr_vin.push({addresses: 'unknown_address', amount: 0});

            loop.next();
          });
        }
      });
    }, function() {
      return cb(arr_vin, tx_type);
    });
  },

  create_lock: function(lock, net=settings.getDefaultNet()) {
    const fs = require('fs');
    const fname = './tmp/' + net + '-' + lock + '.pid';
    try {
      const pid = process.pid.toString();
      fs.appendFileSync(fname, pid);
      debug("Created lock '%s' for PID '%s'", fname, pid)
      return true;
    } catch(err) {
      console.log("Error: Unable to create lock: %s", fname);
      return false;
    }
  },

  remove_lock: function(lock, net=settings.getDefaultNet()) {
    const fs = require('fs');
    const fname = './tmp/' + net + '-' + lock + '.pid';
    try {
      fs.unlinkSync(fname);
      debug("Removed lock '%s'.", fname)
      return true;
    } catch(err) {
      console.log("Error: Unable to remove lock: %s", fname);
      return false;
    }
  },

  is_locked: function(lock_array, net=settings.getDefaultNet()) {
    const fs = require('fs');
    const path = require('path');
    var retVal = false;

    // loop through all lock files that need to be checked
    for (var i = 0; i < lock_array.length; i++) {
      const pidFile = path.join(path.dirname(__dirname), 'tmp', net + '-' + `${lock_array[i]}.pid`);
      // check if the script is already running (tmp/file.pid file already exists)
      const exists = fs.existsSync(pidFile);
      debug("Lock '%s' exists -> %s", pidFile, exists);
      if (exists) {
        const { execSync } = require('child_process');
        var deactivateLock = false;

        // the pid file exists
        // determine the operating system
        switch (process.platform) {
          case 'win32':
            // windows
            // run a cmd that will determine if the lock should still be active
            var cmdResult = execSync(`tasklist /FI "PID eq ${fs.readFileSync(pidFile).toString()}"`);

            // check if the process that created the lock is actually still running (crude check by testing for # of carriage returns or node.exe process running, but should work universally across different systems and languages)
            if (cmdResult.toString().split('\n').length < 4 || cmdResult.toString().toLowerCase().indexOf('\nnode.exe') == -1) {
              // lock should be deactivated
              deactivateLock = true;
            }

            break;
          default:
            // linux or other
            // run a cmd that will determine if the lock should still be active

            try {
              var cmdResult = execSync('ps -p `cat "' + pidFile + '"` > /dev/null');
            } catch (err) {
              // if an error occurs, the process is NOT running and therefore the lock should be deactivated
              deactivateLock = true;
            }
        }

        // check if the lock should be deactivated
        if (deactivateLock) {
          // script is not actually running so the lock file can be deleted
          try {
            fs.rmSync(pidFile);
            console.log("Lock '%s' deactivated.", pidFile)
          } catch(err) {
            console.log(`Failed to delete lock file ${pidFile}: ${err}`);
          }
        } else {
          // script is running
          debug(`${lock_array[i]} script is running..`);

          retVal = true;

          break;
        }
      }
    }

    return retVal;
  }
};