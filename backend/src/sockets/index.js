module.exports = function registerSockets(io) {
  io.on('connection', (socket) => {
    // room per user so dispatch offers / status updates can be pushed
    socket.on('join', (room) => socket.join(room));
  });
};
