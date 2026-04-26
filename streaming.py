from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()

def stream_response(prompt: str):
    print("Assistant: ", end="", flush=True)
    
    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
    
    print("\n")

stream_response("Explain what a Python decorator is in 3 sentences.")