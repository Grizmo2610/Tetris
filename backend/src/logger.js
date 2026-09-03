'use strict';

function log(level, event, data = {}) {
  const entry = { level, ts: new Date().toISOString(), event, ...data };
  console.log(JSON.stringify(entry));
}

const logger = {
  info:  (event, data) => log('info',  event, data),
  warn:  (event, data) => log('warn',  event, data),
  error: (event, data) => log('error', event, data),
};

module.exports = logger;
