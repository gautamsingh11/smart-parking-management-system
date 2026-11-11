let socketServer;

export function setAvailabilitySocket(io) {
  socketServer = io;
}

export function publishAvailability(locationId, payload) {
  socketServer?.to(`location:${locationId}`).emit('availability:update', {
    locationId: String(locationId),
    ...payload,
    emittedAt: new Date().toISOString(),
  });
}
