import { CloudServerClient } from '../services/cloudServerClient';
import { SocketService } from '../services/socketService';

export class SimulationManager {
  private static status: 'STOPPED' | 'RUNNING' | 'PAUSED' = 'STOPPED';
  private static loadLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  private static interval: NodeJS.Timeout | null = null;

  public static getStatus() {
    return { status: this.status, loadLevel: this.loadLevel };
  }

  public static start(loadLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'STRESS') {
    this.status = 'RUNNING';
    if (loadLevel !== 'STRESS') {
      this.loadLevel = loadLevel;
    }
    
    if (this.interval) clearInterval(this.interval);
    
    if (loadLevel === 'STRESS') {
      for (let i = 0; i < 50; i++) {
        this.generateRequest();
      }
    } else {
      let delay = 10000;
      if (loadLevel === 'LOW') delay = 8000;
      if (loadLevel === 'MEDIUM') delay = 2500;
      if (loadLevel === 'HIGH') delay = 1000;

      this.interval = setInterval(() => {
        if (this.status === 'RUNNING') {
          this.generateRequest();
        }
      }, delay);
    }

    SocketService.emit('SIMULATION_STATUS', this.getStatus());
  }

  public static pause() {
    this.status = 'PAUSED';
    SocketService.emit('SIMULATION_STATUS', this.getStatus());
  }

  public static stop() {
    this.status = 'STOPPED';
    if (this.interval) clearInterval(this.interval);
    SocketService.emit('SIMULATION_STATUS', this.getStatus());
  }

  public static async processManualRequest(req: any) {
    return await CloudServerClient.requestResource(req);
  }

  private static async generateRequest() {
    await CloudServerClient.requestResource(SimulationManager.randomTask('Auto Task'));
  }

  /**
   * Random task sized for the worker nodes (100–200 CPU units, 512–1024 MB RAM each).
   * CPU units: 100 = one full core. RAM and storage are in MB.
   */
  public static randomTask(namePrefix: string) {
    const between = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const types = ['CPU', 'MEMORY', 'MIXED'] as const;
    const type = types[Math.floor(Math.random() * types.length)];

    const profile = {
      CPU: { cpu: [40, 90], ram: [32, 96] },
      MEMORY: { cpu: [10, 30], ram: [192, 384] },
      MIXED: { cpu: [30, 60], ram: [96, 192] },
    }[type];

    return {
      taskName: `${namePrefix} ${Math.floor(Math.random() * 1000)}`,
      taskType: type,
      cpuRequired: between(profile.cpu[0], profile.cpu[1]),
      ramRequired: between(profile.ram[0], profile.ram[1]),
      storageRequired: between(10, 100),
      estimatedExecutionTime: between(5, 20),
      urgency: between(0, 99),
    };
  }
}
