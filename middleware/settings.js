const path = require('node:path');

module.exports = {
  flowFile: '/opt/inventory/flows.json',
  flowFilePretty: true,
  uiPort: 1880,
  httpStatic: process.env.WEB_ROOT || '/data/web',
  httpStaticRoot: '/app',
  contextStorage: {
    default: {
      module: 'localfilesystem',
    },
  },
  functionGlobalContext: {
    inventory: require(path.join(__dirname, 'inventory.js')),
  },
  logging: {
    console: {
      level: process.env.NODE_RED_LOG_LEVEL || 'info',
      metrics: false,
      audit: false,
    },
  },
};