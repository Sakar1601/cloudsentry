def propose_action(action_store, agent_id: str, node_id: str, tool_name: str, params: dict) -> dict:
    action = action_store.create(agent_id=agent_id, node_id=node_id, tool_name=tool_name, params=params)
    return {
        "pending_action": action,
        "message": f"Proposed '{tool_name}' for human approval (action id {action['id']}).",
    }


def build_action_tool(action_store, agent_id: str, node_id: str, tool_name: str):
    def action_tool(**kwargs) -> dict:
        return propose_action(action_store, agent_id, node_id, tool_name, kwargs)

    return action_tool
