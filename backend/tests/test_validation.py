import pytest

from app.actions.validation import InvalidAction, validate_action

INSTANCE = "i-0123456789abcdef0"


def policy(*statements):
    return {
        "role_name": "orders-fn-role",
        "policy_name": "orders-access",
        "new_policy_document": {"Version": "2012-10-17", "Statement": list(statements)},
    }


NARROW = {"Effect": "Allow", "Action": ["dynamodb:GetItem"], "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders"}


class TestStopAndResize:
    def test_accepts_real_instance_ids_and_types(self):
        assert validate_action("stop_ec2_instance", {"instance_id": INSTANCE}) == {"instance_id": INSTANCE}
        assert validate_action("stop_ec2_instance", {"instance_id": "i-12345678"})["instance_id"] == "i-12345678"
        for itype in ("t3.micro", "m5.xlarge", "c6i.32xlarge", "u-6tb1.112xlarge"):
            validate_action("resize_ec2_instance", {"instance_id": INSTANCE, "new_instance_type": itype})

    @pytest.mark.parametrize(
        "bad_id", ["i-1", "I-0123456789abcdef0", "i-0123456789abcdef0 ", "i-0123456789abcdef0;ls", "", "*", "../x"]
    )
    def test_rejects_malformed_instance_ids(self, bad_id):
        with pytest.raises(InvalidAction):
            validate_action("stop_ec2_instance", {"instance_id": bad_id})

    @pytest.mark.parametrize("bad_type", ["", "m5", "m5.", "m5.xlarge; drop", "M5.XLARGE", "m5.xlarge extra", "x" * 80 + ".large"])
    def test_rejects_malformed_instance_types(self, bad_type):
        with pytest.raises(InvalidAction):
            validate_action("resize_ec2_instance", {"instance_id": INSTANCE, "new_instance_type": bad_type})

    def test_rejects_unexpected_or_missing_parameters(self):
        with pytest.raises(InvalidAction):
            validate_action("stop_ec2_instance", {"instance_id": INSTANCE, "force": True})
        with pytest.raises(InvalidAction):
            validate_action("resize_ec2_instance", {"instance_id": INSTANCE})

    def test_rejects_unknown_tools_and_non_objects(self):
        with pytest.raises(InvalidAction):
            validate_action("terminate_everything", {})
        with pytest.raises(InvalidAction):
            validate_action("stop_ec2_instance", "i-0123456789abcdef0")


class TestTightenPolicy:
    def test_accepts_a_narrow_policy(self):
        assert validate_action("tighten_iam_policy", policy(NARROW))["role_name"] == "orders-fn-role"

    @pytest.mark.parametrize(
        "statement",
        [
            {"Effect": "Allow", "Action": "*", "Resource": "*"},
            {"Effect": "Allow", "Action": ["*"], "Resource": "arn:aws:s3:::b"},
            {"Effect": "Allow", "Action": "iam:*", "Resource": "arn:aws:iam::123456789012:role/x"},
            {"Effect": "Allow", "Action": "iam:PassRole", "Resource": "arn:aws:iam::123456789012:role/x"},
            {"Effect": "Allow", "Action": "iam:AttachRolePolicy", "Resource": "arn:aws:iam::123456789012:role/x"},
            {"Effect": "Allow", "Action": "sts:AssumeRole", "Resource": "arn:aws:iam::123456789012:role/x"},
            {"Effect": "Allow", "Action": "dynamodb:*", "Resource": "*"},
            {"Effect": "Allow", "Action": ["dynamodb:GetItem", "s3:*"], "Resource": ["*"]},
        ],
    )
    def test_rejects_policies_that_widen_or_escalate(self, statement):
        with pytest.raises(InvalidAction):
            validate_action("tighten_iam_policy", policy(statement))

    @pytest.mark.parametrize(
        "bad",
        [
            {"Effect": "Allow", "NotAction": "s3:*", "Resource": "*"},
            {"Effect": "Allow", "Action": "s3:GetObject", "Principal": "*", "Resource": "arn:aws:s3:::b/*"},
            {"Effect": "Maybe", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::b/*"},
            {"Effect": "Allow", "Action": "s3:GetObject"},
        ],
    )
    def test_rejects_unsupported_statement_shapes(self, bad):
        with pytest.raises(InvalidAction):
            validate_action("tighten_iam_policy", policy(bad))

    def test_rejects_bad_document_envelope(self):
        params = policy(NARROW)
        params["new_policy_document"]["Version"] = "1999-01-01"
        with pytest.raises(InvalidAction):
            validate_action("tighten_iam_policy", params)

        with pytest.raises(InvalidAction):
            validate_action("tighten_iam_policy", policy())  # no statements

        with pytest.raises(InvalidAction):
            validate_action("tighten_iam_policy", policy(*[NARROW] * 21))

        big = policy({**NARROW, "Sid": "x" * 7000})
        with pytest.raises(InvalidAction):
            validate_action("tighten_iam_policy", big)

    def test_rejects_bad_names(self):
        params = policy(NARROW)
        params["role_name"] = "role/../admin"
        with pytest.raises(InvalidAction):
            validate_action("tighten_iam_policy", params)

    def test_deny_statements_may_use_wildcards(self):
        deny = {"Effect": "Deny", "Action": "*", "Resource": "*"}
        validate_action("tighten_iam_policy", policy(NARROW, deny))
