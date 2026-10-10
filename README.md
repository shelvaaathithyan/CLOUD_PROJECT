# Smart Cloud Resource Allocation Engine

## Project Overview
This project is a complete working simulation of a cloud resource allocation engine. It models a virtual data center with CPU, GPU, RAM, and Storage resources, and handles incoming computational requests by evaluating their requirements against available resources and priority scores. The system employs a priority-based queueing mechanism with an aging algorithm to prevent starvation, and an allocation engine that determines resource suitability. 

The frontend provides a professional, real-time monitoring dashboard typical of enterprise DevOps/Cloud Infrastructure tools (e.g., AWS CloudWatch, Kubernetes Dashboard).

## Architecture

The system consists of three distinct applications:
1. **Frontend**: React application for the user interface and monitoring.
2. **Backend**: Express.js server that houses the Priority Engine, Queue Engine, Allocation Engine, and coordinates the simulation.
3. **Mock Cloud Server**: A separate process that mathematically represents the cloud infrastructure state (CPU, GPU, RAM, Storage).

```
Frontend (Port: 5173)  <--WebSockets/HTTP-->  Backend (Port: 4000)  <--HTTP-->  Mock Cloud Server (Port: 5000)
```

## Technologies
- **Frontend**: React, Vite, TypeScript, CSS Modules, React Router, Recharts, Socket.io-client.
- **Backend**: Node.js, Express.js, TypeScript, Socket.io, UUID.
- **Cloud Server**: Node.js, Express.js, TypeScript.

## Folder Structure
```
c:/Cloud Project/
├── frontend/             # React UI
│   ├── src/
│   │   ├── components/
│   │   ├── pages/        # Dashboard, Infrastructure, Queue, Requests, Analytics, Allocation Engine
│   │   ├── layouts/
│   │   ├── services/     # WebSocket service
│   │   └── styles/
├── backend/              # Allocation Engine and Request API
│   ├── src/
│   │   ├── engines/      # PriorityEngine, AllocationEngine, QueueEngine
│   │   ├── simulation/   # Workload simulator
│   │   ├── services/     # Cloud API client, WebSockets
│   │   └── routes/
└── cloud-server/         # Mock cloud infrastructure
    ├── src/
    │   ├── resources/    # Resource manager (tracks allocated vs free capacity)
    │   └── routes/
```

## How to Install
Run the following from the root directory to install dependencies for all packages (assuming you have bash or similar, otherwise run `npm install` in each directory individually):
```bash
cd cloud-server && npm install
cd ../backend && npm install
cd ../frontend && npm install
```

## How to Run

1. **Run Cloud Server**:
   ```bash
   cd cloud-server
   npm run start
   ```

2. **Run Backend**:
   ```bash
   cd backend
   npm run start
   ```

3. **Run Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

## Priority Formula
The system assigns a priority score between 0 and 100 based on the following formula:
`Score = (0.30 * CPU Requirement) + (0.30 * GPU Requirement) + (0.20 * Normalized RAM) + (0.20 * Urgency)`

Scores are classified as:
- **LOW**: 0-40
- **MEDIUM**: 41-70
- **HIGH**: 71-100

## Allocation Algorithm
Tasks are checked against current availability:
1. Validate required vs available total capacity.
2. Calculate a Suitability Score: `Priority Score + (Resource Availability % * 0.5)`
3. The queue is continuously sorted by `Priority Score + Waiting Time Bonus (aging)`.
4. Highest suitability task is removed from the queue and assigned resources.

## Queue Algorithm (Aging)
To prevent starvation, tasks that stay in the queue receive a `WaitingTimeBonus`. Every 5 seconds, tasks receive +1 bonus point to their effective priority score, pushing older tasks up the queue dynamically.

## Simulation Explanation
The backend features a `SimulationManager` that generates tasks based on selected load levels:
- **Low**: ~7 requests/min
- **Medium**: ~24 requests/min
- **High**: ~60 requests/min
- **Stress**: Immediate burst of 50 tasks

Tasks have an `estimatedExecutionTime` (5 to 20 seconds). When a task starts, the backend issues an allocation to the Mock Cloud Server. After the time expires, the task completes, freeing up resources and triggering a fresh queue process.

## API Documentation

### Mock Cloud Server
- `GET /resources`: Returns all resources.
- `GET /resources/utilization`: Returns percentage-based utilization of all resources.
- `POST /resources/allocate`: Deducts requested capacity from available.
- `POST /resources/release`: Frees up requested capacity.

### Backend Server
- `GET /api/tasks`: Returns all tasks.
- `GET /api/tasks/queue`: Returns queued tasks and stats.
- `GET /api/resources`: Proxies cloud resources.
- `POST /api/simulation/start`: Starts load generation (body: `{ loadLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'STRESS' }`)
- `POST /api/simulation/pause`: Pauses load generation.
- `POST /api/simulation/stop`: Stops simulation and generation.

## Cost-Aware Scheduling

The system includes a cost-aware scheduling policy that balances computational urgency and priority against simulated cloud expenditure.

### 1. Cost Estimation Formula
Tasks estimate their dollar cost prior to allocation based on four resource dimensions and execution duration:
$$\text{Execution Hours} = \frac{\text{estimatedExecutionTime (seconds)}}{3600}$$
$$\text{CPU Cost} = \left(\frac{\text{cpuRequired}}{100}\right) \times \$0.034 \times \text{Execution Hours}$$
$$\text{GPU Cost} = \left(\frac{\text{gpuRequired}}{100}\right) \times \$0.45 \times \text{Execution Hours}$$
$$\text{RAM Cost} = \text{ramRequired (GB)} \times \$0.004 \times \text{Execution Hours}$$
$$\text{Storage Cost} = \text{storageRequired (GB)} \times \$0.0001 \times \text{Execution Hours}$$
$$\text{Estimated Total Cost (USD)} = \text{CPU Cost} + \text{GPU Cost} + \text{RAM Cost} + \text{Storage Cost}$$

*Note: These pricing rates are illustrative simulation benchmarks for testing cost-aware algorithms and do not represent verified AWS invoices.*

### 2. Queue Prioritization with Cost Penalty
To optimize throughput without starving expensive or critical tasks, the scheduler applies a bounded cost penalty to the queue order:
$$\text{Cost Penalty} = \min\left(\frac{\text{estimatedCostUsd}}{\$0.001}, 10.0\right)$$
$$\text{Effective Score} = \text{Priority Score} + \text{Waiting Time Bonus} - \text{Cost Penalty}$$

- **High Priority Preservation:** High-urgency/critical tasks retain enough base score to outrank cheaper low-priority tasks.
- **Starvation Prevention:** The aging algorithm (+1 bonus point every 5 seconds waiting) continues to elevate older workloads.
- **Deterministic FIFO:** Tasks with identical effective scores break ties by arrival timestamp (`createdAt`).

### 3. Future Roadmap: Instance Types & AWS Billing Integration
The current architecture models an aggregate compute pool. The modular `CostEngine` is structured so the next phase can introduce:
- **Simulated Instance Flavors:** Bin-packing workloads onto discrete instance profiles (`Small`, `Medium`, `Large`, GPU instances).
- **Live AWS Pricing API:** Ingesting AWS Price List API / EC2 Spot pricing in real time.
- **Actual Execution Duration:** Integrating CloudWatch telemetry to reconcile estimated vs. actual execution duration.

## Screenshots
*(Add screenshots here)*

## Future Improvements
- Multi-worker instance-type selection (`Small`, `Medium`, `Large`).
- Persistent Database (PostgreSQL/MongoDB) for analytics history.
- Granular CPU core pinning algorithms.
- Node fault-tolerance simulation.
