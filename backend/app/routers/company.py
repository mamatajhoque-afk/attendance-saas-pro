from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from datetime import datetime
import pytz
from typing import List, Optional
from jose import jwt
from passlib.context import CryptContext

from app.db.models import Company, CompanyAdmin, Employee, Attendance, HardwareDevice, DoorEvent, ShortLeave, DepartmentSession, LocationLog
from app.db.database import get_db
from app.schemas.schemas import EmployeeCreate, EmployeeUpdate, ManualAttendance, ScheduleUpdate
from app.routers.auth import oauth2_scheme
from app.core.config import settings

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- HELPER: Verify Admin Token ---
def get_current_company_admin(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("role") != "company_admin": 
            raise HTTPException(status_code=403, detail="Not authorized")
        return payload  
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Credentials")

# --- 1. EMPLOYEE MANAGEMENT ---

@router.post("/company/employees")
def add_employee(
    payload: EmployeeCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_company_admin)
):
    existing = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id, 
        Employee.company_id == admin["company_id"]
    ).first()
    if existing:
        raise HTTPException(400, "Employee ID already exists")

    hashed_pw = pwd_context.hash(payload.password)
    new_emp = Employee(
        company_id=admin["company_id"],
        employee_id=payload.employee_id,
        name=payload.name,
        password_hash=hashed_pw,
        role=payload.role,
        status="active"
    )
    db.add(new_emp)
    db.commit()
    return {"status": "success", "message": "Employee added"}

@router.get("/company/employees")
def get_employees(db: Session = Depends(get_db), admin: dict = Depends(get_current_company_admin)):
    emps = db.query(Employee).filter(Employee.company_id == admin["company_id"]).all()
    return [
        {
            "id": e.id,
            "employee_id": e.employee_id,
            "name": e.name,
            "role": e.role,
            "status": e.status,
            "deleted_at": e.deleted_at.isoformat() if e.deleted_at else None
        } for e in emps
    ]

@router.put("/company/employees/{db_id}")
def update_employee(
    db_id: int, 
    payload: EmployeeUpdate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_company_admin)
):
    emp = db.query(Employee).filter(Employee.id == db_id, Employee.company_id == admin["company_id"]).first()
    if not emp: raise HTTPException(404, "Employee not found")
    
    if payload.name: emp.name = payload.name
    if payload.role: emp.role = payload.role
    if payload.status: emp.status = payload.status
    
    db.commit()
    return {"status": "success"}

@router.delete("/company/employees/{db_id}")
def delete_employee(db_id: int, db: Session = Depends(get_db), admin: dict = Depends(get_current_company_admin)):
    emp = db.query(Employee).filter(Employee.id == db_id, Employee.company_id == admin["company_id"]).first()
    if not emp: raise HTTPException(404, "Employee not found")
    
    emp.deleted_at = datetime.utcnow()
    emp.status = "deleted"
    db.commit()
    return {"status": "success"}

# --- 2. ATTENDANCE & TRACKING ---

@router.post("/company/attendance/manual")
def mark_manual_attendance(
    payload: ManualAttendance, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_company_admin)
):
    emp = db.query(Employee).filter(Employee.employee_id == payload.employee_id, Employee.company_id == admin["company_id"]).first()
    if not emp: raise HTTPException(404, "Employee not found")

    dt = payload.timestamp
    today = dt.date()
    
    att = db.query(Attendance).filter(Attendance.employee_id == emp.employee_id, Attendance.date_only == today).first()
    
    if payload.type == "check_in":
        if att: raise HTTPException(400, "Already checked in")
        new_att = Attendance(
            company_id=admin["company_id"],
            employee_id=emp.employee_id,
            timestamp=dt,
            date_only=today,
            status="Present", 
            check_in_time=dt,
            source="MANUAL_ADMIN",
            type="check_in"
        )
        db.add(new_att)
    else:
        if not att: raise HTTPException(400, "No check in found for today")
        att.check_out_time = dt
        att.type = "check_out"
        
    db.commit()
    return {"status": "success"}

@router.get("/company/employees/{emp_id}/attendance")
def get_employee_history(emp_id: str, db: Session = Depends(get_db), admin: dict = Depends(get_current_company_admin)):
    logs = db.query(Attendance).filter(
        Attendance.employee_id == emp_id,
        Attendance.company_id == admin["company_id"]
    ).order_by(Attendance.date_only.desc()).all()
    
    return [
        {
            "date_only": log.date_only.strftime("%Y-%m-%d"),
            "status": log.status,
            "timestamp": log.timestamp.isoformat(),
            "check_in_time": log.check_in_time.isoformat() if log.check_in_time else None,
            "check_out_time": log.check_out_time.isoformat() if log.check_out_time else None,
            "is_emergency_checkout": log.is_emergency_checkout,
            "emergency_checkout_reason": log.emergency_checkout_reason
        } for log in logs
    ]

# --- 3. DEVICES & DOORS ---

@router.get("/company/devices")
def get_devices(db: Session = Depends(get_db), admin: dict = Depends(get_current_company_admin)):
    devices = db.query(HardwareDevice).filter(HardwareDevice.company_id == admin["company_id"]).all()
    return [{"id": d.id, "device_uid": d.device_uid, "device_type": d.device_type} for d in devices]

@router.post("/company/devices/emergency-open")
def emergency_open_door(
    payload: dict,
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_company_admin)
):
    device_id = payload.get("device_id")
    reason = payload.get("reason", "Admin Emergency Open")
    
    db.add(DoorEvent(
        company_id=admin["company_id"],
        event_type="EMERGENCY_UNLOCK",
        trigger_reason=reason,
        device_id=str(device_id)
    ))
    db.commit()
    return {"status": "success"}

# --- 4. SETTINGS ---

@router.post("/company/settings/location")
def update_location(
    lat: str = Form(...), 
    lng: str = Form(...), 
    radius: str = Form(...),
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_company_admin)
):
    comp = db.query(Company).filter(Company.id == admin["company_id"]).first()
    comp.office_lat = lat
    comp.office_lng = lng
    comp.office_radius = radius
    db.commit()
    return {"status": "success"}

@router.post("/company/settings/schedule")
def update_schedule(
    payload: ScheduleUpdate,
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_company_admin)
):
    comp = db.query(Company).filter(Company.id == admin["company_id"]).first()
    comp.work_start_time = payload.start_time
    comp.work_end_time = payload.end_time
    
    # Extract extra fields if present
    extra_data = payload.dict()
    if "timezone" in extra_data:
        comp.timezone = extra_data["timezone"]
    if "super_late_threshold" in extra_data:
        comp.super_late_threshold = extra_data["super_late_threshold"]
        
    db.commit()
    return {"status": "success"}

# ✅ --- 5. FULL AUDIT ENDPOINTS (STEP 5) ---

@router.get("/company/audit/attendance")
def get_all_attendance(db: Session = Depends(get_db), admin: dict = Depends(get_current_company_admin)):
    logs = db.query(Attendance).filter(
        Attendance.company_id == admin["company_id"]
    ).order_by(Attendance.date_only.desc(), Attendance.timestamp.desc()).limit(500).all()
    
    return [
        {
            "id": log.id,
            "employee_id": log.employee_id,
            "date": log.date_only.strftime("%Y-%m-%d"),
            "status": log.status,
            "check_in_time": log.check_in_time.isoformat() if log.check_in_time else None,
            "door_unlock_time": log.door_unlock_time.isoformat() if getattr(log, 'door_unlock_time', None) else None,
            "check_out_time": log.check_out_time.isoformat() if log.check_out_time else None,
            "is_emergency_checkout": log.is_emergency_checkout,
            "emergency_checkout_reason": log.emergency_checkout_reason
        } for log in logs
    ]

@router.get("/company/audit/short_leaves")
def get_all_short_leaves(db: Session = Depends(get_db), admin: dict = Depends(get_current_company_admin)):
    leaves = db.query(ShortLeave).filter(
        ShortLeave.company_id == admin["company_id"]
    ).order_by(ShortLeave.exit_time.desc()).limit(500).all()
    
    return [
        {
            "id": l.id,
            "employee_id": l.employee_id,
            "date": l.date_only.strftime("%Y-%m-%d"),
            "reason": l.reason,
            "exit_time": l.exit_time.isoformat(),
            "return_time": l.return_time.isoformat() if l.return_time else None
        } for l in leaves
    ]

@router.get("/company/audit/door_events")
def get_all_door_events(db: Session = Depends(get_db), admin: dict = Depends(get_current_company_admin)):
    events = db.query(DoorEvent).filter(
        DoorEvent.company_id == admin["company_id"]
    ).order_by(DoorEvent.created_at.desc()).limit(500).all()
    
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "trigger_reason": e.trigger_reason,
            "device_id": e.device_id,
            "timestamp": e.created_at.isoformat()
        } for e in events
    ]