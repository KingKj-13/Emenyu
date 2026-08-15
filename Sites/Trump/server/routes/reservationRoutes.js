const { tenantPaths } = require('../utils/helpers');

function registerReservationRoutes(app, config, controllers, adminAuth) {
  const basePaths = tenantPaths(config, '/api/reservations');
  const itemPaths = tenantPaths(config, '/api/reservations/:id');

  app.get(basePaths, adminAuth, controllers.reservation.listReservations);
  app.post(basePaths, controllers.reservation.createReservation);
  app.patch(itemPaths, adminAuth, controllers.reservation.updateReservation);
  app.delete(itemPaths, adminAuth, controllers.reservation.deleteReservation);
}

module.exports = { registerReservationRoutes };
