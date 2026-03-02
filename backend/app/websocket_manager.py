import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# This router handles the open WebSocket connections
ws_router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # Stores active sockets
        self.active_sockets: dict[str, WebSocket] = {}
        # Stores message queues for thread-safe cross-task communication
        self.message_queues: dict[str, asyncio.Queue] = {}

    async def connect(self, websocket: WebSocket, device_id: str):
        """Accepts the connection and creates a dedicated message queue."""
        await websocket.accept()
        self.active_sockets[device_id] = websocket
        self.message_queues[device_id] = asyncio.Queue()
        print(f"🔌 Hardware Connected: {device_id}")

    def disconnect(self, device_id: str):
        """Safely cleans up dictionaries when offline."""
        self.active_sockets.pop(device_id, None)
        self.message_queues.pop(device_id, None)
        print(f"❌ Hardware Disconnected: {device_id}")

    async def trigger_door(self, device_id: str):
        """Queues the open command instead of forcing a cross-task write."""
        if device_id in self.message_queues:
            try:
                # Drop message into the queue safely (No direct socket writing here!)
                await self.message_queues[device_id].put(json.dumps({"command": "open_door"}))
                print(f"🔓 Queued OPEN command for {device_id}")
                return True
            except Exception as e:
                print(f"⚠️ Error queueing command for {device_id}: {e}")
                return False
        
        print(f"⚠️ Cannot open door: {device_id} is offline")
        return False

# Create the single global manager
manager = ConnectionManager()

# --- THE ENDPOINT WHERE THE ESP32 CONNECTS ---
@ws_router.websocket("/ws/hardware/{device_id}")
async def hardware_websocket(websocket: WebSocket, device_id: str):
    await manager.connect(websocket, device_id)
    queue = manager.message_queues[device_id]

    # Background task to SAFELY send messages strictly from the queue
    async def queue_worker():
        try:
            while True:
                msg = await queue.get()
                await websocket.send_text(msg)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Queue worker error: {e}")

    # Start the sender task alongside the receiver
    worker_task = asyncio.create_task(queue_worker())

    try:
        while True:
            # Main loop only handles receiving
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                
    except Exception as e:
        # Catch all disconnects smoothly
        print(f"⚠️ WS Connection Closed for {device_id}: {e}")
        
    finally:
        # 100% Guaranteed Cleanup when the connection ends
        worker_task.cancel() 
        manager.disconnect(device_id)
