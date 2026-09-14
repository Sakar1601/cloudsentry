from unittest.mock import MagicMock

import pytest

from app.agents.investigate import investigate_node


def _text_block(text):
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _tool_use_block(tool_id, name, tool_input):
    block = MagicMock()
    block.type = "tool_use"
    block.id = tool_id
    block.name = name
    block.input = tool_input
    return block


@pytest.mark.anyio
async def test_investigate_node_returns_text_when_no_tool_use():
    mock_client = MagicMock()
    response = MagicMock()
    response.stop_reason = "end_turn"
    response.content = [_text_block("Cost looks stable.")]
    mock_client.messages.create.return_value = response

    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "name": "web"}

    text = await investigate_node(node, "cost trends", [], {}, client=mock_client)

    assert text == "Cost looks stable."
    mock_client.messages.create.assert_called_once()


@pytest.mark.anyio
async def test_investigate_node_executes_tool_then_returns_final_text():
    mock_client = MagicMock()

    tool_response = MagicMock()
    tool_response.stop_reason = "tool_use"
    tool_response.content = [_tool_use_block("t1", "list_lambda_functions", {})]

    final_response = MagicMock()
    final_response.stop_reason = "end_turn"
    final_response.content = [_text_block("One function found, no issues.")]

    mock_client.messages.create.side_effect = [tool_response, final_response]

    node = {"node_id": "lambda:fn", "resource_type": "lambda", "name": "fn"}
    tool_dispatch = {"list_lambda_functions": lambda: [{"function_name": "fn"}]}

    text = await investigate_node(node, "performance issues", [], tool_dispatch, client=mock_client)

    assert text == "One function found, no issues."
    assert mock_client.messages.create.call_count == 2


@pytest.mark.anyio
async def test_investigate_node_reports_tool_error_without_raising():
    mock_client = MagicMock()

    tool_response = MagicMock()
    tool_response.stop_reason = "tool_use"
    tool_response.content = [_tool_use_block("t1", "get_iam_policy_for_role", {"role_name": "r"})]

    final_response = MagicMock()
    final_response.stop_reason = "end_turn"
    final_response.content = [_text_block("Could not verify policy.")]

    mock_client.messages.create.side_effect = [tool_response, final_response]

    def broken_tool(**kwargs):
        raise RuntimeError("boto3 boom")

    node = {"node_id": "lambda:fn", "resource_type": "lambda", "name": "fn"}

    text = await investigate_node(
        node, "IAM security risks", [], {"get_iam_policy_for_role": broken_tool}, client=mock_client
    )

    assert text == "Could not verify policy."


@pytest.mark.anyio
async def test_investigate_node_stops_after_max_iterations():
    mock_client = MagicMock()
    looping_response = MagicMock()
    looping_response.stop_reason = "tool_use"
    looping_response.content = [_tool_use_block("t1", "noop", {})]
    mock_client.messages.create.return_value = looping_response

    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "name": "web"}

    text = await investigate_node(node, "cost trends", [], {"noop": lambda: {}}, client=mock_client)

    assert text == "Investigation inconclusive after multiple tool calls."
    assert mock_client.messages.create.call_count == 5
