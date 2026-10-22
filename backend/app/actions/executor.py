from app.actions.validation import InvalidAction, validate_action
from app.tools import actions as aws_actions

# The only code in the project that mutates AWS. Reached solely through the
# approve endpoint.
EXECUTORS = {
    "stop_ec2_instance": "stop_ec2_instance",
    "resize_ec2_instance": "resize_ec2_instance",
    "tighten_iam_policy": "tighten_iam_policy",
}


def execute_action(action: dict, client=None) -> dict:
    try:
        params = validate_action(action["tool_name"], action["params"])
    except InvalidAction as exc:
        return {"success": False, "error": f"Refused to execute: {exc}"}

    # Looked up at call time so tests can patch app.tools.actions.<name>.
    executor = getattr(aws_actions, EXECUTORS[action["tool_name"]])
    try:
        result = executor(**params, client=client)
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
