import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import pytz

from app.db.database import get_db
from app.db.models import HardwareDevice, Employee, Attendance, DoorEvent
from app.schemas.schemas import HardwareLog, EmergencyOpen

router = APIRouter()
dhaka_zone = pytz.timezone('Asia/Dhaka')

# --- THE DIGITAL MAILBOX (Bridge between Phone App & ESP32) ---
pending_door_commands: dict[str, bool] = {}

# --- SECURITY DEPENDENCY ---
def get_authorized_device(
    x_device_id: str = Header(..., alias="X-DEVICE-ID"), 
    x_device_key: str = Header(..., alias="X-DEVICE-KEY"), 
    db: Session = Depends(get_db)
):
    device = db.query(HardwareDevice).filter(
        HardwareDevice.device_uid == x_device_id,
        HardwareDevice.active == True
    ).first()

    if not device:
        raise HTTPException(status_code=401, detail="Unauthorized Device")

    if not secrets.compare_digest(device.secret_key, x_device_key):
        raise HTTPException(status_code=401, detail="Invalid Device Key")

    return device


# ==========================================
# 1. PHONE APP / WEBSITE TRIGGER
# ==========================================
@router.post("/admin/door/emergency-open")
def remote_open(  # ⚡ FIX: Removed 'async' to prevent synchronous DB calls from freezing the server
    payload: EmergencyOpen, 
    db: Session = Depends(get_db)
):
    # 1. Log the event in the database safely in a background thread
    db.add(DoorEvent(
        company_id=payload.company_id,
        event_type="ADMIN_OPEN",
        trigger_reason=f"EMERGENCY: {payload.reason}",
        device_id=payload.device_id,
        created_at=datetime.now(dhaka_zone)
    ))
    db.commit()
    
    # 2. PUT MAIL IN THE MAILBOX FOR THE ESP32
    # The ESP32 will pick this up on its next 2-second check
    pending_door_commands[payload.device_id] = True

    return {"status": "success", "message": "Command queued for hardware."}


# ==========================================
# 2. ESP32 HARDWARE POLLING (WebSocket Replacement)
# ==========================================
@router.get("/hardware/{device_id}/poll")
def poll_hardware(device_id: str):
    """The ESP32 calls this every 2 seconds to check for phone app commands."""
    
    # Check if the Phone App put mail in the mailbox for this device
    if pending_door_commands.get(device_id, False):
        
        # Clear the mailbox so the door only opens once
        pending_door_commands[device_id] = False
        return {"command": "open_door"}
    
    return {"command": "idle"}


# ==========================================
# 3. EMPLOYEE SCANNING (RFID / Fingerprint)
# ==========================================
@router.post("/integrations/zkteco/push-log")
def push_hardware_log(
    payload: HardwareLog,
    db: Session = Depends(get_db),
    device: HardwareDevice = Depends(get_authorized_device)
):
    # Validate Hardware Type
    current_type = str(device.device_type).upper()
    if current_type not in ["RASPBERRY_PI", "ESP32", "ZK_CONTROLLER"]:
         return {"status": "error", "open_door": False, "message": f"Unsupported Hardware: {current_type}"}
    
    # Find User (Scoped to Company)
    user = db.query(Employee).filter(
        Employee.employee_id == payload.employee_code,
        Employee.company_id == device.company_id,
        Employee.deleted_at == None
    ).first()

    if not user:
        return {"status": "error", "open_door": False, "message": "Access Denied"}
        
    if user.company.status != "active":
        return {"status": "error", "open_door": False, "message": "Company Suspended"}

    # Time Validation
    try:
        log_time = datetime.fromisoformat(payload.time_iso).astimezone(dhaka_zone)
        if abs((datetime.now(dhaka_zone) - log_time).total_seconds()) > 300:
             return {"status": "error", "open_door": False, "message": "Invalid Timestamp"}
    except ValueError:
        return {"status": "error", "open_door": False, "message": "Bad Time Format"}

    # Log Attendance
    today = log_time.date()
    existing = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_code,
        Attendance.date_only == today
    ).first()
    
    trigger_type = "CHECK_IN"
    
    if not existing:
        new_att = Attendance(
            company_id=user.company_id,
            employee_id=payload.employee_code,
            timestamp=log_time,
            date_only=today,
            status="Present",
            location=f"{device.location} ({device.device_type})",
            source="HARDWARE",
            device_id=device.device_uid,
            check_in_time=log_time
        )
        db.add(new_att)
    else:
        if log_time > existing.check_in_time:
            if existing.check_out_time is None or log_time > existing.check_out_time:
                existing.check_out_time = log_time
                trigger_type = "CHECK_OUT"
            else:
                trigger_type = "DUPLICATE_SCAN"
        else:
            trigger_type = "IGNORED"

    # Log Door Event
    db.add(DoorEvent(
        company_id=user.company_id,
        employee_id=user.id,
        event_type="AUTO_OPEN",
        trigger_reason=trigger_type,
        device_id=device.device_uid,
        created_at=datetime.now(dhaka_zone)
    ))
    db.commit()

    # If the hardware scanner itself is asking to open the door, 
    # the JSON response handles it directly!
    return {
        "status": "success", 
        "open_door": True, 
        "duration_ms": 3000, 
        "message": f"Welcome {user.name}"
    }
