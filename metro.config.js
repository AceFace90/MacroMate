const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js optionally imports @opentelemetry/api for server-side
// tracing. We don't use it; alias to an empty stub so Metro doesn't fail
// bundling for web/native.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': path.resolve(__dirname, 'src/services/empty-module.js'),
};

module.exports = config;
