const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Prevent worker out-of-memory errors on Node 24+
config.maxWorkers = 2;

module.exports = config;
