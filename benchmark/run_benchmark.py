import sys
import os
import json
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agents.graph import graph

# --- 30 benchmark tasks across 3 difficulty levels ---
TASKS = [
    # Easy (10)
    {"id": 1, "difficulty": "easy", "task": "Write a Python function that checks if a number is even or odd"},
    {"id": 2, "difficulty": "easy", "task": "Write a Python function that reverses a string"},
    {"id": 3, "difficulty": "easy", "task": "Write a Python function that returns the factorial of a number"},
    {"id": 4, "difficulty": "easy", "task": "Write a Python function that finds the maximum value in a list"},
    {"id": 5, "difficulty": "easy", "task": "Write a Python function that counts vowels in a string"},
    {"id": 6, "difficulty": "easy", "task": "Write a Python function that checks if a string is a palindrome"},
    {"id": 7, "difficulty": "easy", "task": "Write a Python function that flattens a nested list one level deep"},
    {"id": 8, "difficulty": "easy", "task": "Write a Python function that removes duplicates from a list while preserving order"},
    {"id": 9, "difficulty": "easy", "task": "Write a Python function that converts Celsius to Fahrenheit"},
    {"id": 10, "difficulty": "easy", "task": "Write a Python function that returns the nth Fibonacci number"},

    # Medium (10)
    {"id": 11, "difficulty": "medium", "task": "Write a Python class implementing a stack with push, pop, peek and is_empty methods"},
    {"id": 12, "difficulty": "medium", "task": "Write a Python function that performs binary search on a sorted list"},
    {"id": 13, "difficulty": "medium", "task": "Write a Python function that groups a list of words by their first letter"},
    {"id": 14, "difficulty": "medium", "task": "Write a Python function that finds all prime numbers up to n using the Sieve of Eratosthenes"},
    {"id": 15, "difficulty": "medium", "task": "Write a Python class implementing a queue with enqueue, dequeue and peek methods"},
    {"id": 16, "difficulty": "medium", "task": "Write a Python function that merges two sorted lists into one sorted list"},
    {"id": 17, "difficulty": "medium", "task": "Write a Python function that finds the most frequent element in a list"},
    {"id": 18, "difficulty": "medium", "task": "Write a Python function that checks if two strings are anagrams"},
    {"id": 19, "difficulty": "medium", "task": "Write a Python function that rotates a list by k positions"},
    {"id": 20, "difficulty": "medium", "task": "Write a Python function that implements a basic calculator supporting +, -, *, /"},

    # Hard (10)
    {"id": 21, "difficulty": "hard", "task": "Write a Python function that finds the longest common subsequence of two strings"},
    {"id": 22, "difficulty": "hard", "task": "Write a Python function that solves the two-sum problem using a hash map"},
    {"id": 23, "difficulty": "hard", "task": "Write a Python function implementing merge sort"},
    {"id": 24, "difficulty": "hard", "task": "Write a Python class implementing a min-heap with insert and extract_min methods"},
    {"id": 25, "difficulty": "hard", "task": "Write a Python function that finds all valid parentheses combinations for n pairs"},
    {"id": 26, "difficulty": "hard", "task": "Write a Python function that implements the knapsack problem using dynamic programming"},
    {"id": 27, "difficulty": "hard", "task": "Write a Python function that detects if a linked list has a cycle"},
    {"id": 28, "difficulty": "hard", "task": "Write a Python function that finds the longest palindromic substring"},
    {"id": 29, "difficulty": "hard", "task": "Write a Python function that implements quicksort with random pivot selection"},
    {"id": 30, "difficulty": "hard", "task": "Write a Python function that solves the coin change problem using dynamic programming"},
]


def run_single(task_obj: dict) -> dict:
    start = time.time()
    try:
        result = graph.invoke({
            "session_id": f"bench-{task_obj['id']}",
            "task": task_obj["task"],
            "plan": "", "code": "", "review": {},
            "execution_result": {}, "final_code": "",
            "iterations": 0, "debug_attempts": 0, "timeline": []
        })
        elapsed = round(time.time() - start, 2)
        return {
            "id": task_obj["id"],
            "difficulty": task_obj["difficulty"],
            "task": task_obj["task"],
            "passed": result["execution_result"]["success"],
            "score": result["review"]["score"],
            "iterations": result["iterations"],
            "debug_attempts": result["debug_attempts"],
            "elapsed_seconds": elapsed,
            "error": None
        }
    except Exception as e:
        return {
            "id": task_obj["id"],
            "difficulty": task_obj["difficulty"],
            "task": task_obj["task"],
            "passed": False,
            "score": 0,
            "iterations": 0,
            "debug_attempts": 0,
            "elapsed_seconds": round(time.time() - start, 2),
            "error": str(e)
        }


def print_summary(results: list):
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    avg_score = round(sum(r["score"] for r in results) / total, 1)
    avg_time = round(sum(r["elapsed_seconds"] for r in results) / total, 1)

    print("\n" + "=" * 60)
    print("BENCHMARK RESULTS")
    print("=" * 60)
    print(f"Total tasks:    {total}")
    print(f"Passed:         {passed}/{total} ({round(passed/total*100)}%)")
    print(f"Avg score:      {avg_score}/10")
    print(f"Avg time:       {avg_time}s per task")

    for diff in ["easy", "medium", "hard"]:
        subset = [r for r in results if r["difficulty"] == diff]
        if not subset:
            continue  # skip difficulties not in this run
        diff_passed = sum(1 for r in subset if r["passed"])
        diff_score = round(sum(r["score"] for r in subset) / len(subset), 1)
        print(f"\n  {diff.upper()} ({len(subset)} tasks)")
        print(f"    Pass rate: {diff_passed}/{len(subset)} ({round(diff_passed/len(subset)*100)}%)")
        print(f"    Avg score: {diff_score}/10")

    print("\n  Failed tasks:")
    failed = [r for r in results if not r["passed"]]
    if not failed:
        print("    None! All tasks passed.")
    for r in failed:
        print(f"    [{r['difficulty']}] Task {r['id']}: {r['task'][:60]}...")
        if r["error"]:
            print(f"      Error: {r['error'][:100]}")


def main():
    # Allow running a subset: python run_benchmark.py 5
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(TASKS)
    tasks_to_run = TASKS[:limit]

    print(f"Running {len(tasks_to_run)} benchmark tasks...")
    print("This will take several minutes. Each task runs the full agent pipeline.\n")

    results = []
    for i, task_obj in enumerate(tasks_to_run, 1):
        print(f"[{i}/{len(tasks_to_run)}] [{task_obj['difficulty'].upper()}] {task_obj['task'][:55]}...")
        result = run_single(task_obj)
        status = "✓" if result["passed"] else "✗"
        print(f"  {status} score={result['score']}/10 | time={result['elapsed_seconds']}s | iterations={result['iterations']}")
        results.append(result)

        # Save after every task so progress isn't lost
        with open("benchmark/results.json", "w") as f:
            json.dump(results, f, indent=2)

    print_summary(results)

    # Save final results
    with open("benchmark/results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results saved to benchmark/results.json")


if __name__ == "__main__":
    main()