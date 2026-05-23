const fs = require('fs');
const path = require('path');

const layerSrc = '/opt/nodejs/src';
const localSrc = path.resolve(__dirname, '..');
const sharedSrc = fs.existsSync(layerSrc) ? layerSrc : localSrc;

module.exports = (modulePath) => require(path.join(sharedSrc, modulePath));
