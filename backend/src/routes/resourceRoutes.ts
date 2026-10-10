import { Router } from 'express';
import { CloudServerClient } from '../services/cloudServerClient';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const resources = await CloudServerClient.getResources();
    res.json(resources);
  } catch (e) {
    res.status(503).json({ error: 'Cloud server unavailable' });
  }
});

router.get('/utilization', async (req, res) => {
  try {
    const utilization = await CloudServerClient.getMetrics();
    res.json(utilization);
  } catch (e) {
    res.status(503).json({ error: 'Cloud server unavailable' });
  }
});

router.get('/costs', async (req, res) => {
  try {
    const costs = await CloudServerClient.getCostMetrics();
    res.json(costs);
  } catch (e) {
    res.status(503).json({ error: 'Cloud server unavailable' });
  }
});

export default router;
