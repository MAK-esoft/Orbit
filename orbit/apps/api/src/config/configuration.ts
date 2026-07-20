/**
 * Centralized typed configuration loaded from environment variables.
 * Consumed via Nest's ConfigService (e.g. config.get('jwt.accessSecret')).
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  // Honor the platform-provided PORT (Render/Heroku set this) first, then our
  // own API_PORT, then the local default.
  port: parseInt(process.env.PORT ?? process.env.API_PORT ?? '4000', 10),
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  tokens: {
    setupExpiresHours: parseInt(process.env.SETUP_TOKEN_EXPIRES_HOURS ?? '48', 10),
    resetExpiresHours: parseInt(process.env.RESET_TOKEN_EXPIRES_HOURS ?? '1', 10),
  },

  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'no-reply@orbit.irbas.com',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  storage: {
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? '10', 10),
  },

  rateLimit: {
    // Generous global cap for normal SPA traffic (per IP, across all routes).
    // Auth endpoints set their own strict @Throttle overrides.
    ttlSeconds: parseInt(process.env.RATE_LIMIT_TTL_SECONDS ?? '60', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '300', 10),
  },

  // Background n8n workflow integration.
  integration: {
    // Shared secret required on every /integrations/* request (X-Integration-Key).
    apiKey: process.env.INTEGRATION_API_KEY,
    // n8n webhook that receives app-originated submissions for enrichment.
    // When unset, the round-trip dispatch is disabled and the app behaves as before.
    n8nAppSubmissionWebhookUrl: process.env.N8N_APP_SUBMISSION_WEBHOOK_URL,
    // System user that owns workflow-originated submissions.
    workflowBotUserId: process.env.WORKFLOW_BOT_USER_ID,
    // Public base URL n8n can reach to fetch attachments (e.g. via tunnel).
    publicApiBaseUrl:
      process.env.PUBLIC_API_BASE_URL ?? process.env.API_URL ?? 'http://localhost:4000',
  },
});
