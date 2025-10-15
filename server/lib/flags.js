module.exports = {
  MULTI_TENANT_ENABLED: process.env.MULTI_TENANT_ENABLED === 'true',
  DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID || 'demo-tenant',
};
