function registerReservationRoutes(app, controllers, adminAuth) {
  const basePaths = ['/api/reservations', '/Trump/api/reservations', '/trump/api/reservations'];
  const itemPaths = ['/api/reservations/:id', '/Trump/api/reservations/:id', '/trump/api/reservations/:id'];

  app.get(basePaths, adminAuth, controllers.reservation.listReservations);
  app.post(basePaths, controllers.reservation.createReservation);
  app.patch(itemPaths, adminAuth, controllers.reservation.updateReservation);
  app.delete(itemPaths, adminAuth, controllers.reservation.deleteReservation);
}

module.exports = { registerReservationRoutes };
