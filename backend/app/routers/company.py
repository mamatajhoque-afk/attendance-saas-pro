from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from datetime import datetime

from app.db.database import get_db
from app.db.models import Employee, Attendance, HardwareDevice, DoorEvent, LocationLog, Company
from app.core.security import get_password_hash
from app.routers.auth import get_current_active_admin
from app.schemas.schemas import (
    EmployeeCreate, EmployeeUpdate, ManualAttendance, 
    EmergencyOpen, TokenData, EmployeeResponse
)

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

# 6. LIVE TRACKING
@router.get("/company/tracking/live")
def get_live_tracking(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    employees = db.query(Employee).filter(
        Employee.company_id == current_user.company_id,
        Employee.role.ilike("%Marketing%")
    ).all()
    
    live_data = []
    for emp in employees:
        last_loc = db.query(LocationLog).filter(
            LocationLog.employee_id == emp.id
        ).order_by(LocationLog.timestamp.desc()).first()
        
        if last_loc:
            live_data.append({
                "id": emp.employee_id,
                "name": emp.name,
                "role": emp.role,
                "lat": last_loc.latitude,
                "lon": last_loc.longitude,
                "last_seen": last_loc.timestamp
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
    
    # Calculate fields
    record_time = payload.timestamp
    record_date = record_time.date()
    
    new_log = Attendance(
        company_id=current_user.company_id, # ✅ Added
        employee_id=emp.employee_id,        # ✅ Fixed (String ID)
        timestamp=record_time,
        date_only=record_date,              # ✅ Added
        status="Present",
        type=payload.type,                  # 'check_in' or 'check_out'
        check_in_time=record_time if payload.type == 'check_in' else None,
        check_out_time=record_time if payload.type == 'check_out' else None,
        method="MANUAL_ADMIN",
        image_url=payload.notes 
    )
    db.add(new_log)
    db.commit()
    return {"status": "success", "message": "Attendance marked"}

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
    lat: str = Form(...), 
    lng: str = Form(...), 
    radius: str = Form(...),
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company: raise HTTPException(404, detail="Company not found")
    
    company.office_lat = lat
    company.office_lng = lng
    company.office_radius = radius
    db.commit()
    return {"status": "success", "message": "Office Location Updated"}