import json
import uuid
import redis
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import sys
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Make sure agents/ and tools/ are importable
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.graph import graph, AgentState

load_dotenv()

app = FastAPI(title="Multi-Agent Coder")

# Allow React frontend to talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
r = redis.from_url(redis_url, decode_responses=True)


class TaskRequest(BaseModel):
    task: str


# --- Route 1: Run agent graph and stream progress ---
@app.post("/run")
async def run_agents(request: TaskRequest):
    session_id = str(uuid.uuid4())

    async def stream_progress():
        # Send session ID first
        yield json.dumps({"type": "session", "session_id": session_id}) + "\n"

        # Run the graph in a thread (LangGraph is sync)
        loop = asyncio.get_event_loop()

        events = []

        def run_graph():
            result = graph.invoke({
                "session_id": session_id,
                "task": request.task,
                "plan": "", "code": "", "review": {},
                "execution_result": {}, "final_code": "",
                "iterations": 0, "debug_attempts": 0, "timeline": []
            })
            events.append(result)

        # Run in background thread
        await loop.run_in_executor(None, run_graph)

        result = events[0]

        # Stream timeline events
        for event in result.get("timeline", []):
            yield json.dumps({
                "type": "agent_update",
                "agent": event["agent"],
                "summary": event["summary"]
            }) + "\n"
            await asyncio.sleep(0.1)

        # Stream final result
        yield json.dumps({
            "type": "complete",
            "session_id": session_id,
            "iterations": result["iterations"],
            "debug_attempts": result["debug_attempts"],
            "score": result["review"]["score"],
            "verdict": result["review"]["verdict"],
            "execution_success": result["execution_result"]["success"],
            "final_code": result.get("final_code") or result.get("code") or "",
            "plan": result["plan"]
        }) + "\n"

    return StreamingResponse(stream_progress(), media_type="application/x-ndjson")


# --- Route 2: Get session from Redis ---
@app.get("/session/{session_id}")
async def get_session(session_id: str):
    raw = r.get(f"session:{session_id}:state")
    if not raw:
        return {"error": "Session not found"}
    return json.loads(raw)


# --- Route 3: List all sessions ---
@app.get("/sessions")
async def list_sessions():
    session_ids = list(r.smembers("sessions"))
    sessions = []
    for sid in session_ids[-10:]:  # last 10
        raw = r.get(f"session:{sid}:state")
        if raw:
            data = json.loads(raw)
            sessions.append({
                "session_id": sid,
                "task": data.get("task", ""),
                "last_agent": data.get("last_agent", ""),
                "score": data.get("review", {}).get("score"),
                "updated_at": data.get("updated_at")
            })
    return {"sessions": sessions}

# --- Route 5: Full session detail for replay ---
@app.get("/session/{session_id}/timeline")
async def get_timeline(session_id: str):
    raw = r.get(f"session:{session_id}:state")
    if not raw:
        return {"error": "Session not found"}
    data = json.loads(raw)
    return {
        "session_id": session_id,
        "task": data.get("task", ""),
        "timeline": data.get("timeline", []),
        "score": data.get("review", {}).get("score"),
        "last_agent": data.get("last_agent", ""),
        "final_code": data.get("final_code", ""),
        "plan": data.get("plan", ""),
        "iterations": data.get("iterations", 0),
        "execution_success": data.get("execution_result", {}).get("success", False),
        "updated_at": data.get("updated_at")
    }

# --- Route 4: Health check ---
@app.get("/health")
async def health():
    return {
        "status": "running",
        "routes": ["/run", "/session/{id}", "/sessions"]
    }

# --- Serve React frontend ---
frontend_build = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "build"
)

if os.path.exists(frontend_build):
    app.mount("/static", StaticFiles(
        directory=os.path.join(frontend_build, "static")), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(frontend_build, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return FileResponse(os.path.join(frontend_build, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"status": "running", "routes": ["/run", "/session/{id}", "/sessions"]}