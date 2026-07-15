const { tenantPaths } = require('../utils/helpers');

function registerUploadRoutes(app, config, uploadController, adminAuth) {
  const uploadPaths = tenantPaths(config, '/api/upload');
  const deletePaths = tenantPaths(config, '/api/upload/:filename');
  app.post(uploadPaths, adminAuth, uploadController.middleware, uploadController.uploadMedia);
  app.delete(deletePaths, adminAuth, uploadController.deleteMedia);
}

module.exports = {
  registerUploadRoutes
};
