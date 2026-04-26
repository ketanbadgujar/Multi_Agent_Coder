from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()

tools = [
    {
        "name": "get_weather",
        "description": "Get the current weather for a city",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "The city name"}
            },
            "required": ["city"]
        }
    }
]

def get_weather(city: str) -> str:
    data = {
        "sydney": "22C, sunny",
        "london": "10C, cloudy",
        "new york": "15C, partly cloudy",
    }
    return data.get(city.lower(), f"No data for {city}")

def chat(history, user_message):
    history.append({"role": "user", "content": user_message})

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system="You are a helpful assistant. Use tools when relevant.",
            tools=tools,
            messages=history
        )

        if response.stop_reason == "tool_use":
            history.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    print(f"  [calling tool: {block.name} with {block.input}]")
                    result = get_weather(block.input["city"])
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })
            history.append({"role": "user", "content": tool_results})
        else:
            reply = response.content[0].text
            history.append({"role": "assistant", "content": reply})
            return reply, history

print("Chatbot ready. Type 'quit' to exit.")
print("Try: What is the weather in Sydney?\n")

history = []

while True:
    try:
        user_input = input("You: ")
    except (EOFError, KeyboardInterrupt):
        print("\nGoodbye!")
        break

    user_input = user_input.strip()
    if not user_input:
        continue
    if user_input.lower() == "quit":
        break

    reply, history = chat(history, user_input)
    print(f"Assistant: {reply}\n")