# 🤖 AgentForge — Multi-Agent Coding Assistant

A production-grade multi-agent AI system where autonomous agents collaboratively plan, write, review, and execute code. Built with LangGraph, FastAPI, Docker, and Redis.

**Benchmark: 30/30 tasks passed | 9.5/10 avg score | 100% execution success rate**

---

## 🎥 Demo

> Enter a coding task → Watch 4 agents collaborate in real time → Get reviewed, tested, and executed code

![AgentForge Demo](docs/demo.gif)

---

## 🏗️ Architecture

```
User Task
    ↓
Orchestrator (LangGraph)
    ↓
┌─────────────────────────────────────────┐
│  Planner  →  Coder  →  Reviewer  →  Debugger  │
│              ↑_________|  (if REVISE)          │
└─────────────────────────────────────────┘
    ↓
Docker Sandbox (code execution)
    ↓
Redis (session persistence)
    ↓
FastAPI + React UI
```

### Agent Roles

| Agent        | Role                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| **Planner**  | Breaks the task into a structured step-by-step plan                      |
| **Coder**    | Writes clean code based on the plan                                      |
| **Reviewer** | Audits code quality, scores 0-10, returns APPROVE or REVISE              |
| **Debugger** | Runs code in Docker sandbox, captures errors, routes fixes back to Coder |

### Conditional Routing

The system uses dynamic routing — if the Reviewer returns `REVISE`, the task loops back to the Coder with specific feedback. If the Debugger detects a runtime error, it routes back to the Coder for a fix. Maximum 3 iterations per stage.

---

## 🛠️ Tech Stack

| Layer             | Technology                                  |
| ----------------- | ------------------------------------------- |
| Agent framework   | LangGraph + LangChain                       |
| LLM               | Claude claude-sonnet-4-6 (Anthropic)        |
| Code execution    | Docker (python:3.11-slim, isolated sandbox) |
| State persistence | Redis                                       |
| Backend           | FastAPI + WebSockets                        |
| Frontend          | React + TypeScript                          |
| Deployment        | Railway                                     |
| Observability     | Session replay dashboard, timeline tracking |

---

## 📁 Project Structure

```
multi-agent-coder/
├── agents/
│   ├── __init__.py
│   └── graph.py          # LangGraph 4-agent pipeline
├── tools/
│   ├── __init__.py
│   └── sandbox.py        # Docker code execution sandbox
├── api/
│   ├── __init__.py
│   └── main.py           # FastAPI server (streaming + sessions)
├── frontend/
│   └── src/
│       └── App.tsx        # React UI with dark mode + dashboard
├── benchmark/
│   ├── run_benchmark.py   # 30-task evaluation harness
│   └── results.json       # Benchmark results
├── .env                   # API keys (not committed)
├── requirements.txt
├── Procfile               # Railway deployment
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop
- Redis
- Anthropic API key

### 1. Clone the repository

```bash
git clone https://github.com/ketanbadgujar/Multi_Agent_Coder.git
cd Multi_Agent_Coder
```

### 2. Set up Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
REDIS_URL=redis://localhost:6379
```

### 4. Start Redis

```bash
docker run -d -p 6379:6379 redis:alpine
```

Or if you have Redis installed:

```bash
brew services start redis
```

### 5. Start Docker Desktop

Make sure Docker Desktop is running — the Debugger agent uses it to execute code in an isolated sandbox.

### 6. Start the backend

```bash
cd api
uvicorn main:app --reload --port 8000
```

### 7. Start the frontend (development)

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:3000`

### 8. Build frontend for production

```bash
cd frontend
npm run build
```

Then serve everything from FastAPI:

```bash
cd api
uvicorn main:app --port 8000
```

Open `http://localhost:8000`

---

## 🧠 How It Works

### Agent Pipeline

```python
# Simplified flow
state = {
    "task": "Write a binary search function",
    "plan": "",
    "code": "",
    "review": {},
    "execution_result": {},
    "iterations": 0,
    "debug_attempts": 0
}

# LangGraph routes automatically:
# planner → coder → reviewer → (REVISE → coder) → debugger → done
```

### Shared State

Every agent reads from and writes to a shared `AgentState` TypedDict. State is persisted to Redis after every node so sessions survive restarts and can be replayed.

### Code Execution Sandbox

```python
# Code runs in an isolated Docker container
container = docker_client.containers.run(
    image="python:3.11-slim",
    mem_limit="128m",        # memory limited
    network_disabled=True,   # no internet access
    remove=True,             # auto-cleanup
)
```

### Streaming API

The `/run` endpoint streams newline-delimited JSON so the UI updates in real time as each agent completes:

```json
{"type": "session", "session_id": "abc123"}
{"type": "agent_update", "agent": "planner", "summary": "Created 4-step plan"}
{"type": "agent_update", "agent": "coder", "summary": "Wrote code (attempt 1)"}
{"type": "agent_update", "agent": "reviewer", "summary": "Verdict: APPROVE | Score: 9/10"}
{"type": "agent_update", "agent": "debugger", "summary": "Execution succeeded"}
{"type": "complete", "score": 9, "final_code": "...", "plan": "..."}
```

---

## 📊 Benchmark Results

Evaluated on 30 coding tasks across 3 difficulty levels:

| Difficulty | Tasks  | Pass Rate        | Avg Score  |
| ---------- | ------ | ---------------- | ---------- |
| Easy       | 10     | 10/10 (100%)     | 9.6/10     |
| Medium     | 10     | 10/10 (100%)     | 9.4/10     |
| Hard       | 10     | 10/10 (100%)     | 9.6/10     |
| **Total**  | **30** | **30/30 (100%)** | **9.5/10** |

Average completion time: 12.9s per task

### Run the benchmark yourself

```bash
# Run all 30 tasks
python3 benchmark/run_benchmark.py

# Run first 5 tasks only
python3 benchmark/run_benchmark.py 5
```

Results saved to `benchmark/results.json`

---

## 🖥️ UI Features

- **Run tab** — Enter a coding task, select language, watch agents run in real time
- **Dashboard tab** — Browse all past sessions, click any to replay the full agent timeline
- **Dark / Light mode** — Persisted across sessions via localStorage
- **Language selector** — 12 languages: Python, JavaScript, TypeScript, Java, C++, Rust, Go, Ruby, PHP, Dart, C#, Bash
- **Copy button** — One-click copy of generated code
- **Download button** — Save generated code with correct file extension
- **Agent status sidebar** — Live indicators showing which agent is active
- **Session stats** — Score, iterations, execution pass/fail per run

---

## 🌐 API Reference

### `POST /run`

Stream agent pipeline for a coding task.

**Request:**

```json
{ "task": "Write a binary search function in Python" }
```

**Response:** Newline-delimited JSON stream

---

### `GET /sessions`

List last 10 sessions with task, score, and timestamp.

---

### `GET /session/{session_id}/timeline`

Full session detail with agent timeline for replay.

---

### `GET /health`

Health check endpoint.

---

## 🚢 Deployment

### Railway (backend)

```bash
# Install Railway CLI
brew install railway

# Login and deploy
railway login
railway init
railway up

# Set environment variables
railway variables set ANTHROPIC_API_KEY=your-key
```

Redis is provisioned automatically via Railway's managed database addon.

---

## 🔧 Configuration

| Variable            | Description          | Default                  |
| ------------------- | -------------------- | ------------------------ |
| `ANTHROPIC_API_KEY` | Anthropic API key    | Required                 |
| `REDIS_URL`         | Redis connection URL | `redis://localhost:6379` |

---

## 📄 License

MIT

---

Built by [Ketan Badgujar](https://github.com/ketanbadgujar)
