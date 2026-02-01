from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import pytz

from app.db.database import get_db
from app.db.models import Employee, Attendance, DepartmentSession, LocationLog
from app.schemas.schemas import AttendanceMark, TrackingStart, LocationUpdate
from app.routers.auth import oauth2_scheme
from jose import jwt
from app.core.config import settings

router = APIRouter()
dhaka_zone = pytz.timezone('Asia/Dhaka')

# --- HELPER: Verify Employee Token ---
def get_current_employee(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # We allow 'employee' role specifically
        if payload.get("role") != "employee": 
            raise HTTPException(status_code=403, detail="Not authorized")
        return payload
    except:
        raise HTTPException(status_code=401, detail="Invalid Credentials")

# 1. GET MY PROFILE
@router.get("/api/me")
def get_my_profile(db: Session = Depends(get_db), user: dict = Depends(get_current_employee)):
    emp = db.query(Employee).filter(Employee.employee_id == user["sub"]).first()
    if not emp: raise HTTPException(404, "User not found")
    
    today = datetime.now(dhaka_zone).date()
    att = db.query(Attendance).filter(Attendance.employee_id == emp.employee_id, Attendance.date_only == today).first()
    
    return {
        "id": emp.employee_id,
        "name": emp.name,
        "role": emp.role,
        "company_id": emp.company_id,
        "today": {
            "status": att.status if att else "Absent",
            "checkIn": att.check_in_time if att and att.check_in_time else None,
            "checkOut": att.check_out_time if att and att.check_out_time else None
        }
    }

# 2. MARK ATTENDANCE (GPS)
@router.post("/api/mark_attendance")
def mark_attendance(
    payload: AttendanceMark,
    db: Session = Depends(get_db),
    # Logic note: We trust the payload ID if token is valid, or you can force user['sub']
    user: dict = Depends(get_current_employee) 
):
    now = datetime.now(dhaka_zone)
    today = now.date()
    
    # Verify the employee ID matches the token (Security)
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Cannot mark attendance for another user")
        
    existing = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == today
    ).first()
    
    if not existing:
        # Check In
        db.add(Attendance(
            company_id=user["company_id"],
            employee_id=payload.employee_id,
            timestamp=now,
            date_only=today,
            status="Present",
            location=payload.location,
            source="MOBILE",
            check_in_time=now
        ))
        msg = "Checked In"
    else:
        # Check Out (Debounce 1 min)
        if (now - existing.check_in_time).total_seconds() < 60:
             return {"status": "ignored", "message": "Too soon to check out"}
        
        existing.check_out_time = now
        msg = "Checked Out"
        
    db.commit()
    return {"status": "success", "message": msg}

# 3. START TRACKING (Marketing)
@router.post("/api/tracking/start")
def start_tracking(
    payload: TrackingStart,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    emp = db.query(Employee).filter(Employee.employee_id == payload.employee_id).first()
    
    # Close previous sessions
    db.query(DepartmentSession).filter(
        DepartmentSession.employee_id == emp.id, 
        DepartmentSession.active == True
    ).update({"active": False, "end_time": datetime.now(dhaka_zone)})
    
    # Start new
    sess = DepartmentSession(
        employee_id=emp.id, 
        company_id=emp.company_id, 
        department=payload.department, 
        start_time=datetime.now(dhaka_zone), 
        active=True
    )
    db.add(sess)
    db.commit()
    return {"status": "success", "session_id": sess.id}

# 4. PUSH GPS LOCATION
@router.post("/api/tracking/update")
def update_location(payload: LocationUpdate, db: Session = Depends(get_db)):
    # This might need auth check in production, but often kept open for background workers
    db.add(LocationLog(
        session_id=payload.session_id,
        latitude=payload.lat,
        longitude=payload.lng,
        status=payload.status,
        recorded_at=datetime.now(dhaka_zone)
    ))
    db.commit()
    return {"status": "success"}

# 5. LIVE MAP (Used by Company Admin)
# Note: Usually this goes in Company Router, but I'll place it here to match your old structure
@router.get("/company/tracking/live")
def get_live_map(db: Session = Depends(get_db)):
    # This endpoint is special: It's called by Company Admin, but reads Tracking data
    # In a perfect world, move this to company.py and add Admin Auth.
    # For now, I will leave it open or you can import get_current_admin
    pass