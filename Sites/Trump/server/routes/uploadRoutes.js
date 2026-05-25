function registerUploadRoutes(app, uploadController, adminAuth) {
  const uploadPaths = ['/api/upload', '/Trump/api/upload', '/trump/api/upload'];
  app.post(uploadPaths, adminAuth, uploadController.middleware, uploadController.uploadMedia);
}

module.exports = {
  registerUploadRoutes
};
