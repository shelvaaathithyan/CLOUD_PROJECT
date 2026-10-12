import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import cloudRoutes from './routes/cloudRoutes';
import { SocketService } from './services/socketService';
import { NodeMonitor } from './services/nodeMonitor';

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT) || 5050;

app.use(cors());
app.use(express.json());

SocketService.initialize(httpServer);

app.use('/cloud', cloudRoutes);

// Serve static UI for Cloud Server Control Plane
import path from 'path';
app.use(express.static(path.join(__dirname, '../public')));

httpServer.listen(PORT, () => {
  console.log(`Cloud Server running on port ${PORT}`);
  NodeMonitor.start();
});
