import argparse
import time

import boto3


def invoke_once(function_name: str, client=None) -> dict:
    client = client or boto3.client("lambda")
    response = client.invoke(
        FunctionName=function_name, InvocationType="RequestResponse", Payload=b"{}"
    )
    return {"function_name": function_name, "status_code": response["StatusCode"]}


def run_loop(
    function_names: list[str],
    interval_seconds: float,
    client=None,
    iterations: int | None = None,
    on_result=None,
) -> None:
    count = 0
    while iterations is None or count < iterations:
        for function_name in function_names:
            result = invoke_once(function_name, client=client)
            if on_result is not None:
                on_result(result)
        count += 1
        if iterations is None or count < iterations:
            time.sleep(interval_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Cloudsentry traffic generator")
    parser.add_argument("functions", nargs="+", help="Lambda function names to invoke on a loop")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between invocation rounds")
    args = parser.parse_args()

    def log_result(result: dict) -> None:
        print(f"invoked {result['function_name']}: status {result['status_code']}")

    run_loop(args.functions, args.interval, on_result=log_result)


if __name__ == "__main__":
    main()
