const CLOUD_SERVER_URL = `${process.env.CLOUD_SERVER_ORIGIN || 'http://localhost:5050'}/cloud`;

export class CloudServerClient {
  public static async requestResource(taskReq: any) {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskReq),
      });
      if (!res.ok) throw new Error('Failed to request resource');
      return await res.json();
    } catch (error) {
      console.error('Error requesting resource:', error);
      return null;
    }
  }

  public static async getResources() {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/resources`);
      if (!res.ok) throw new Error('Failed to get resources');
      return await res.json();
    } catch (error) {
      console.error('Error getting resources:', error);
      return null;
    }
  }

  public static async getQueue() {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/queue`);
      if (!res.ok) throw new Error('Failed to get queue');
      return await res.json();
    } catch (error) {
      console.error('Error getting queue:', error);
      return null;
    }
  }

  public static async getTasks() {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/tasks`);
      if (!res.ok) throw new Error('Failed to get tasks');
      return await res.json();
    } catch (error) {
      console.error('Error getting tasks:', error);
      return null;
    }
  }

  public static async getMetrics() {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/metrics`);
      if (!res.ok) throw new Error('Failed to get metrics');
      return await res.json();
    } catch (error) {
      console.error('Error getting metrics:', error);
      return null;
    }
  }

  public static async getCostMetrics() {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/metrics/costs`);
      if (!res.ok) throw new Error('Failed to get cost metrics');
      return await res.json();
    } catch (error) {
      console.error('Error getting cost metrics:', error);
      return null;
    }
  }

  public static async releaseTask(taskId: string) {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/release/${taskId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to release task');
      const data = await res.json();
      return data.success;
    } catch (error) {
      console.error('Error releasing task:', error);
      return false;
    }
  }

  public static async getStatus() {
    try {
      const res = await fetch(`${CLOUD_SERVER_URL}/status`);
      if (!res.ok) throw new Error('Failed to get status');
      return await res.json();
    } catch (error) {
      console.error('Error getting status:', error);
      return null;
    }
  }
}
