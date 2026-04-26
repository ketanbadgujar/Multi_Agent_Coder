import json
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
client = Anthropic()

# Store conversation history per session (in-memory for now)
sessions: dict[str, list] = {}

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"

class ReviewRequest(BaseModel):
    code: str


# --- Route 1: Basic chat with memory ---
@app.post("/chat")
async def chat(request: ChatRequest):
    history = sessions.get(request.session_id, [])
    history.append({"role": "user", "content": request.message})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system="You are a helpful coding assistant.",
        messages=history
    )

    reply = response.content[0].text
    history.append({"role": "assistant", "content": reply})
    sessions[request.session_id] = history

    return {
        "reply": reply,
        "session_id": request.session_id,
        "turns": len(history) // 2
    }


# --- Route 2: Streaming chat ---
@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system="You are a helpful coding assistant.",
            messages=[{"role": "user", "content": request.message}]
        ) as stream:
            for text in stream.text_stream:
                yield text

    return StreamingResponse(generate(), media_type="text/plain")


# --- Route 3: Code review ---
@app.post("/review")
async def review_code(request: ReviewRequest):
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system="You are a senior code reviewer. Respond only with JSON, no markdown, no backticks.",
        messages=[{"role": "user", "content": f"Review this code:\n\n{request.code}"}]
    )

    raw = response.content[0].text.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


# --- Health check ---
@app.get("/")
async def root():
    return {"status": "running", "routes": ["/chat", "/chat/stream", "/review"]}