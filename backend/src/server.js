require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const registerSockets = require('./sockets');
const registerJobs = require('./jobs');
const { setIo } = require('./services/realtime');

const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is required'); process.exit(1); }

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerSockets(io, jwt);
setIo(io);

connectDB()
  .then(() => {
    registerJobs();
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
