const fs = require('fs');
const path = require('path');

const layerSrc = '/opt/nodejs/src';
const localSrc = path.resolve(__dirname, '..');

const moduleExists = (basePath, modulePath) => {
  const resolved = path.join(basePath, modulePath);

  return fs.existsSync(resolved)
    || fs.existsSync(`${resolved}.js`)
    || fs.existsSync(path.join(resolved, 'index.js'));
};

module.exports = (modulePath) => {
  const sharedSrc = moduleExists(localSrc, modulePath) ? localSrc : layerSrc;
  return require(path.join(sharedSrc, modulePath));
};
