import asyncio
import json

from anthropic import Anthropic

MODEL = "claude-sonnet-5"
MAX_TOKENS = 1024
MAX_TOOL_ITERATIONS = 5
FALLBACK_FINDING = "Investigation inconclusive after multiple tool calls."


async def investigate_node(
    node: dict,
    investigation_focus: str,
    tool_definitions: list[dict],
    tool_dispatch: dict,
    client=None,
) -> str:
    client = client or Anthropic()
    messages = [
        {
            "role": "user",
            "content": (
                f"Investigate {node['resource_type']} resource '{node['name']}' "
                f"(node id {node['node_id']}) for {investigation_focus}. "
                "Use the available tools to gather real data, then give a concise "
                "(2-3 sentence) plain-language finding."
            ),
        }
    ]

    for _ in range(MAX_TOOL_ITERATIONS):
        response = await asyncio.to_thread(
            client.messages.create,
            model=MODEL,
            max_tokens=MAX_TOKENS,
            tools=tool_definitions,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return "\n".join(block.text for block in response.content if block.type == "text")

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            try:
                result = tool_dispatch[block.name](**block.input)
                content = json.dumps(result, default=str)
            except Exception as exc:
                content = json.dumps({"error": str(exc)})
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": content}
            )
        messages.append({"role": "user", "content": tool_results})

    return FALLBACK_FINDING
