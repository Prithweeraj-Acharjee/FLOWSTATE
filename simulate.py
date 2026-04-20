"""
FlowState — Simulate realistic degradation data
Run this if you don't have an API key yet.
Produces realistic results.json matching real GPT behavior.
"""

import json
import random

random.seed(42)

def simulate():
    results = []

    for i in range(1, 41):
        # quality stays high early, degrades sharply after message 15
        if i <= 5:
            base = random.uniform(8.5, 9.5)
        elif i <= 10:
            base = random.uniform(7.8, 9.0)
        elif i <= 15:
            base = random.uniform(7.0, 8.5)
        elif i <= 20:
            base = random.uniform(5.5, 7.5)
        elif i <= 25:
            base = random.uniform(4.0, 6.5)
        elif i <= 30:
            base = random.uniform(3.0, 5.5)
        elif i <= 35:
            base = random.uniform(2.5, 4.5)
        else:
            base = random.uniform(2.0, 3.5)

        noise = random.uniform(-0.3, 0.3)
        overall = round(max(min(base + noise, 10), 0), 2)

        results.append({
            "message"     : i,
            "relevance"   : round(max(overall + random.uniform(-0.5, 0.5), 0), 2),
            "specificity" : round(max(overall + random.uniform(-0.8, 0.3), 0), 2),
            "length"      : round(max(overall + random.uniform(-0.3, 0.6), 0), 2),
            "repetition"  : round(max(overall + random.uniform(-1.0, 0.2), 0), 2),
            "overall"     : overall,
            "word_count"  : int(random.uniform(400 - i * 7, 500 - i * 5)),
        })

    with open("results.json", "w") as f:
        json.dump(results, f, indent=2)

    print("Done. Simulated results.json generated. Run visualize.py now.")

if __name__ == "__main__":
    simulate()
