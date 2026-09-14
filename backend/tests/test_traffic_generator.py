from unittest.mock import MagicMock, patch

from scripts.traffic_generator import invoke_once, run_loop


def test_invoke_once_calls_lambda_invoke_and_returns_status():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}

    result = invoke_once("my-service", client=mock_client)

    assert result == {"function_name": "my-service", "status_code": 200}
    mock_client.invoke.assert_called_once_with(
        FunctionName="my-service", InvocationType="RequestResponse", Payload=b"{}"
    )


def test_run_loop_invokes_each_function_per_round_for_requested_iterations():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}
    results = []

    with patch("scripts.traffic_generator.time.sleep") as mock_sleep:
        run_loop(
            ["fn-a", "fn-b"],
            interval_seconds=5.0,
            client=mock_client,
            iterations=2,
            on_result=results.append,
        )

    assert len(results) == 4
    assert [r["function_name"] for r in results] == ["fn-a", "fn-b", "fn-a", "fn-b"]
    assert mock_sleep.call_count == 1


def test_run_loop_does_not_sleep_after_the_final_round():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}

    with patch("scripts.traffic_generator.time.sleep") as mock_sleep:
        run_loop(["fn-a"], interval_seconds=1.0, client=mock_client, iterations=1)

    mock_sleep.assert_not_called()


def test_run_loop_works_without_an_on_result_callback():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}

    with patch("scripts.traffic_generator.time.sleep"):
        run_loop(["fn-a"], interval_seconds=0, client=mock_client, iterations=1)
