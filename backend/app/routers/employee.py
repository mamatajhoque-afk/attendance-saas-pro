from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import pytz
from app.db.models import Company
from app.db.database import get_db
from app.db.models import Employee, Attendance, DepartmentSession, LocationLog, Company
from app.schemas.schemas import AttendanceMark, TrackingStart, LocationUpdate
from app.routers.auth import oauth2_scheme
from jose import jwt
from app.core.config import settings

from typing import List
from pydantic import BaseModel

router = APIRouter()
dhaka_zone = pytz.timezone('Asia/Dhaka')

# --- HELPER: Verify Employee Token ---
def get_current_employee(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("role") != "employee": 
            raise HTTPException(status_code=403, detail="Not authorized")
        return payload  # ✅ Returns a DICT (e.g., {"sub": "EMP01", "role": "employee"})
    except:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    
# ✅ 1. Define the Schema for the response
class AttendanceHistoryItem(BaseModel):
    date: str
    status: str
    check_in: str | None
    check_out: str | None

# 1. GET MY PROFILE
@router.get("/api/me")
def get_my_profile(db: Session = Depends(get_db), user: dict = Depends(get_current_employee)):
    # ✅ Correct usage: user["sub"]
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
    user: dict = Depends(get_current_employee) 
):
    now = datetime.now(dhaka_zone)
    today = now.date()
    
    # ✅ Correct usage: user["sub"]
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Cannot mark attendance for another user")
        
    existing = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == today
    ).first()
    
    if not existing:
        # 🕒 CHECK LATE STATUS
        status = "Present"
        # ✅ Correct usage: user["company_id"]
        company = db.query(Company).filter(Company.id == user["company_id"]).first()
        
        if company and company.work_start_time:
            try:
                start_dt = datetime.strptime(company.work_start_time, "%H:%M").time()
                if now.time() > start_dt:
                    status = "Late"
            except:
                pass # Ignore time format errors

        db.add(Attendance(
            company_id=user["company_id"],
            employee_id=payload.employee_id,
            timestamp=now,
            date_only=today,
            status=status,
            location=payload.location,
            source="MOBILE",
            type="check_in",
            check_in_time=now
        ))
        msg = f"Checked In ({status})"
    else:
        if (now - existing.check_in_time).total_seconds() < 60:
             return {"status": "ignored", "message": "Too soon to check out"}
        existing.check_out_time = now
        existing.type = "check_out"
        msg = "Checked Out"
        
    db.commit()
    return {"status": "success", "message": msg}

# 3. START TRACKING
@router.post("/api/tracking/start")
def start_tracking(
    payload: TrackingStart,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    emp = db.query(Employee).filter(Employee.employee_id == payload.employee_id).first()
    
    db.query(DepartmentSession).filter(
        DepartmentSession.employee_id == emp.id, 
        DepartmentSession.active == True
    ).update({"active": False, "end_time": datetime.now(dhaka_zone)})
    
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
    db.add(LocationLog(
        session_id=payload.session_id,
        latitude=payload.lat,
        longitude=payload.lng,
        status=payload.status,
        recorded_at=datetime.now(dhaka_zone)
    ))
    db.commit()
    return {"status": "success"}

@router.get("/api/office_config")
def get_office_config(
    db: Session = Depends(get_db), 
    user: dict = Depends(get_current_employee)
):
    # 1. Find the company of the logged-in user
    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    
    if not company:
        return {"lat": 0.0, "lng": 0.0, "radius": 50}
        
    return {
        "lat": float(company.office_lat) if company.office_lat else 0.0,
        "lng": float(company.office_lng) if company.office_lng else 0.0,
        "radius": float(company.office_radius) if company.office_radius else 50.0
    }

# 5. LIVE MAP 
@router.get("/company/tracking/live")
def get_live_map(db: Session = Depends(get_db)):
    pass

# 6. GET ATTENDANCE HISTORY (✅ THIS WAS THE BROKEN PART)
@router.get("/api/me/attendance")
def get_my_attendance(
    current_user: dict = Depends(get_current_employee), # ✅ Changed type hint to dict
    db: Session = Depends(get_db)
):
    # ✅ FIX: Changed 'current_user.employee_id' (Crash) to 'current_user["sub"]' (Correct)
    logs = db.query(Attendance).filter(
        Attendance.employee_id == current_user["sub"]
    ).order_by(Attendance.timestamp.desc()).limit(60).all()
    
    return logs

# ✅ 2. Add this new API Endpoint
@router.get("/api/history", response_model=List[AttendanceHistoryItem])
def get_my_history(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    # Get last 60 days of attendance
    history = db.query(Attendance).filter(
        Attendance.employee_id == user["sub"]
    ).order_by(Attendance.date_only.desc()).limit(60).all()
    
    results = []
    for record in history:
        results.append({
            "date": record.date_only.strftime("%Y-%m-%d"),
            "status": record.status,
            "check_in": record.check_in_time.strftime("%H:%M") if record.check_in_time else None,
            "check_out": record.check_out_time.strftime("%H:%M") if record.check_out_time else None,
        })
        
    return results

# In backend/app/routers/employee.py

@router.get("/api/office_config")
def get_office_config(
    db: Session = Depends(get_db), 
    user: dict = Depends(get_current_employee)
):
    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    
    if not company:
        return {
            "lat": 0.0, "lng": 0.0, "radius": 50,
            "start_time": "09:00", "end_time": "17:00" # Defaults
        }
        
    return {
        "lat": float(company.office_lat) if company.office_lat else 0.0,
        "lng": float(company.office_lng) if company.office_lng else 0.0,
        "radius": float(company.office_radius) if company.office_radius else 50.0,
        "start_time": company.work_start_time, # ✅ SEND START TIME
        "end_time": company.work_end_time      # ✅ SEND END TIME
    }