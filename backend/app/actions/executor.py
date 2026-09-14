import sys

from app.tools.actions import resize_ec2_instance, stop_ec2_instance, tighten_iam_policy

# Values are the executor functions' own module-level names, looked up dynamically
# at call time (via getattr below) rather than bound here — this keeps
# `unittest.mock.patch("app.actions.executor.stop_ec2_instance", ...)` effective,
# since patch() rebinds the module attribute, not any reference captured elsewhere.
EXECUTOR_DISPATCH = {
    "stop_ec2_instance": "stop_ec2_instance",
    "resize_ec2_instance": "resize_ec2_instance",
    "tighten_iam_policy": "tighten_iam_policy",
}


def execute_action(action: dict, client=None) -> dict:
    executor = getattr(sys.modules[__name__], EXECUTOR_DISPATCH[action["tool_name"]])
    try:
        result = executor(**action["params"], client=client)
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
