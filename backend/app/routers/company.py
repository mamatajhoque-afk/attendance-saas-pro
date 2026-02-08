from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel, validator
import re
from app.db.database import get_db
from app.db.models import Employee, Attendance, HardwareDevice, DoorEvent, LocationLog, Company, DepartmentSession
from app.core.security import get_password_hash
from app.routers.auth import get_current_active_admin
from app.schemas.schemas import (
    EmployeeCreate, EmployeeUpdate, ManualAttendance, 
    EmergencyOpen, TokenData, EmployeeResponse, TokenData, OfficeSettings
)

# ✅ ADD THIS CLASS (Schema)
class ScheduleUpdate(BaseModel):
    work_start_time: str
    work_end_time: str

    # Optional: Validates that time is in "HH:MM" format
    @validator("work_start_time", "work_end_time")
    def validate_time(cls, v):
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError("Time must be in HH:MM format")
        return v

router = APIRouter()

# 1. GET ALL EMPLOYEES
@router.get("/company/employees", response_model=list[EmployeeResponse])
def get_employees(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    return db.query(Employee).filter(
        Employee.company_id == current_user.company_id,
        Employee.deleted_at == None
    ).all()

# 2. ADD EMPLOYEE
@router.post("/company/employees")
def add_employee(
    payload: EmployeeCreate,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    exists = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id,
        Employee.company_id == current_user.company_id
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
        company_id=current_user.company_id,
        status="active"
    )
    db.add(new_emp)
    db.commit()
    return {"status": "success", "message": "Employee Added"}

# 3. UPDATE EMPLOYEE
@router.put("/company/employees/{emp_db_id}")
def update_employee(
    emp_db_id: int, 
    payload: EmployeeUpdate,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    emp = db.query(Employee).filter(
        Employee.id == emp_db_id,
        Employee.company_id == current_user.company_id
    ).first()
    
    if not emp: raise HTTPException(404, "Employee not found")

    if payload.status: emp.status = payload.status
    if payload.role: emp.role = payload.role
    if payload.name: emp.name = payload.name
    
    db.commit()
    return {"status": "success", "message": "Employee updated"}

# 4. DELETE EMPLOYEE
@router.delete("/company/employees/{emp_db_id}")
def delete_employee(
    emp_db_id: int,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    emp = db.query(Employee).filter(
        Employee.id == emp_db_id, 
        Employee.company_id == current_user.company_id
    ).first()
    
    if not emp: raise HTTPException(404, "Employee not found")
    
    emp.deleted_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Employee deleted"}

# 5. GET HISTORY (Fixed: Uses String ID now)
@router.get("/company/employees/{employee_id}/attendance")
def get_employee_history(
    employee_id: str, 
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.company_id == current_user.company_id
    ).first()
    
    if not employee: raise HTTPException(404, "Employee not found")
        
    # Fixed: Compare using the String ID ("EMP01") not the Integer ID
    return db.query(Attendance).filter(
        Attendance.employee_id == employee.employee_id 
    ).order_by(Attendance.timestamp.desc()).limit(50).all()

# 6. LIVE TRACKING (✅ FIXED)
@router.get("/company/tracking/live")
def get_live_tracking(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    # 1. Get all Marketing Employees in this company
    employees = db.query(Employee).filter(
        Employee.company_id == current_user.company_id,
        Employee.role.ilike("%Marketing%")  # Case-insensitive check
    ).all()
    
    live_data = []
    
    for emp in employees:
        # 2. Find the LATEST location by joining DepartmentSession
        # Logic: LocationLog -> DepartmentSession -> Employee
        last_loc = db.query(LocationLog).join(DepartmentSession).filter(
            DepartmentSession.employee_id == emp.id
        ).order_by(LocationLog.recorded_at.desc()).first() # ✅ Fixed: "recorded_at"
        
        if last_loc:
            live_data.append({
                "id": emp.employee_id,
                "name": emp.name,
                "role": emp.role,
                "lat": last_loc.latitude,
                "lon": last_loc.longitude,
                "last_seen": last_loc.recorded_at # ✅ Fixed: "recorded_at"
            })
            
    return live_data

# 7. MANUAL ATTENDANCE (✅ FIXED)
@router.post("/company/attendance/manual")
def mark_manual_attendance(
    payload: ManualAttendance,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    emp = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id,
        Employee.company_id == current_user.company_id
    ).first()
    
    if not emp: raise HTTPException(404, "Employee not found")
    
    record_time = payload.timestamp
    record_date = record_time.date()
    
    # 🕒 LATE CHECK LOGIC
    status = "Present"
    if payload.type == 'check_in':
        # Get Company Schedule
        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        if company and company.work_start_time:
            # Parse times
            work_start = datetime.strptime(company.work_start_time, "%H:%M").time()
            check_in_time = record_time.time()
            
            # If checked in AFTER start time, mark Late
            if check_in_time > work_start:
                status = "Late"

    new_log = Attendance(
        company_id=current_user.company_id,
        employee_id=emp.employee_id,
        timestamp=record_time,
        date_only=record_date,
        status=status, # ✅ Now saves "Late" or "Present"
        type=payload.type,
        check_in_time=record_time if payload.type == 'check_in' else None,
        check_out_time=record_time if payload.type == 'check_out' else None,
        method="MANUAL_ADMIN",
        image_url=payload.notes 
    )
    db.add(new_log)
    db.commit()
    return {"status": "success", "message": f"Attendance marked ({status})"}

# 8. EMERGENCY OPEN
@router.post("/company/devices/emergency-open")
def emergency_open(
    payload: EmergencyOpen,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    device = db.query(HardwareDevice).filter(
        HardwareDevice.id == payload.device_id,
        HardwareDevice.company_id == current_user.company_id
    ).first()
    
    if not device: raise HTTPException(404, "Device not found")
    
    db.add(DoorEvent(
        device_id=device.id,
        event_type="EMERGENCY_OPEN",
        description=f"Opened by Admin: {payload.reason}",
        timestamp=datetime.utcnow()
    ))
    db.commit()
    return {"status": "success", "message": "Door Unlock Command Sent"}

# 9. GET DEVICES
@router.get("/company/devices")
def get_company_devices(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    return db.query(HardwareDevice).filter(
        HardwareDevice.company_id == current_user.company_id
    ).all()

# 10. UPDATE OFFICE GEOFENCE
@router.post("/company/settings/location")
def update_settings(
    payload: OfficeSettings,  # 👈 Expects JSON body now
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company: raise HTTPException(404, detail="Company not found")
    
    company.office_lat = payload.lat
    company.office_lng = payload.lng
    company.office_radius = payload.radius
    db.commit()
    return {"status": "success", "message": "Office Location Updated"}

# 11. [NEW] UPDATE SCHEDULE
@router.post("/company/settings/schedule")
def update_schedule(
    payload: ScheduleUpdate,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company: raise HTTPException(404, "Company not found")
    
# ✅ FIX: Use the correct field names from your Pydantic model
    company.work_start_time = payload.work_start_time  # Was payload.start_time (Wrong)
    company.work_end_time = payload.work_end_time      # Was payload.end_time (Wrong)
    db.commit()
    return {"status": "success", "message": "Work Schedule Updated"}

