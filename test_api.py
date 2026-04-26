from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="You are a helpful assistant.",
    messages=[
        {"role": "user", "content": "Write a Python function that reverses a string. Keep it short."}
    ]
)

print(response.content[0].text)
print(f"\n--- Usage ---")
print(f"Input tokens:  {response.usage.input_tokens}")
print(f"Output tokens: {response.usage.output_tokens}")