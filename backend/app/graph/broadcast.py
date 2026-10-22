MAX_CONNECTIONS = 50


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: list = []

    async def connect(self, websocket) -> bool:
        """Accept the socket unless the server is at capacity. Returns whether it was accepted."""
        if len(self.connections) >= MAX_CONNECTIONS:
            await websocket.close(code=1013)
            return False
        await websocket.accept()
        self.connections.append(websocket)
        return True

    def disconnect(self, websocket) -> None:
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, event: dict) -> None:
        stale = []
        for connection in self.connections:
            try:
                await connection.send_json(event)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)
