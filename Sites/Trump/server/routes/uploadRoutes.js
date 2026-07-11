const { tenantPaths } = require('../utils/helpers');

function registerUploadRoutes(app, config, uploadController, adminAuth) {
  const uploadPaths = tenantPaths(config, '/api/upload');
  app.post(uploadPaths, adminAuth, uploadController.middleware, uploadController.uploadMedia);
}

module.exports = {
  registerUploadRoutes
};
