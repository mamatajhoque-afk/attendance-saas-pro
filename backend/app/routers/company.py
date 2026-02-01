from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from sqlalchemy import extract
from datetime import datetime

from app.db.database import get_db
from app.db.models import Employee, Company, Attendance, CompanyAdmin
from app.core.security import get_password_hash
from app.schemas.schemas import EmployeeCreate, OfficeSettings, ManualAttendance, EmployeeResponse
from app.routers.auth import oauth2_scheme  # We need to verify tokens
from jose import jwt
from app.core.config import settings

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