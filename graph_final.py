import json
import redis
import docker
import tempfile
import os
import uuid
import time
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv

load_dotenv()

# --- Clients ---
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
docker_client = docker.from_env()
llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2048)

# --- State ---
class AgentState(TypedDict):
    session_id: str
    task: str
    plan: str
    code: str
    review: dict
    execution_result: dict
    final_code: str
    iterations: int
    debug_attempts: int
    timeline: list

# --- Sandbox ---
def run_in_sandbox(code: str) -> dict:
    # Strip markdown fences if present
    clean = code.strip()
    if "```" in clean:
        clean = clean.split("```")[1]
        if clean.startswith("python"):
            clean = clean[6:]
        clean = clean.strip()

    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', delete=False, dir='/tmp'
    ) as f:
        f.write(clean)
        tmp_path = f.name

    try:
        container = docker_client.containers.run(
            image="python:3.11-slim",
            command=f"python /code/{os.path.basename(tmp_path)}",
            volumes={'/tmp': {'bind': '/code', 'mode': 'ro'}},
            mem_limit="128m",
            network_disabled=True,
            remove=True,
            detach=False,
            stdout=True,
            stderr=True
        )
        output = container.decode('utf-8') if isinstance(container, bytes) else str(container)
        return {"success": True, "stdout": output, "stderr": "", "exit_code": 0}

    except docker.errors.ContainerError as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": e.stderr.decode('utf-8') if e.stderr else str(e),
            "exit_code": e.exit_status
        }
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e), "exit_code": 1}
    finally:
        os.unlink(tmp_path)

# --- Redis helper ---
def save_state(state: AgentState, agent: str):
    r.set(f"session:{state['session_id']}:state", json.dumps({
        **{k: v for k, v in state.items()},
        "last_agent": agent,
        "updated_at": time.time()
    }))
    r.sadd("sessions", state["session_id"])

def add_event(timeline: list, agent: str, summary: str) -> list:
    return (timeline or []) + [{"agent": agent, "summary": summary, "time": time.time()}]

# --- Nodes ---
def planner_node(state: AgentState) -> AgentState:
    print("\n[PLANNER] creating plan...")
    response = llm.invoke([
        {"role": "system", "content": "You are a software architect. Given a coding task, produce a concise bullet-point plan (max 4 steps)."},
        {"role": "user", "content": f"Task: {state['task']}"}
    ])
    result = {
        "plan": response.content,
        "timeline": add_event(state["timeline"], "planner", "Created plan")
    }
    save_state({**state, **result}, "planner")
    print("[PLANNER] done")
    return result


def coder_node(state: AgentState) -> AgentState:
    print("\n[CODER] writing code...")
    debug_attempts = state.get("debug_attempts", 0)

    if debug_attempts > 0:
        # Fixing after failed execution
        exec_result = state.get("execution_result", {})
        prompt = f"""Task: {state['task']}

Previous code:
{state['code']}

Execution error:
{exec_result.get('stderr', 'Unknown error')}

Fix the code. Return only the corrected Python code, no explanation, no markdown."""
    elif state.get("review", {}).get("verdict") == "REVISE":
        issues = state["review"].get("issues", [])
        prompt = f"""Task: {state['task']}

Previous code:
{state['code']}

Fix these review issues:
{chr(10).join(f'- {i}' for i in issues)}

Return only the fixed Python code, no markdown."""
    else:
        prompt = f"""Task: {state['task']}

Plan:
{state['plan']}

Return only the Python code, no explanation, no markdown."""

    response = llm.invoke([
        {"role": "system", "content": "You are an expert Python developer. Write clean, working Python code. No markdown fences."},
        {"role": "user", "content": prompt}
    ])

    iterations = state.get("iterations", 0) + 1
    result = {
        "code": response.content,
        "iterations": iterations,
        "timeline": add_event(state["timeline"], "coder", f"Wrote code (attempt {iterations})")
    }
    save_state({**state, **result}, "coder")
    print(f"[CODER] done (attempt {iterations})")
    return result


def reviewer_node(state: AgentState) -> AgentState:
    print("\n[REVIEWER] reviewing...")
    response = llm.invoke([
        {"role": "system", "content": """You are a senior code reviewer.
Respond ONLY with JSON, no markdown:
{
  "verdict": "APPROVE" or "REVISE",
  "issues": ["issue 1"],
  "score": 0-10
}
APPROVE if code is correct and handles edge cases. REVISE only for real bugs."""},
        {"role": "user", "content": f"Review for task: {state['task']}\n\n{state['code']}"}
    ])

    raw = response.content.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    review = json.loads(raw)
    result = {
        "review": review,
        "timeline": add_event(state["timeline"], "reviewer", f"Verdict: {review['verdict']} | Score: {review['score']}/10")
    }
    save_state({**state, **result}, "reviewer")
    print(f"[REVIEWER] {review['verdict']} | {review['score']}/10")
    return result


def debugger_node(state: AgentState) -> AgentState:
    print("\n[DEBUGGER] running code in sandbox...")
    result = run_in_sandbox(state["code"])

    if result["success"]:
        print(f"[DEBUGGER] ✓ code ran successfully")
        print(f"[DEBUGGER] output: {result['stdout'].strip()}")
    else:
        print(f"[DEBUGGER] ✗ execution failed")
        print(f"[DEBUGGER] error: {result['stderr'].strip()[:200]}")

    debug_attempts = state.get("debug_attempts", 0) + 1
    output = {
        "execution_result": result,
        "debug_attempts": debug_attempts,
        "timeline": add_event(
            state["timeline"],
            "debugger",
            f"Execution {'succeeded' if result['success'] else 'failed: ' + result['stderr'][:80]}"
        )
    }

    if result["success"]:
        output["final_code"] = state["code"]

    save_state({**state, **output}, "debugger")
    return output


# --- Routers ---
def route_after_review(state: AgentState) -> Literal["coder", "debugger"]:
    if state["review"]["verdict"] == "APPROVE" or state.get("iterations", 0) >= 3:
        print("[ROUTER] review passed → debugger")
        return "debugger"
    print("[ROUTER] needs revision → coder")
    return "coder"


def route_after_debug(state: AgentState) -> Literal["coder", END]:
    if state["execution_result"]["success"]:
        print("[ROUTER] execution passed → done")
        return END
    if state.get("debug_attempts", 0) >= 3:
        print("[ROUTER] max debug attempts → done")
        return END
    print("[ROUTER] execution failed → coder to fix")
    return "coder"


# --- Build graph ---
builder = StateGraph(AgentState)
builder.add_node("planner", planner_node)
builder.add_node("coder", coder_node)
builder.add_node("reviewer", reviewer_node)
builder.add_node("debugger", debugger_node)

builder.set_entry_point("planner")
builder.add_edge("planner", "coder")
builder.add_edge("coder", "reviewer")
builder.add_conditional_edges("reviewer", route_after_review)
builder.add_conditional_edges("debugger", route_after_debug)

graph = builder.compile()


# --- Run ---
session_id = str(uuid.uuid4())
print("=" * 50)
print(f"SESSION: {session_id[:8]}")
print("=" * 50)

result = graph.invoke({
    "session_id": session_id,
    "task": "Write a Python function that finds the longest common subsequence of two strings",
    "plan": "", "code": "", "review": {},
    "execution_result": {}, "final_code": "",
    "iterations": 0, "debug_attempts": 0, "timeline": []
})

print("\n" + "=" * 50)
print("COMPLETE")
print("=" * 50)
print(f"Iterations:     {result['iterations']}")
print(f"Debug attempts: {result['debug_attempts']}")
print(f"Review score:   {result['review']['score']}/10")
print(f"Execution:      {'✓ passed' if result['execution_result']['success'] else '✗ failed'}")

print("\n--- Timeline ---")
for i, e in enumerate(result["timeline"], 1):
    print(f"  {i}. [{e['agent'].upper()}] {e['summary']}")

print(f"\n--- Final code ---")
print(result.get("final_code") or result["code"])