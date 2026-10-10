import { Router } from 'express';
import { CloudServerClient } from '../services/cloudServerClient';
import { SimulationManager } from '../simulation/simulationManager';

const router = Router();

router.get('/', async (req, res) => {
  const tasks = await CloudServerClient.getTasks();
  res.json(tasks);
});

router.post('/', async (req, res) => {
  const result = await SimulationManager.processManualRequest(req.body);
  res.json(result);
});

router.get('/queue', async (req, res) => {
  const queue = await CloudServerClient.getQueue();
  res.json(queue);
});

router.get('/metrics/costs', async (req, res) => {
  const costs = await CloudServerClient.getCostMetrics();
  res.json(costs);
});

export default router;
