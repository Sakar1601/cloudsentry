from app.actions.store import ActionStore


def test_create_returns_pending_record_with_decoded_params():
    store = ActionStore(":memory:")

    action = store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )

    assert action["agent_id"] == "cost"
    assert action["node_id"] == "ec2:i-1"
    assert action["tool_name"] == "stop_ec2_instance"
    assert action["params"] == {"instance_id": "i-1"}
    assert action["status"] == "pending"
    assert action["proposed_reasoning"] is None
    assert action["resolved_at"] is None
    assert action["result"] is None
    assert isinstance(action["id"], str) and action["id"]
    assert isinstance(action["created_at"], str) and action["created_at"]


def test_get_returns_none_for_unknown_id():
    store = ActionStore(":memory:")

    assert store.get("does-not-exist") is None


def test_get_returns_previously_created_record():
    store = ActionStore(":memory:")
    created = store.create(
        agent_id="security", node_id="lambda:fn", tool_name="tighten_iam_policy", params={"role_name": "r"}
    )

    fetched = store.get(created["id"])

    assert fetched == created


def test_list_includes_all_created_records():
    store = ActionStore(":memory:")
    first = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})
    second = store.create(agent_id="performance", node_id="ec2:i-2", tool_name="resize_ec2_instance", params={})

    ids_in_list = {action["id"] for action in store.list()}

    assert first["id"] in ids_in_list
    assert second["id"] in ids_in_list


def test_set_reasoning_updates_the_record():
    store = ActionStore(":memory:")
    action = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})

    store.set_reasoning(action["id"], "Instance idle for 14 hours.")

    assert store.get(action["id"])["proposed_reasoning"] == "Instance idle for 14 hours."


def test_resolve_sets_status_resolved_at_and_result():
    store = ActionStore(":memory:")
    action = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})

    resolved = store.resolve(action["id"], status="approved", result={"success": True, "result": {}})

    assert resolved["status"] == "approved"
    assert resolved["result"] == {"success": True, "result": {}}
    assert isinstance(resolved["resolved_at"], str) and resolved["resolved_at"]


def test_resolve_with_none_result_stores_none():
    store = ActionStore(":memory:")
    action = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})

    resolved = store.resolve(action["id"], status="rejected", result=None)

    assert resolved["status"] == "rejected"
    assert resolved["result"] is None
