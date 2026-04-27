from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv
import json

load_dotenv()

# --- 1. Shared state ---
class AgentState(TypedDict):
    task: str
    plan: str
    code: str
    review: dict        # reviewer's structured feedback
    final_code: str     # debugger's fixed code
    iterations: int     # how many fix attempts

# --- 2. LLM ---
llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)

# --- 3. Nodes ---
def planner_node(state: AgentState) -> AgentState:
    print("\n[PLANNER] creating plan...")
    response = llm.invoke([
        {"role": "system", "content": "You are a software architect. Given a coding task, produce a short bullet-point plan (max 4 steps). Be concise."},
        {"role": "user", "content": f"Task: {state['task']}"}
    ])
    print(f"[PLANNER] done")
    return {"plan": response.content}


def coder_node(state: AgentState) -> AgentState:
    print("\n[CODER] writing code...")
    
    # If there's review feedback, fix the code instead of writing fresh
    if state.get("review") and state["review"].get("verdict") == "REVISE":
        issues = state["review"].get("issues", [])
        prompt = f"""Task: {state['task']}

Previous code:
{state['code']}

Reviewer feedback - fix these issues:
{chr(10).join(f'- {i}' for i in issues)}

Return only the fixed Python code, no explanation."""
    else:
        prompt = f"""Task: {state['task']}

Plan:
{state['plan']}

Return only the Python code, no explanation."""

    response = llm.invoke([
        {"role": "system", "content": "You are an expert Python developer. Write clean, working Python code."},
        {"role": "user", "content": prompt}
    ])
    print(f"[CODER] done")
    return {
        "code": response.content,
        "iterations": state.get("iterations", 0) + 1
    }


def reviewer_node(state: AgentState) -> AgentState:
    print("\n[REVIEWER] reviewing code...")
    response = llm.invoke([
        {"role": "system", "content": """You are a senior code reviewer.
Respond ONLY with a JSON object, no markdown, no backticks:
{
  "verdict": "APPROVE" or "REVISE",
  "issues": ["issue 1", "issue 2"],
  "score": 0-10
}
APPROVE if the code is correct and handles edge cases.
REVISE only if there are real bugs or missing error handling."""},
        {"role": "user", "content": f"Review this code for task: {state['task']}\n\n{state['code']}"}
    ])

    raw = response.content.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    review = json.loads(raw)
    print(f"[REVIEWER] verdict: {review['verdict']} | score: {review['score']}/10")
    if review.get("issues"):
        for issue in review["issues"]:
            print(f"  - {issue}")

    return {"review": review}


def debugger_node(state: AgentState) -> AgentState:
    print("\n[DEBUGGER] finalising code...")
    # For now: mark as final (Docker execution comes in Phase 3 Week 9)
    return {"final_code": state["code"]}


# --- 4. Routing function ---
# This is the conditional edge — decides which node comes next
def route_after_review(state: AgentState) -> Literal["coder", "debugger"]:
    verdict = state["review"]["verdict"]
    iterations = state.get("iterations", 0)

    if verdict == "APPROVE":
        print("\n[ROUTER] approved — sending to debugger")
        return "debugger"
    elif iterations >= 3:
        print("\n[ROUTER] max iterations reached — forcing approval")
        return "debugger"
    else:
        print(f"\n[ROUTER] needs revision (attempt {iterations}) — sending back to coder")
        return "coder"


# --- 5. Build the graph ---
graph_builder = StateGraph(AgentState)

graph_builder.add_node("planner", planner_node)
graph_builder.add_node("coder", coder_node)
graph_builder.add_node("reviewer", reviewer_node)
graph_builder.add_node("debugger", debugger_node)

graph_builder.set_entry_point("planner")
graph_builder.add_edge("planner", "coder")
graph_builder.add_edge("coder", "reviewer")

# Conditional edge: reviewer routes to either coder or debugger
graph_builder.add_conditional_edges("reviewer", route_after_review)
graph_builder.add_edge("debugger", END)

graph = graph_builder.compile()

# --- 6. Run ---
print("=" * 50)
print("4-AGENT GRAPH")
print("=" * 50)

result = graph.invoke({
    "task": "Write a Python class for a queue data structure with enqueue, dequeue, and peek methods",
    "plan": "",
    "code": "",
    "review": {},
    "final_code": "",
    "iterations": 0
})

print("\n" + "=" * 50)
print("FINAL OUTPUT")
print("=" * 50)
print(f"Iterations: {result['iterations']}")
print(f"Final score: {result['review']['score']}/10")
print(f"Final verdict: {result['review']['verdict']}")
print(f"\nCode:\n{result['final_code']}")