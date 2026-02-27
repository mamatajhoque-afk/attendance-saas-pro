from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

# This router handles the open WebSocket connections
ws_router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # Stores active connections. Format: {"device_uid": WebSocket}
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, device_id: str):
        """Accepts the connection from the ESP32 and saves it."""
        await websocket.accept()
        self.active_connections[device_id] = websocket
        print(f"🔌 Hardware Connected: {device_id}")

    def disconnect(self, device_id: str):
        """Removes the connection if the ESP32 goes offline."""
        if device_id in self.active_connections:
            del self.active_connections[device_id]
            print(f"❌ Hardware Disconnected: {device_id}")

    async def trigger_door(self, device_id: str):
        """Shouts down the open phone line to open the door instantly."""
        if device_id in self.active_connections:
            try:
                # Sends a JSON message that the ESP32 will understand
                await self.active_connections[device_id].send_text(json.dumps({"command": "open_door"}))
                print(f"🔓 Sent OPEN command to {device_id}")
                return True
            except Exception as e:
                print(f"⚠️ Error sending to {device_id}: {e}")
                self.disconnect(device_id)
                return False
        
        print(f"⚠️ Cannot open door: {device_id} is offline")
        return False

# Create the single global manager
manager = ConnectionManager()

# --- THE ENDPOINT WHERE THE ESP32 CONNECTS ---
@ws_router.websocket("/ws/hardware/{device_id}")
async def hardware_websocket(websocket: WebSocket, device_id: str):
    """
    The ESP32 connects to this URL: wss://your-api.onrender.com/ws/hardware/ZKT_001
    """
    await manager.connect(websocket, device_id)
    try:
        while True:
            # Wait for data (including automatic heartbeat pings from the ESP32)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                
    except Exception as e:
        print(f"⚠️ Connection interrupted for {device_id}: {e}")
        
    finally:
        # ⚡ THIS IS THE FIX: It guarantees the server always cleans up
        # so the ESP32 can successfully reconnect when it tries again!
        manager.disconnect(device_id)
