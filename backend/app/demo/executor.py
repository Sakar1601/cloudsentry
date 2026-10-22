"""Demo-mode replacement for `app.actions.executor.execute_action`: never touches AWS."""


def simulate_action(action: dict, client=None) -> dict:
    return {
        "success": True,
        "result": {"simulated": True, "action": action["tool_name"], **action["params"]},
    }
