module.exports = ({ env }) => ({
  url: env('STRAPI_ADMIN_PATH', '/cms'),
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'admin-jwt-secret-change-me'),
  },
  secrets: {
    encryptionKey: env('ADMIN_ENCRYPTION_KEY'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'api-token-salt-change-me'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'transfer-token-salt-change-me'),
    },
  },
  flags: {
    nps: false,
    promoteEE: false,
  },
});
