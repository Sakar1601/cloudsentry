"""A fictional AWS account for demo mode.

Produces graphs in exactly the shape `app.graph.builder.build_graph` returns,
so the poller, diffing, broadcasting, agent selection and the UI all run
unchanged. Metrics drift on every build, and a few nodes spike periodically so
the Cost and Performance agents have something to react to.
"""

import datetime
import random

NODES = [
    # (node_id, resource_type, name, state, tags, base_cost_7d, base_metric)
    ("ec2:i-0a1b2c3d4e5f60001", "ec2", "api-server-1", "running", {"Name": "api-server-1", "env": "prod"}, 18.4, 34.0),
    ("ec2:i-0a1b2c3d4e5f60002", "ec2", "api-server-2", "running", {"Name": "api-server-2", "env": "prod"}, 18.4, 31.0),
    ("ec2:i-0a1b2c3d4e5f60003", "ec2", "batch-worker", "running", {"Name": "batch-worker", "env": "prod"}, 41.2, 12.0),
    ("ec2:i-0a1b2c3d4e5f60004", "ec2", "legacy-bastion", "running", {"Name": "legacy-bastion", "env": "dev"}, 9.7, 1.5),
    ("lambda:order-processor", "lambda", "order-processor", "active", {}, 3.1, 220.0),
    ("lambda:image-resizer", "lambda", "image-resizer", "active", {}, 1.8, 640.0),
    ("lambda:notify-user", "lambda", "notify-user", "active", {}, 0.4, 95.0),
    ("dynamodb:orders", "dynamodb", "orders", "ACTIVE", {}, 5.6, 410.0),
    ("dynamodb:sessions", "dynamodb", "sessions", "ACTIVE", {}, 2.2, 150.0),
]

EDGES = [
    ("ec2:i-0a1b2c3d4e5f60001", "ec2:i-0a1b2c3d4e5f60002", "same_vpc"),
    ("ec2:i-0a1b2c3d4e5f60001", "ec2:i-0a1b2c3d4e5f60003", "same_vpc"),
    ("ec2:i-0a1b2c3d4e5f60002", "ec2:i-0a1b2c3d4e5f60003", "same_vpc"),
    ("ec2:i-0a1b2c3d4e5f60003", "ec2:i-0a1b2c3d4e5f60004", "same_vpc"),
    ("lambda:order-processor", "dynamodb:orders", "references"),
    ("lambda:order-processor", "dynamodb:orders", "iam_access"),
    ("lambda:notify-user", "dynamodb:sessions", "references"),
    ("lambda:notify-user", "dynamodb:sessions", "iam_access"),
    ("lambda:image-resizer", "dynamodb:orders", "iam_access"),
]

# Nodes that periodically spike so the agents' "1.5x above baseline" selection fires.
SPIKY_COST = {"ec2:i-0a1b2c3d4e5f60003"}
SPIKY_METRIC = {"ec2:i-0a1b2c3d4e5f60001", "lambda:image-resizer"}
SPIKE_EVERY = 4  # builds


class DemoGraphBuilder:
    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)
        self._builds = 0

    def __call__(self, clients: dict | None = None) -> dict:
        self._builds += 1
        spike = self._builds % SPIKE_EVERY == 0
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        nodes = {}
        for node_id, rtype, name, state, tags, base_cost, base_metric in NODES:
            cost = base_cost * self._rng.uniform(0.97, 1.03)
            metric = base_metric * self._rng.uniform(0.9, 1.1)
            if spike and node_id in SPIKY_COST:
                cost *= 2.2
            if spike and node_id in SPIKY_METRIC:
                metric *= 2.6
            nodes[node_id] = {
                "node_id": node_id,
                "resource_type": rtype,
                "name": name,
                "state": state,
                "tags": tags,
                "cost_7d": round(cost, 2),
                "last_metric_snapshot": {"timestamp": now, "value": round(metric, 2)},
            }

        edges = [{"source": s, "target": t, "relation": r} for s, t, r in EDGES]
        return {"nodes": nodes, "edges": edges}
