// Each authenticated user joins a private room (user:<id>) so notifications can be pushed to them only.
module.exports = function registerSockets(io, jwt) {
  io.use((socket, next) => {
    try {
      socket.userId = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET).id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => socket.join(`user:${socket.userId}`));
};
