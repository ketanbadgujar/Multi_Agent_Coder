import json
import redis
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv
import uuid
import time

load_dotenv()

# --- 1. Redis client ---
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

# --- 2. Shared state ---
class AgentState(TypedDict):
    session_id: str
    task: str
    plan: str
    code: str
    review: dict
    final_code: str
    iterations: int
    timeline: list   # tracks every agent action for replay

# --- 3. LLM ---
llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)

# --- 4. Helper: save state to Redis after every node ---
def save_state(state: AgentState, agent: str):
    session_id = state["session_id"]
    
    # Save full state
    r.set(f"session:{session_id}:state", json.dumps({
        "task": state["task"],
        "plan": state.get("plan", ""),
        "code": state.get("code", ""),
        "review": state.get("review", {}),
        "final_code": state.get("final_code", ""),
        "iterations": state.get("iterations", 0),
        "timeline": state.get("timeline", []),
        "last_agent": agent,
        "updated_at": time.time()
    }))

    # Save to session list (so you can list all sessions)
    r.sadd("sessions", session_id)
    print(f"  [Redis] state saved for session {session_id[:8]}...")


# --- 5. Helper: add timeline event ---
def add_event(timeline: list, agent: str, summary: str) -> list:
    timeline = timeline or []
    timeline.append({
        "agent": agent,
        "summary": summary,
        "timestamp": time.time()
    })
    return timeline


# --- 6. Nodes ---
def planner_node(state: AgentState) -> AgentState:
    print("\n[PLANNER] creating plan...")
    response = llm.invoke([
        {"role": "system", "content": "You are a software architect. Given a coding task, produce a short bullet-point plan (max 4 steps). Be concise."},
        {"role": "user", "content": f"Task: {state['task']}"}
    ])
    plan = response.content
    timeline = add_event(state.get("timeline", []), "planner", f"Created {len(plan.split(chr(10)))} step plan")
    result = {"plan": plan, "timeline": timeline}
    save_state({**state, **result}, "planner")
    print("[PLANNER] done")
    return result


def coder_node(state: AgentState) -> AgentState:
    print("\n[CODER] writing code...")
    if state.get("review") and state["review"].get("verdict") == "REVISE":
        issues = state["review"].get("issues", [])
        prompt = f"""Task: {state['task']}

Previous code:
{state['code']}

Fix these issues:
{chr(10).join(f'- {i}' for i in issues)}

Return only the fixed Python code."""
    else:
        prompt = f"""Task: {state['task']}

Plan:
{state['plan']}

Return only the Python code, no explanation."""

    response = llm.invoke([
        {"role": "system", "content": "You are an expert Python developer. Write clean, working Python code."},
        {"role": "user", "content": prompt}
    ])
    iterations = state.get("iterations", 0) + 1
    timeline = add_event(state.get("timeline", []), "coder", f"Wrote code (attempt {iterations})")
    result = {"code": response.content, "iterations": iterations, "timeline": timeline}
    save_state({**state, **result}, "coder")
    print(f"[CODER] done (attempt {iterations})")
    return result


def reviewer_node(state: AgentState) -> AgentState:
    print("\n[REVIEWER] reviewing...")
    response = llm.invoke([
        {"role": "system", "content": """You are a senior code reviewer.
Respond ONLY with a JSON object, no markdown, no backticks:
{
  "verdict": "APPROVE" or "REVISE",
  "issues": ["issue 1", "issue 2"],
  "score": 0-10
}"""},
        {"role": "user", "content": f"Review this code for task: {state['task']}\n\n{state['code']}"}
    ])
    raw = response.content.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    review = json.loads(raw)
    timeline = add_event(state.get("timeline", []), "reviewer", f"Verdict: {review['verdict']} | Score: {review['score']}/10")
    result = {"review": review, "timeline": timeline}
    save_state({**state, **result}, "reviewer")
    print(f"[REVIEWER] verdict: {review['verdict']} | score: {review['score']}/10")
    return result


def debugger_node(state: AgentState) -> AgentState:
    print("\n[DEBUGGER] finalising...")
    timeline = add_event(state.get("timeline", []), "debugger", "Code approved and finalised")
    result = {"final_code": state["code"], "timeline": timeline}
    save_state({**state, **result}, "debugger")
    print("[DEBUGGER] done")
    return result


# --- 7. Router ---
def route_after_review(state: AgentState) -> Literal["coder", "debugger"]:
    verdict = state["review"]["verdict"]
    iterations = state.get("iterations", 0)
    if verdict == "APPROVE" or iterations >= 3:
        print("\n[ROUTER] approved → debugger")
        return "debugger"
    print(f"\n[ROUTER] needs revision → coder")
    return "coder"


# --- 8. Build graph ---
graph_builder = StateGraph(AgentState)
graph_builder.add_node("planner", planner_node)
graph_builder.add_node("coder", coder_node)
graph_builder.add_node("reviewer", reviewer_node)
graph_builder.add_node("debugger", debugger_node)
graph_builder.set_entry_point("planner")
graph_builder.add_edge("planner", "coder")
graph_builder.add_edge("coder", "reviewer")
graph_builder.add_conditional_edges("reviewer", route_after_review)
graph_builder.add_edge("debugger", END)
graph = graph_builder.compile()


# --- 9. Helper: replay a session ---
def replay_session(session_id: str):
    raw = r.get(f"session:{session_id}:state")
    if not raw:
        print(f"Session {session_id} not found")
        return
    state = json.loads(raw)
    print(f"\n{'='*50}")
    print(f"REPLAY: {session_id[:8]}...")
    print(f"Task: {state['task']}")
    print(f"{'='*50}")
    for i, event in enumerate(state.get("timeline", []), 1):
        print(f"  Step {i} [{event['agent'].upper()}]: {event['summary']}")
    print(f"\nFinal code preview:")
    print(state.get("final_code", "")[:200] + "...")


# --- 10. Run ---
session_id = str(uuid.uuid4())
print("=" * 50)
print(f"SESSION: {session_id[:8]}...")
print("=" * 50)

result = graph.invoke({
    "session_id": session_id,
    "task": "Write a Python function that finds the two numbers in a list that add up to a target sum",
    "plan": "",
    "code": "",
    "review": {},
    "final_code": "",
    "iterations": 0,
    "timeline": []
})

print("\n" + "=" * 50)
print("FINAL RESULT")
print("=" * 50)
print(f"Iterations: {result['iterations']}")
print(f"Score: {result['review']['score']}/10")
print(f"Verdict: {result['review']['verdict']}")

# Replay the session from Redis
replay_session(session_id)

# List all saved sessions
print(f"\nAll sessions in Redis: {r.smembers('sessions')}")