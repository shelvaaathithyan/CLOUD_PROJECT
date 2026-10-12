# Smart Cloud Resource Allocation Engine

## Project Overview
This project is a cloud resource allocation engine that schedules **real workloads** onto a small cluster of worker nodes. Each worker node is a Docker container with a hard CPU and memory limit (like a small VM). Incoming tasks are scored by priority and estimated cost, placed on a node with enough free CPU, RAM and storage, and then **actually executed**: the worker keeps the requested share of a CPU core busy, allocates the requested memory and writes a real file for storage. Workers report their measured usage back to the scheduler, so the dashboards show real utilization.

The scheduler uses a priority queue with an aging algorithm to prevent starvation and a bounded cost penalty for cost-aware ordering.

## Architecture

The system consists of four applications:
1. **Frontend** (React): real-time monitoring dashboard.
2. **Backend** (Express): generates simulated load (task requests) and relays live events to the frontend.
3. **Cloud Server / Scheduler** (Express): Priority, Cost, Queue and Allocation engines; tracks worker nodes, places tasks, and receives completion reports.
4. **Worker nodes** (Docker containers running `worker/`): execute tasks with real CPU/RAM/disk usage and report measured usage.

```
Frontend (5173) <--WS/HTTP--> Backend (4000) <--WS/HTTP--> Scheduler (5050) <--HTTP--> worker-1 (7001)  1 vCPU, 512 MB
                                                                              <--HTTP--> worker-2 (7002)  1 vCPU, 512 MB
                                                                              <--HTTP--> worker-3 (7003)  2 vCPU, 1 GB
```

The scheduler runs on port 5050 because macOS uses port 5000 for AirPlay Receiver.

### Task lifecycle
1. The backend (or the Requests page) submits a task to `POST /cloud/request`.
2. The scheduler computes the priority score, estimated cost and cost penalty.
3. If a node has enough free CPU, RAM and storage, the task is reserved on it and sent to the worker (`POST /tasks`). Otherwise it waits in the queue.
4. The worker runs the task for its duration, then calls `POST /cloud/nodes/:nodeId/tasks/:taskId/complete`.
5. The scheduler frees the reservation and starts queued tasks that now fit.

The scheduler polls each worker's `/metrics` every 2 seconds. A worker that stops responding is marked `OFFLINE`, its running tasks are marked `FAILED`, and new tasks are placed on the remaining nodes. When it comes back, it rejoins automatically.

## Technologies
- **Frontend**: React, Vite, TypeScript, CSS Modules, React Router, Recharts, Socket.io-client.
- **Backend**: Node.js, Express.js, TypeScript, Socket.io, UUID.
- **Cloud Server**: Node.js, Express.js, TypeScript, Socket.io.
- **Workers**: Node.js (worker_threads for CPU load), Docker / Docker Compose, cgroup v2 metrics.

## Folder Structure
```
CLOUD_PROJECT/
├── frontend/             # React UI (Dashboard, Infrastructure, Queue, Requests, Analytics, Allocation Engine)
├── backend/              # Load generator + API gateway for the frontend
│   └── src/simulation/   # SimulationManager (task generator)
├── cloud-server/         # Scheduler
│   └── src/
│       ├── engines/      # PriorityEngine, CostEngine, QueueEngine, AllocationEngine
│       ├── resources/    # ResourceManager (worker nodes, reservations, utilization)
│       ├── services/     # NodeMonitor (polls workers), WorkerClient, sockets
│       └── tests/        # Scheduler test suite
├── worker/               # Worker node agent (runs real workloads, reports usage)
└── docker-compose.yml    # Three worker nodes with CPU/memory limits
```

## How to Install
Requires Node.js 20+ and [Docker Desktop](https://www.docker.com/products/docker-desktop/).
```bash
cd cloud-server && npm install
cd ../backend && npm install
cd ../frontend && npm install
```

## How to Run

1. **Start the worker nodes** (from the project root):
   ```bash
   docker compose up --build -d
   docker stats            # optional: watch real CPU / memory per worker
   ```

2. **Run Cloud Server (scheduler)**:
   ```bash
   cd cloud-server
   npm run start
   ```

3. **Run Backend**:
   ```bash
   cd backend
   npm run start
   ```

4. **Run Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

Stop the workers with `docker compose down`.

**Without Docker** (for development), run each worker directly with Node. Usage is then measured per process rather than per container:
```bash
cd worker && npm install && npm run build
NODE_ID=worker-1 PORT=7001 CPU_UNITS=100 RAM_MB=512  STORAGE_MB=1024 node dist/server.js &
NODE_ID=worker-2 PORT=7002 CPU_UNITS=100 RAM_MB=512  STORAGE_MB=1024 node dist/server.js &
NODE_ID=worker-3 PORT=7003 CPU_UNITS=200 RAM_MB=1024 STORAGE_MB=2048 node dist/server.js &
```
The scheduler finds workers through `WORKER_URLS` (default `http://localhost:7001,http://localhost:7002,http://localhost:7003`).

**Run the scheduler tests:**
```bash
cd cloud-server && npm run test:cost
```

## Units
- **CPU**: units where 100 = one full core (shown as vCPU in the UI). A task with `cpuRequired: 50` keeps half a core busy.
- **RAM** and **Storage**: MB.

## Priority Formula
The system assigns a priority score between 0 and 100 based on the following formula:
`Score = (0.40 * CPU Requirement) + (0.30 * Normalized RAM) + (0.30 * Urgency)`

CPU is capped at 100 units and RAM is normalized against 1024 MB (the largest worker).

Scores are classified as:
- **LOW**: 0-40
- **MEDIUM**: 41-70
- **HIGH**: 71-100

## Allocation Algorithm
1. Find the online nodes with enough free CPU, RAM **and** storage for the whole task (tasks are never split across nodes).
2. Among those, pick the node left with the most free CPU. This spreads load across all workers.
3. Calculate a Suitability Score: `Priority Score + (chosen node's free CPU/RAM % * 0.5)`.
4. If no node fits, the task is queued with the reason (e.g. `Insufficient RAM capacity`).

Placement uses **reserved** capacity (what tasks requested), like Kubernetes resource requests. The **measured** usage reported by the workers is shown alongside it in the UI.

## Queue Algorithm (Aging)
To prevent starvation, tasks that stay in the queue receive a `WaitingTimeBonus`. Every 5 seconds, tasks receive +1 bonus point to their effective priority score, pushing older tasks up the queue dynamically.

## Simulation Explanation
The backend `SimulationManager` generates task requests at the selected load level. The requests are simulated, but executing them uses real resources on the workers:
- **Low**: ~7 requests/min
- **Medium**: ~24 requests/min
- **High**: ~60 requests/min (more than the cluster can run, so the queue grows)
- **Stress**: Immediate burst of 50 tasks

Task types:
| Type | CPU | RAM |
|---|---|---|
| CPU | 0.40–0.90 vCPU | 32–96 MB |
| MEMORY | 0.10–0.30 vCPU | 192–384 MB |
| MIXED | 0.30–0.60 vCPU | 96–192 MB |

Every task also writes 10–100 MB to disk and runs for 5–20 seconds.

## API Documentation

### Cloud Server (Scheduler, port 5050)
- `POST /cloud/request`: Submit a task.
- `GET /cloud/resources`: Worker nodes plus cluster totals.
- `GET /cloud/resources/nodes`: Worker nodes with reserved and measured usage.
- `GET /cloud/metrics`: Reserved and measured utilization percentages.
- `GET /cloud/metrics/costs`: Cost metrics.
- `GET /cloud/queue`, `GET /cloud/tasks`: Queue and task lists.
- `POST /cloud/nodes/:nodeId/tasks/:taskId/complete`: Called by workers when a task finishes.
- `POST /cloud/release/:taskId`: Stop tracking a running task and free its capacity.

### Worker (port 7001-7003)
- `GET /info`: Node ID and advertised capacity.
- `GET /metrics`: Measured CPU %, memory, storage and running tasks.
- `POST /tasks`: Run a task (`{ taskId, cpuUnits, ramMb, storageMb, durationSec }`).

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
Tasks estimate their dollar cost prior to allocation based on three resource dimensions and execution duration:
$$\text{Execution Hours} = \frac{\text{estimatedExecutionTime (seconds)}}{3600}$$
$$\text{CPU Cost} = \left(\frac{\text{cpuRequired}}{100}\right) \times \$0.034 \times \text{Execution Hours}$$
$$\text{RAM Cost} = \frac{\text{ramRequired (MB)}}{1024} \times \$0.004 \times \text{Execution Hours}$$
$$\text{Storage Cost} = \frac{\text{storageRequired (MB)}}{1024} \times \$0.0001 \times \text{Execution Hours}$$
$$\text{Estimated Total Cost (USD)} = \text{CPU Cost} + \text{RAM Cost} + \text{Storage Cost}$$

*Note: These pricing rates are illustrative simulation benchmarks for testing cost-aware algorithms and do not represent verified AWS invoices.*

### 2. Queue Prioritization with Cost Penalty
To optimize throughput without starving expensive or critical tasks, the scheduler applies a bounded cost penalty to the queue order:
$$\text{Cost Penalty} = \min\left(\frac{\text{estimatedCostUsd}}{\$0.00001}, 10.0\right)$$

With these rates a typical task (0.5 vCPU for about 12 seconds) costs about $0.00006, so the penalty is about 6 points.
$$\text{Effective Score} = \text{Priority Score} + \text{Waiting Time Bonus} - \text{Cost Penalty}$$

- **High Priority Preservation:** High-urgency/critical tasks retain enough base score to outrank cheaper low-priority tasks.
- **Starvation Prevention:** The aging algorithm (+1 bonus point every 5 seconds waiting) continues to elevate older workloads.
- **Deterministic FIFO:** Tasks with identical effective scores break ties by arrival timestamp (`createdAt`).

### 3. Future Roadmap: Instance Types & AWS Billing Integration
The current architecture models an aggregate compute pool. The modular `CostEngine` is structured so the next phase can introduce:
- **Simulated Instance Flavors:** Bin-packing workloads onto discrete instance profiles (`Small`, `Medium`, `Large`).
- **Live AWS Pricing API:** Ingesting AWS Price List API / EC2 Spot pricing in real time.
- **Actual Execution Duration:** Integrating CloudWatch telemetry to reconcile estimated vs. actual execution duration.

## Screenshots
*(Add screenshots here)*

## Future Improvements
- Multi-worker instance-type selection (`Small`, `Medium`, `Large`).
- Persistent Database (PostgreSQL/MongoDB) for analytics history.
- Granular CPU core pinning algorithms.
- Automatically retry tasks that failed because their node went offline.
- Publish worker metrics to AWS CloudWatch.
