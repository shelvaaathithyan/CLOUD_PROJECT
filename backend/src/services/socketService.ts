import { Server as SocketServer } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { Server as HttpServer } from 'http';

export class SocketService {
  private static io: SocketServer;
  private static cloudClient: ClientSocket;

  public static initialize(server: HttpServer) {
    // 1. Setup Backend Server to serve Frontend
    this.io = new SocketServer(server, { cors: { origin: '*' } });
    
    this.io.on('connection', (socket) => {
      console.log('Frontend Client connected:', socket.id);
    });

    // 2. Setup Client to listen to Cloud Server
    this.cloudClient = io(process.env.CLOUD_SERVER_ORIGIN || 'http://localhost:5050');
    
    this.cloudClient.on('connect', () => {
      console.log('Connected to Cloud Server');
    });

    // Proxy events from Cloud Server -> Frontend
    const eventsToProxy = [
      'RESOURCE_UPDATED',
      'TASK_ALLOCATED',
      'TASK_QUEUED',
      'TASK_STARTED',
      'TASK_COMPLETED',
      'TASK_FAILED',
      'QUEUE_UPDATED'
    ];

    eventsToProxy.forEach(event => {
      this.cloudClient.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  public static emit(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}
