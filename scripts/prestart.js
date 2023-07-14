const debug = require('debug')('debug');
const minNodeVersionMajor = '17';
const minNodeVersionMinor = '19';
const minNodeVersionRevision = '0';

// get the nodejs version
var nodeVersion = process.version;
var nodeVersionMajor = '0';
var nodeVersionMinor = '0';
var nodeVersionRevision = '0';

// check if the nodejs version # is blank or a very long string as that would usually indicate a problem
if (nodeVersion != null && nodeVersion != '' && nodeVersion.length < 16) {
  // Remove the 'v' from the beginning of the version string
  if (nodeVersion.indexOf('v') == 0)
    nodeVersion = nodeVersion.slice(1);

  // split node version string into major, minor and revision
  var splitVersion = nodeVersion.split('.');

  nodeVersionMajor = splitVersion[0];

  if (splitVersion.length > 1)
    nodeVersionMinor = splitVersion[1];

  if (splitVersion.length > 2)
    nodeVersionRevision = splitVersion[2];

  debug("Got node version '%s': %d.%d.%d.", nodeVersion, nodeVersionMajor, nodeVersionMinor, nodeVersionRevision)
}

// check if the installed nodejs is an older version than supported by the explorer
if (!(nodeVersionMajor > minNodeVersionMajor || (nodeVersionMajor == minNodeVersionMajor && (nodeVersionMinor > minNodeVersionMinor || (nodeVersionMinor == minNodeVersionMinor && nodeVersionRevision >= minNodeVersionRevision))))) {
  console.log(`Please install an updated version of nodejs.\n\nInstalled: ${nodeVersion}\nRequired:  ${minNodeVersionMajor}.${minNodeVersionMinor}.${minNodeVersionRevision}`);
  process.exit(0);
}

function check_argument_passed(cb) {
  const pidName = (process.argv[2] != null && process.argv[2] != '' && (process.argv[2] == 'pm2') ? process.argv[2] : 'node');

  // check 1st argument
  if (process.argv[2] != null) {
    const { exec } = require('child_process');

    // determine which argument was passed
    switch (process.argv[2]) {
      case 'pm2':
        // windows pm2 has problem loading locally, but other os's should work fine
        const isWinOS = process.platform == 'win32';
        
        // run a cmd to check if pm2 is installed
        exec(`npm list${(isWinOS ? ' -g' : '')} pm2`, (err, stdout, stderr) => {
          // split stdout string by new line
          var splitResponse = (stdout == null ? '' : stdout).split('\n').filter(element => element);

          // check if the cmd result contains an @ symbol
          if (splitResponse[splitResponse.length - 1].indexOf('@') == -1) {
            console.log('Installing pm2 module.. Please wait..');

            // install pm2
            exec(`npm install pm2@latest${(isWinOS ? ' -g' : '')}`, (err, stdout, stderr) => {
              // always return the pidName for now without checking results
              return cb(pidName);
            });
          } else
            return cb(pidName);
        });
        break;
      default:
        // argument not passed or unknown argument
        return cb(pidName);
    }
  } else
    return cb(pidName);
}

// check if an argument was passed into this script ???
check_argument_passed(function(pidName) {
  const execSync = require('child_process').execSync;
  execSync('node ./scripts/compile_css.js', {stdio : 'inherit'});

  // finished pre-loading
  process.exit(0);
});