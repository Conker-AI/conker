"""Small public smoke evaluation; not a claim of production routing accuracy."""
import argparse
import json
import os
import statistics
import time

import psutil

from server import ChoiceRequest, LayaBackend

CASES = [
    ("Hi, how are you?", "simple"),
    ("Rewrite this sentence politely: Send the report today.", "simple"),
    ("What is the capital of France?", "simple"),
    ("Translate good morning into Spanish.", "simple"),
    ("Design a distributed database that remains consistent during network partitions and explain tradeoffs.", "complex"),
    ("Find the concurrency bug in our transaction design and prove your fix avoids duplicate payments.", "complex"),
    ("Compare three architectural approaches for a durable workflow engine with recovery after a crash.", "complex"),
    ("Develop a rigorous proof of convergence for a novel optimization algorithm.", "complex"),
]

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model_path")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    backend = LayaBackend(args.model_path, "laya-english@1c5edc17", threads=4)
    load_ms = (time.perf_counter() - started) * 1000
    rows = []
    for text, expected in CASES:
        request = ChoiceRequest(state=text, instructions="How much reasoning does this task require?",
                                choices={"simple": "Basic conversation or straightforward transformation",
                                         "complex": "Difficult reasoning, technical analysis or multi-step planning"})
        started = time.perf_counter()
        result = backend.choose(request)
        rows.append({"input": text, "expected": expected, **result,
                     "elapsed_ms": round((time.perf_counter() - started) * 1000, 2)})
    report = {"model": backend.model, "device": "cpu", "threads": 4,
              "load_ms": round(load_ms, 2), "rss_mb": round(psutil.Process(os.getpid()).memory_info().rss / 2**20),
              "correct": sum(row["choice"] == row["expected"] for row in rows),
              "total": len(rows), "warm_median_ms": statistics.median(row["elapsed_ms"] for row in rows[1:]),
              "cases": rows, "limitation": "Eight hand-labeled smoke cases; not a general quality benchmark."}
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
    print(json.dumps({k: v for k, v in report.items() if k != "cases"}))
