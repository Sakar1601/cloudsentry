import datetime
import json
import sqlite3
import uuid


class ActionStore:
    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_actions (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                params TEXT NOT NULL,
                proposed_reasoning TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                resolved_at TEXT,
                result TEXT
            )
            """
        )
        self._conn.commit()

    def create(self, agent_id: str, node_id: str, tool_name: str, params: dict) -> dict:
        action_id = str(uuid.uuid4())
        created_at = datetime.datetime.utcnow().isoformat()
        self._conn.execute(
            "INSERT INTO pending_actions "
            "(id, agent_id, node_id, tool_name, params, proposed_reasoning, status, created_at, resolved_at, result) "
            "VALUES (?, ?, ?, ?, ?, NULL, 'pending', ?, NULL, NULL)",
            (action_id, agent_id, node_id, tool_name, json.dumps(params), created_at),
        )
        self._conn.commit()
        return self.get(action_id)

    def get(self, action_id: str) -> dict | None:
        row = self._conn.execute(
            "SELECT id, agent_id, node_id, tool_name, params, proposed_reasoning, status, "
            "created_at, resolved_at, result FROM pending_actions WHERE id = ?",
            (action_id,),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def list(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT id, agent_id, node_id, tool_name, params, proposed_reasoning, status, "
            "created_at, resolved_at, result FROM pending_actions ORDER BY created_at DESC"
        ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def set_reasoning(self, action_id: str, reasoning: str) -> None:
        self._conn.execute(
            "UPDATE pending_actions SET proposed_reasoning = ? WHERE id = ?", (reasoning, action_id)
        )
        self._conn.commit()

    def resolve(self, action_id: str, status: str, result: dict | None) -> dict:
        resolved_at = datetime.datetime.utcnow().isoformat()
        self._conn.execute(
            "UPDATE pending_actions SET status = ?, resolved_at = ?, result = ? WHERE id = ?",
            (status, resolved_at, json.dumps(result) if result is not None else None, action_id),
        )
        self._conn.commit()
        return self.get(action_id)

    @staticmethod
    def _row_to_dict(row) -> dict:
        (
            id_,
            agent_id,
            node_id,
            tool_name,
            params,
            proposed_reasoning,
            status,
            created_at,
            resolved_at,
            result,
        ) = row
        return {
            "id": id_,
            "agent_id": agent_id,
            "node_id": node_id,
            "tool_name": tool_name,
            "params": json.loads(params),
            "proposed_reasoning": proposed_reasoning,
            "status": status,
            "created_at": created_at,
            "resolved_at": resolved_at,
            "result": json.loads(result) if result else None,
        }
