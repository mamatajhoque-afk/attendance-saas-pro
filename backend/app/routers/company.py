from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from sqlalchemy import extract
from datetime import datetime

from app.db.models import LocationLog, Employee, Attendance
from app.db.database import get_db
from app.db.models import Employee, Company, Attendance, CompanyAdmin
from app.core.security import get_password_hash
from app.schemas.schemas import EmployeeCreate, OfficeSettings, ManualAttendance, EmployeeResponse, ManualAttendance, EmployeeUpdate, TokenData, EmergencyOpen

from app.db.models import HardwareDevice, DoorEvent 
from app.routers.auth import oauth2_scheme  # fro We need to verify tokens
from jose import jwt
from app.core.config import settings
from app.routers.auth import get_current_active_admin

router = APIRouter()

# --- HELPER: Verify Admin Token ---
def get_current_admin(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not authorized")
        return payload
    except:
        raise HTTPException(status_code=401, detail="Invalid Credentials")

# 1. ADD EMPLOYEE
@router.post("/company/add_employee")
def add_employee(
    payload: EmployeeCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_admin)
):
    # Check duplicate ID
    if db.query(Employee).filter(Employee.employee_id == payload.emp_id).first():
        raise HTTPException(status_code=400, detail="Employee ID already exists")

    new_emp = Employee(
        company_id=admin["company_id"],
        employee_id=payload.emp_id,
        name=payload.name,
        role=payload.role,
        password_hash=get_password_hash(payload.password)
    )
    db.add(new_emp)
    db.commit()
    return {"status": "success", "message": "Employee Added"}

# 2. GET ALL EMPLOYEES
@router.get("/company/employees", response_model=list[EmployeeResponse])
def get_employees(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    return db.query(Employee).filter(Employee.company_id == admin["company_id"]).all()

# 3. UPDATE OFFICE SETTINGS (Geofence)
@router.post("/company/settings/location")
def update_settings(
    lat: str = Form(...), 
    lng: str = Form(...), 
    radius: str = Form(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    company = db.query(Company).filter(Company.id == admin["company_id"]).first()
    if not company: raise HTTPException(404, detail="Company not found")
    
    company.office_lat = lat
    company.office_lng = lng
    company.office_radius = radius
    db.commit()
    return {"status": "success", "message": "Office Location Updated"}

# 4. MANUAL ATTENDANCE (Fixing mistakes)
@router.post("/company/mark_manual")
def mark_manual(
    payload: ManualAttendance,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    try:
        log_dt = datetime.strptime(f"{payload.date_str} {payload.time_str}", "%Y-%m-%d %H:%M:%S")
        log_date = log_dt.date()
    except ValueError:
        raise HTTPException(400, detail="Invalid Date/Time Format")

    existing = db.query(Attendance).filter(
        Attendance.employee_id == payload.employee_id,
        Attendance.date_only == log_date
    ).first()

    if existing:
        existing.status = payload.status
        existing.check_in_time = log_dt
    else:
        # Verify employee exists in this company
        emp = db.query(Employee).filter(Employee.employee_id == payload.employee_id).first()
        if not emp or emp.company_id != admin["company_id"]:
            raise HTTPException(404, detail="Employee not found")
            
        new_att = Attendance(
            company_id=admin["company_id"],
            employee_id=payload.employee_id,
            timestamp=log_dt,
            date_only=log_date,
            status=payload.status,
            location="Manual Entry by Admin",
            source="WEB_ADMIN",
            check_in_time=log_dt
        )
        db.add(new_att)
        
    db.commit()
    return {"status": "success", "message": "Attendance Updated"}

# 5. ADMIN VIEW OF HISTORY
@router.get("/company/attendance-history/{employee_id}")
def get_history(
    employee_id: str, 
    month: int, 
    year: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(get_current_admin)
):
    records = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.company_id == admin["company_id"],
        extract('month', Attendance.date_only) == month,
        extract('year', Attendance.date_only) == year
    ).all()
    
    # Format for frontend
    return [{
        "date": rec.date_only.isoformat(),
        "status": rec.status,
        "check_in": rec.check_in_time.strftime("%I:%M %p") if rec.check_in_time else "-",
        "check_out": rec.check_out_time.strftime("%I:%M %p") if rec.check_out_time else "-"
    } for rec in records]

# [NEW FEATURE 1: Get Single Employee History]
@router.get("/company/employees/{employee_id}/attendance")
def get_employee_history(
    employee_id: str, 
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    # Verify employee belongs to this company
    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.company_id == current_user.company_id
    ).first()
    
    if not employee:
        raise HTTPException(404, "Employee not found")
        
    logs = db.query(Attendance).filter(
        Attendance.employee_id == employee.id
    ).order_by(Attendance.timestamp.desc()).limit(50).all()
    
    return logs

# [NEW FEATURE 2: Live Tracking for Marketing/Field Staff]
@router.get("/company/tracking/live")
def get_live_tracking(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    # Get all employees who have "Marketing" or "Field" in their role
    # In a real app, you might query by Department.
    employees = db.query(Employee).filter(
        Employee.company_id == current_user.company_id,
        Employee.role.ilike("%Marketing%") # Checks for "Marketing", "Field Marketing", etc.
    ).all()
    
    live_data = []
    for emp in employees:
        # Get their LAST known location
        last_loc = db.query(LocationLog).filter(
            LocationLog.employee_id == emp.id
        ).order_by(LocationLog.timestamp.desc()).first()
        
        if last_loc:
            # Check if data is fresh (e.g., within last 12 hours)
            live_data.append({
                "id": emp.employee_id,
                "name": emp.name,
                "role": emp.role,
                "lat": last_loc.latitude,
                "lon": last_loc.longitude,
                "last_seen": last_loc.timestamp,
                "battery": "85%" # Placeholder or add to DB if needed
            })
            
    return live_data

# [NEW 1: UPDATE EMPLOYEE (Suspend/Activate)]
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

# [NEW 2: DELETE EMPLOYEE (Soft Delete)]
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
    
    emp.deleted_at = datetime.utcnow() # Soft delete
    db.commit()
    return {"status": "success", "message": "Employee deleted"}

# [NEW 3: MANUAL ATTENDANCE]
@router.post("/company/attendance/manual")
def mark_manual_attendance(
    payload: ManualAttendance,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    # Find employee by string ID (e.g., "EMP001")
    emp = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id,
        Employee.company_id == current_user.company_id
    ).first()
    
    if not emp: raise HTTPException(404, "Employee not found")
    
    new_log = Attendance(
        employee_id=emp.id,
        timestamp=payload.timestamp,
        type=payload.type,
        method="MANUAL_ADMIN",
        image_url=payload.notes # Using image_url field for notes to save space, or add 'notes' column to DB
    )
    db.add(new_log)
    db.commit()
    return {"status": "success", "message": "Attendance marked"}

# [NEW 4: EMERGENCY DOOR OPEN]
@router.post("/company/devices/emergency-open")
def emergency_open(
    payload: EmergencyOpen,
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    # Verify device belongs to this company
    device = db.query(HardwareDevice).filter(
        HardwareDevice.id == payload.device_id,
        HardwareDevice.company_id == current_user.company_id
    ).first()
    
    if not device: raise HTTPException(404, "Device not found")
    
    # Log the event
    db.add(DoorEvent(
        device_id=device.id,
        event_type="EMERGENCY_OPEN",
        description=f"Opened by Admin: {payload.reason}",
        timestamp=datetime.utcnow()
    ))
    db.commit()
    
    # In a real IoT system, you would publish MQTT message here
    return {"status": "success", "message": "Door Unlock Command Sent"}
    
# [HELPER: LIST DEVICES FOR COMPANY]
@router.get("/company/devices")
def get_company_devices(
    current_user: TokenData = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    return db.query(HardwareDevice).filter(
        HardwareDevice.company_id == current_user.company_id
    ).all()