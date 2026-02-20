module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS', ['app-key-1', 'app-key-2', 'app-key-3', 'app-key-4']),
  },
  url: env('STRAPI_URL', ''),
});
