import json
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic()

def review_code(code: str) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system="You are a senior code reviewer. Respond only with a JSON object, no markdown, no backticks, no extra text.",
        messages=[
            {"role": "user", "content": f"Review this code:\n\n{code}"}
        ]
    )

    raw = response.content[0].text.strip()

    # Strip markdown fences if present
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


sample_code = """
def divide(a, b):
    return a / b

result = divide(10, 0)
print(result)
"""

print("Reviewing code...\n")
result = review_code(sample_code)

# Pretty print the full JSON response
print(json.dumps(result, indent=2))

# Pull out key fields flexibly
print("\n--- Summary ---")
rating = result.get("overall_rating") or result.get("score") or "N/A"
print(f"Rating: {rating}/10")

issues = result.get("issues", [])
print(f"\nIssues found: {len(issues)}")
for issue in issues:
    if isinstance(issue, dict):
        severity = issue.get("severity", "")
        desc = issue.get("description", "")
        print(f"  [{severity.upper()}] {desc}")
    else:
        print(f"  - {issue}")

summary = result.get("summary", "")
if summary:
    print(f"\nSummary: {summary}")