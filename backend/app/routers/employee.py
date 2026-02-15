from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import pytz
from typing import List, Optional
from pydantic import BaseModel
from jose import jwt

from app.db.models import Company, Employee, Attendance, DepartmentSession, LocationLog, ShortLeave
from app.db.database import get_db
# ✅ Added SubmitExcuse
from app.schemas.schemas import AttendanceMark, TrackingStart, LocationUpdate, EmergencyCheckout, ShortLeaveRequest, SubmitExcuse
from app.routers.auth import oauth2_scheme
from app.core.config import settings

router = APIRouter()

# --- HELPER: Get Company Local Time ---
def get_local_now(company: Company) -> datetime:
    tz_str = company.timezone if company and getattr(company, 'timezone', None) else "UTC"
    try:
        tz = pytz.timezone(tz_str)
    except Exception:
        tz = pytz.UTC
    return datetime.now(tz).replace(tzinfo=None)

def get_current_employee(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("role") != "employee": 
            raise HTTPException(status_code=403, detail="Not authorized")
        return payload  
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    
# --- SCHEMAS ---
class AttendanceHistoryItem(BaseModel):
    date: str
    status: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    check_in_time: Optional[str] = None
    door_unlock_time: Optional[str] = None
    check_out_time: Optional[str] = None
    late_reason: Optional[str] = None  # ✅ Added late_reason to history

class EmployeeActionPayload(BaseModel):
    employee_id: str


@router.get("/api/me")
def get_my_profile(db: Session = Depends(get_db), user: dict = Depends(get_current_employee)):
    emp = db.query(Employee).filter(Employee.employee_id == user["sub"]).first()
    if not emp: 
        raise HTTPException(404, "User not found")
    
    company = db.query(Company).filter(Company.id == emp.company_id).first()
    now = get_local_now(company)
    today = now.date()
    
    att = db.query(Attendance).filter(
        Attendance.employee_id == emp.employee_id, 
        Attendance.date_only == today
    ).first()
    
    return {
        "id": emp.employee_id,
        "name": emp.name,
        "role": emp.role,
        "company_id": emp.company_id,
        "today": {
            "status": att.status if att else "Absent",
            "checkIn": att.check_in_time.isoformat() if att and att.check_in_time else None,
            "checkOut": att.check_out_time.isoformat() if att and att.check_out_time else None,
            "lateReason": att.late_reason if att and att.late_reason else None
        }
    }

@router.post("/api/mark_attendance")
def mark_attendance(
    payload: AttendanceMark,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee) 
):
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Cannot mark attendance for another user")

    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    now = get_local_now(company)
    today = now.date()
        
    existing = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == today
    ).first()
    
    if not existing:
        status = "Present"
        if company and company.work_start_time:
            try:
                start_dt = datetime.strptime(company.work_start_time, "%H:%M").time()
                start_datetime = datetime.combine(today, start_dt)
                
                threshold_minutes = getattr(company, 'super_late_threshold', 30)
                super_late_datetime = start_datetime + timedelta(minutes=threshold_minutes)
                
                if now > super_late_datetime:
                    status = "Super Late"
                elif now.time() > start_dt:
                    status = "Late"
            except Exception:
                pass 

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
        db.commit()
        return {"status": "success", "message": f"Checked In ({status})"}
    
    return {"status": "error", "message": "Already checked in today"}

@router.post("/api/unlock_door")
def unlock_door(
    payload: EmployeeActionPayload,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Not authorized")

    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    now = get_local_now(company)
    today = now.date()

    att = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == today
    ).first()

    if not att:
        return {"status": "error", "message": "Must check in first"}
        
    att.door_unlock_time = now
    
    if company and company.work_end_time:
        try:
            end_time_dt = datetime.strptime(company.work_end_time, "%H:%M").time()
            enabled_dt = datetime.combine(today, end_time_dt)
            att.check_out_enabled_time = enabled_dt
        except Exception:
            pass

    db.commit()
    return {"status": "success", "message": "Door unlocked"}

@router.post("/api/mark_checkout")
def mark_checkout(
    payload: EmployeeActionPayload,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Not authorized")

    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    now = get_local_now(company)
    today = now.date()

    att = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == today
    ).first()

    if not att:
        return {"status": "error", "message": "Must check in first"}

    if company and company.work_end_time:
        try:
            end_time_dt = datetime.strptime(company.work_end_time, "%H:%M").time()
            if now.time() < end_time_dt:
                return {"status": "error", "message": f"Cannot check out before {company.work_end_time}"}
        except Exception:
            pass

    att.check_out_time = now
    att.type = "check_out"
    db.commit()
    return {"status": "success", "message": "Checked out successfully"}

@router.post("/api/emergency_checkout")
def emergency_checkout(
    payload: EmergencyCheckout,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Not authorized")

    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    now = get_local_now(company)
    today = now.date()

    att = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == today
    ).first()

    if not att:
        return {"status": "error", "message": "Must check in first"}

    att.check_out_time = now
    att.type = "check_out"
    att.is_emergency_checkout = True
    att.emergency_checkout_reason = payload.reason
    
    db.commit()
    return {"status": "success", "message": "Emergency checkout recorded"}

# ✅ LATE EXCUSE ENDPOINT (Improvement 1)
@router.post("/api/submit_excuse")
def submit_excuse(
    payload: SubmitExcuse,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    now = get_local_now(company)
    today = now.date()
    
    att = db.query(Attendance).filter(
        Attendance.employee_id == user["sub"],
        Attendance.date_only == today
    ).first()
    
    if not att:
        raise HTTPException(404, "No attendance record found for today")
        
    att.late_reason = payload.reason
    db.commit()
    return {"status": "success", "message": "Late reason submitted"}

@router.post("/api/short_leave/request")
def request_short_leave(
    payload: ShortLeaveRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Not authorized")

    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    now = get_local_now(company)
    today = now.date()

    att = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == today
    ).first()
    if not att:
        return {"status": "error", "message": "Must check in for the day first"}

    active_leave = db.query(ShortLeave).filter(
        ShortLeave.employee_id == payload.employee_id,
        ShortLeave.date_only == today,
        ShortLeave.return_time == None
    ).first()
    if active_leave:
        return {"status": "error", "message": "You are already on an active short leave"}

    new_leave = ShortLeave(
        company_id=user["company_id"],
        employee_id=payload.employee_id,
        date_only=today,
        reason=payload.reason,
        exit_time=now
    )
    db.add(new_leave)
    db.commit()
    return {"status": "success", "message": "Short leave door unlocked for exit"}

@router.post("/api/short_leave/return")
def return_short_leave(
    payload: EmployeeActionPayload,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    if payload.employee_id != user["sub"]:
        raise HTTPException(403, "Not authorized")

    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    now = get_local_now(company)
    today = now.date()

    active_leave = db.query(ShortLeave).filter(
        ShortLeave.employee_id == payload.employee_id,
        ShortLeave.date_only == today,
        ShortLeave.return_time == None
    ).first()

    if not active_leave:
        return {"status": "error", "message": "No active short leave found to return from"}

    active_leave.return_time = now
    db.commit()
    return {"status": "success", "message": "Door unlocked for entry. Welcome back!"}

@router.get("/api/short_leave/today")
def get_today_short_leaves(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    today = get_local_now(company).date()
    
    leaves = db.query(ShortLeave).filter(
        ShortLeave.employee_id == user["sub"],
        ShortLeave.date_only == today
    ).order_by(ShortLeave.exit_time.asc()).all()
    
    return [
        {
            "id": l.id,
            "reason": l.reason,
            "exit_time": l.exit_time.isoformat(),
            "return_time": l.return_time.isoformat() if l.return_time else None
        } for l in leaves
    ]

@router.post("/api/tracking/start")
def start_tracking(
    payload: TrackingStart,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
    emp = db.query(Employee).filter(Employee.employee_id == payload.employee_id).first()
    company = db.query(Company).filter(Company.id == emp.company_id).first()
    now = get_local_now(company)
    
    db.query(DepartmentSession).filter(
        DepartmentSession.employee_id == emp.id, 
        DepartmentSession.active == True
    ).update({"active": False, "end_time": now})
    
    sess = DepartmentSession(
        employee_id=emp.id, 
        company_id=emp.company_id, 
        department=payload.department, 
        start_time=now, 
        active=True
    )
    db.add(sess)
    db.commit()
    return {"status": "success", "session_id": sess.id}

@router.post("/api/tracking/update")
def update_location(payload: LocationUpdate, db: Session = Depends(get_db)):
    session = db.query(DepartmentSession).filter(DepartmentSession.id == payload.session_id).first()
    company = db.query(Company).filter(Company.id == session.company_id).first() if session else None
    now = get_local_now(company)

    db.add(LocationLog(
        session_id=payload.session_id,
        latitude=payload.lat,
        longitude=payload.lng,
        status=payload.status,
        recorded_at=now
    ))
    db.commit()
    return {"status": "success"}

@router.get("/api/history", response_model=List[AttendanceHistoryItem])
def get_my_history(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_employee)
):
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
            "check_in_time": record.check_in_time.isoformat() if record.check_in_time else None,
            "door_unlock_time": record.door_unlock_time.isoformat() if getattr(record, 'door_unlock_time', None) else None,
            "check_out_time": record.check_out_time.isoformat() if record.check_out_time else None,
            "late_reason": getattr(record, 'late_reason', None) # ✅ Expose late_reason
        })
        
    return results

@router.get("/api/office_config")
def get_office_config(
    db: Session = Depends(get_db), 
    user: dict = Depends(get_current_employee)
):
    company = db.query(Company).filter(Company.id == user["company_id"]).first()
    
    if not company:
        return {
            "lat": 0.0, "lng": 0.0, "radius": 50,
            "start_time": "09:00", "end_time": "17:00",
            "timezone": "UTC"
        }
        
    return {
        "lat": float(company.office_lat) if company.office_lat else 0.0,
        "lng": float(company.office_lng) if company.office_lng else 0.0,
        "radius": float(company.office_radius) if company.office_radius else 50.0,
        "start_time": company.work_start_time, 
        "end_time": company.work_end_time,
        "timezone": getattr(company, 'timezone', 'UTC'),
        "super_late_threshold": getattr(company, 'super_late_threshold', 30)
    }

@router.get("/api/me/attendance")
def get_my_attendance(
    current_user: dict = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    logs = db.query(Attendance).filter(
        Attendance.employee_id == current_user["sub"]
    ).order_by(Attendance.timestamp.desc()).limit(60).all()
    return logs