THRESHOLD_FACTOR = 1.5
MAX_HISTORY_LENGTH = 5


def _pick_node_above_threshold(nodes: dict, history: dict, value_fn) -> str | None:
    selected = None
    for node_id, node in nodes.items():
        value = value_fn(node)
        if value is None:
            continue

        past_values = history.setdefault(node_id, [])
        if selected is None and past_values:
            baseline = sum(past_values) / len(past_values)
            if baseline > 0 and value > baseline * THRESHOLD_FACTOR:
                selected = node_id

        past_values.append(value)
        if len(past_values) > MAX_HISTORY_LENGTH:
            past_values.pop(0)

    return selected


def select_cost_node(nodes: dict, history: dict) -> str | None:
    return _pick_node_above_threshold(nodes, history, lambda node: node.get("cost_7d"))


def select_performance_node(nodes: dict, history: dict) -> str | None:
    def value_fn(node):
        snapshot = node.get("last_metric_snapshot")
        return snapshot["value"] if snapshot else None

    return _pick_node_above_threshold(nodes, history, value_fn)


def select_security_node(nodes: dict, history: dict) -> str | None:
    lambda_ids = sorted(
        node_id for node_id, node in nodes.items() if node.get("resource_type") == "lambda"
    )
    if not lambda_ids:
        return None

    cursor = history.get("cursor", 0) % len(lambda_ids)
    history["cursor"] = cursor + 1
    return lambda_ids[cursor]
