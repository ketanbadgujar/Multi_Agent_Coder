import docker
import tempfile
import os

# --- Connect to Docker ---
client = docker.from_env()

def run_code_in_sandbox(code: str, timeout: int = 10) -> dict:
    """
    Run Python code inside a Docker container.
    Returns stdout, stderr, exit code, and success status.
    """
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.py',
        delete=False,
        dir='/tmp'
    ) as f:
        f.write(code)
        tmp_path = f.name

    try:
        container = client.containers.run(
            image="python:3.11-slim",
            command=f"python /code/{os.path.basename(tmp_path)}",
            volumes={
                '/tmp': {'bind': '/code', 'mode': 'ro'}
            },
            mem_limit="128m",
            cpu_period=100000,
            cpu_quota=50000,
            network_disabled=True,
            remove=True,
            detach=False,
            stdout=True,
            stderr=True
        )

        output = container.decode('utf-8') if isinstance(container, bytes) else str(container)

        return {
            "success": True,
            "stdout": output,
            "stderr": "",
            "exit_code": 0
        }

    except docker.errors.ContainerError as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": e.stderr.decode('utf-8') if e.stderr else str(e),
            "exit_code": e.exit_status
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "exit_code": 1
        }
    finally:
        os.unlink(tmp_path)


# --- Test it with 3 cases ---

print("=" * 50)
print("TEST 1: Working code")
print("=" * 50)
good_code = """
def add(a, b):
    return a + b

results = [add(1, 2), add(10, 20), add(-1, 1)]
for r in results:
    print(r)
print("All tests passed!")
"""
result = run_code_in_sandbox(good_code)
print(f"Success: {result['success']}")
print(f"Output:\n{result['stdout']}")


print("=" * 50)
print("TEST 2: Code with a bug (division by zero)")
print("=" * 50)
buggy_code = """
def divide(a, b):
    return a / b

print(divide(10, 0))
"""
result = run_code_in_sandbox(buggy_code)
print(f"Success: {result['success']}")
print(f"Error:\n{result['stderr']}")


print("=" * 50)
print("TEST 3: Code with syntax error")
print("=" * 50)
syntax_error_code = """
def broken(
    print("missing closing paren"
"""
result = run_code_in_sandbox(syntax_error_code)
print(f"Success: {result['success']}")
print(f"Error:\n{result['stderr']}")