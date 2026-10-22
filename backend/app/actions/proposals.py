from app.actions.validation import InvalidAction, validate_action


def propose_action(action_store, agent_id: str, node_id: str, tool_name: str, params: dict) -> dict:
    try:
        params = validate_action(tool_name, params)
    except InvalidAction as exc:
        # Returned to the model as the tool result so it can correct itself; nothing is recorded.
        return {"error": f"Proposal refused: {exc}"}

    action = action_store.create(agent_id=agent_id, node_id=node_id, tool_name=tool_name, params=params)
    return {
        "pending_action": action,
        "message": f"Proposed '{tool_name}' for human approval (action id {action['id']}).",
    }


def build_action_tool(action_store, agent_id: str, node_id: str, tool_name: str):
    def action_tool(**kwargs) -> dict:
        return propose_action(action_store, agent_id, node_id, tool_name, kwargs)

    return action_tool
