from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel, validator
import re

from app.db.database import get_db
from app.db.models import Employee, Attendance, HardwareDevice, DoorEvent, LocationLog, Company, DepartmentSession, ShortLeave, CompanyAdmin
from app.core.security import get_password_hash
from app.routers.auth import get_current_active_admin
from app.schemas.schemas import (
    EmployeeCreate, EmployeeUpdate, ManualAttendance, 
    EmergencyOpen, TokenData, OfficeSettings
)

# ✅ UPDATED: Include Step 0 and Step 4 timezone/threshold fields
class ScheduleUpdate(BaseModel):
    work_start_time: str
    work_end_time: str
    timezone: str = "UTC"
    super_late_threshold: int = 30

    @validator("work_start_time", "work_end_time")
    def validate_time(cls, v):
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError("Time must be in HH:MM format")
        return v

router = APIRouter()

# ==========================================
# 🛡️ SAFETY NET: JWT PAYLOAD FALLBACK
# ==========================================
def get_safe_company_id(current_user: TokenData, db: Session) -> int:
    """Ensures we always have a company_id, even if the token generation missed it."""
    if current_user.company_id:
        return current_user.company_id
        
    admin = db.query(CompanyAdmin).filter(CompanyAdmin.username == current_user.username).first()
    if not admin:
        raise HTTPException(401, "Admin not found in Database")
    return admin.company_id


# ==========================================
# 1. EMPLOYEE MANAGEMENT
# ==========================================

@router.get("/company/employees")
def get_employees(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    
    emps = db.query(Employee).filter(
        Employee.company_id == company_id,
        Employee.deleted_at.is_(None)
    ).all()
    
    # ✅ FIX: Returning dict ensures ALL fields (status, deleted_at) reach React properly
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

@router.post("/company/employees")
def add_employee(
    payload: EmployeeCreate,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    
    exists = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id,
        Employee.company_id == company_id
    ).first()
    
    if exists:
        if exists.deleted_at:
            exists.deleted_at = None
            exists.name = payload.name
            exists.password_hash = get_password_hash(payload.password)
            exists.role = payload.role
            exists.status = "active"
            db.commit()
            return {"status": "success", "message": "Employee Restored"}
        raise HTTPException(400, "Employee ID already exists")

    new_emp = Employee(
        employee_id=payload.employee_id,
        name=payload.name,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        company_id=company_id,
        status="active"
    )
    db.add(new_emp)
    db.commit()
    return {"status": "success", "message": "Employee Added"}

@router.put("/company/employees/{emp_db_id}")
def update_employee(
    emp_db_id: int, 
    payload: EmployeeUpdate,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    emp = db.query(Employee).filter(Employee.id == emp_db_id, Employee.company_id == company_id).first()
    
    if not emp: raise HTTPException(404, "Employee not found")

    if payload.status: emp.status = payload.status
    if payload.role: emp.role = payload.role
    if payload.name: emp.name = payload.name
    
    db.commit()
    return {"status": "success", "message": "Employee updated"}

@router.delete("/company/employees/{emp_db_id}")
def delete_employee(
    emp_db_id: int,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    emp = db.query(Employee).filter(Employee.id == emp_db_id, Employee.company_id == company_id).first()
    
    if not emp: raise HTTPException(404, "Employee not found")
    
    emp.deleted_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Employee deleted"}


# ==========================================
# 2. ATTENDANCE & TRACKING
# ==========================================

@router.get("/company/employees/{employee_id}/attendance")
def get_employee_history(
    employee_id: str, 
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    
    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.company_id == company_id
    ).first()
    
    if not employee: raise HTTPException(404, "Employee not found")
        
    logs = db.query(Attendance).filter(
        Attendance.employee_id == employee.employee_id 
    ).order_by(Attendance.timestamp.desc()).limit(50).all()

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

@router.get("/company/tracking/live")
def get_live_tracking(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    employees = db.query(Employee).filter(
        Employee.company_id == company_id,
        Employee.role.ilike("%Marketing%") 
    ).all()
    
    live_data = []
    for emp in employees:
        last_loc = db.query(LocationLog).join(DepartmentSession).filter(
            DepartmentSession.employee_id == emp.id
        ).order_by(LocationLog.recorded_at.desc()).first() 
        
        if last_loc:
            live_data.append({
                "id": emp.employee_id,
                "name": emp.name,
                "role": emp.role,
                "lat": last_loc.latitude,
                "lon": last_loc.longitude,
                "last_seen": last_loc.recorded_at 
            })
            
    return live_data

@router.post("/company/attendance/manual")
def mark_manual_attendance(
    payload: ManualAttendance,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    emp = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id,
        Employee.company_id == company_id
    ).first()
    
    if not emp: raise HTTPException(404, "Employee not found")
    
    record_time = payload.timestamp
    record_date = record_time.date()
    status = "Present"

    if payload.type == 'check_in':
        company = db.query(Company).filter(Company.id == company_id).first()
        if company and company.work_start_time:
            work_start = datetime.strptime(company.work_start_time, "%H:%M").time()
            if record_time.time() > work_start:
                status = "Late"

    new_log = Attendance(
        company_id=company_id,
        employee_id=emp.employee_id,
        timestamp=record_time,
        date_only=record_date,
        status=status, 
        type=payload.type,
        check_in_time=record_time if payload.type == 'check_in' else None,
        check_out_time=record_time if payload.type == 'check_out' else None,
        method="MANUAL_ADMIN",
        image_url=payload.notes 
    )
    db.add(new_log)
    db.commit()
    return {"status": "success", "message": f"Attendance marked ({status})"}


# ==========================================
# 3. DEVICES & SETTINGS
# ==========================================

@router.get("/company/devices")
def get_company_devices(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    return db.query(HardwareDevice).filter(HardwareDevice.company_id == company_id).all()

@router.post("/company/devices/emergency-open")
def emergency_open(
    payload: EmergencyOpen,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    device = db.query(HardwareDevice).filter(
        HardwareDevice.id == payload.device_id, HardwareDevice.company_id == company_id
    ).first()
    
    if not device: raise HTTPException(404, "Device not found")
    
    db.add(DoorEvent(
        company_id=company_id,
        device_id=str(device.id),
        event_type="EMERGENCY_OPEN",
        trigger_reason=f"Opened by Admin: {payload.reason}",
        created_at=datetime.utcnow()
    ))
    db.commit()
    return {"status": "success", "message": "Door Unlock Command Sent"}

@router.post("/company/settings/location")
def update_settings(
    payload: OfficeSettings, 
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company: raise HTTPException(404, detail="Company not found")
    
    company.office_lat = payload.lat
    company.office_lng = payload.lng
    company.office_radius = payload.radius
    db.commit()
    return {"status": "success", "message": "Office Location Updated"}

@router.post("/company/settings/schedule")
def update_schedule(
    payload: ScheduleUpdate,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company_id = get_safe_company_id(current_user, db)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company: raise HTTPException(404, "Company not found")
    
    company.work_start_time = payload.work_start_time 
    company.work_end_time = payload.work_end_time     
    company.timezone = payload.timezone
    company.super_late_threshold = payload.super_late_threshold
    
    db.commit()
    return {"status": "success", "message": "Work Schedule Updated"}


# ==========================================
# ✅ 4. FULL AUDIT ENDPOINTS (STEP 5 INCLUDED)
# ==========================================

@router.get("/company/audit/attendance")
def get_all_attendance(db: Session = Depends(get_db), current_user: TokenData = Depends(get_current_active_admin)):
    company_id = get_safe_company_id(current_user, db)
    logs = db.query(Attendance).filter(
        Attendance.company_id == company_id
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
            "is_emergency_checkout": getattr(log, 'is_emergency_checkout', False),
            "emergency_checkout_reason": getattr(log, 'emergency_checkout_reason', None)
        } for log in logs
    ]

@router.get("/company/audit/short_leaves")
def get_all_short_leaves(db: Session = Depends(get_db), current_user: TokenData = Depends(get_current_active_admin)):
    company_id = get_safe_company_id(current_user, db)
    leaves = db.query(ShortLeave).filter(
        ShortLeave.company_id == company_id
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
def get_all_door_events(db: Session = Depends(get_db), current_user: TokenData = Depends(get_current_active_admin)):
    company_id = get_safe_company_id(current_user, db)
    events = db.query(DoorEvent).filter(
        DoorEvent.company_id == company_id
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