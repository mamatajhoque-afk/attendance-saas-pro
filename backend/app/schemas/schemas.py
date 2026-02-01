from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, date

# --- 1. AUTH & LOGIN SCHEMAS ---

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    company_id: Optional[int] = None
    name: Optional[str] = None

class LoginRequest(BaseModel):
    """Used for Employee Mobile Login"""
    employee_id: str
    password: str
    device_id: str

# --- 2. COMPANY ADMIN SCHEMAS ---

class CompanyCreate(BaseModel):
    name: str
    admin_username: str
    admin_pass: str
    plan: str = "basic"
    hardware_type: str = "ESP32"

class EmployeeCreate(BaseModel):
    emp_id: str
    name: str
    password: str
    role: str = "normal"  # 'normal' or 'marketing'

class OfficeSettings(BaseModel):
    lat: str
    lng: str
    radius: str

class ManualAttendance(BaseModel):
    employee_id: str
    status: str
    date_str: str  # YYYY-MM-DD
    time_str: str  # HH:MM:SS

# --- 3. ATTENDANCE & TRACKING SCHEMAS ---

class AttendanceMark(BaseModel):
    employee_id: str
    location: str

class TrackingStart(BaseModel):
    employee_id: str
    department: str

class LocationUpdate(BaseModel):
    session_id: int
    lat: float
    lng: float
    status: str

# --- 4. HARDWARE / IOT SCHEMAS ---

class HardwareLog(BaseModel):
    """Data sent by Raspberry Pi or ESP32"""
    employee_code: str
    time_iso: str

class EmergencyOpen(BaseModel):
    company_id: int
    device_id: str
    reason: str

# --- 5. RESPONSE SCHEMAS (For reading data) ---

class EmployeeResponse(BaseModel):
    id: int
    employee_id: str
    name: str
    role: str
    
    class Config:
        from_attributes = True

class AttendanceHistory(BaseModel):
    date: str
    status: str
    check_in: str
    check_out: str

# [For edit hardware type ]
class HardwareUpdate(BaseModel):
    device_type: str

# [Edit and suspend company]
class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None # 'active', 'suspended'

# [NEW] For Suspending/Updating Employees
class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None # 'active' or 'suspended'

# [NEW] For Manual Attendance
class ManualAttendance(BaseModel):
    employee_id: str
    timestamp: datetime
    type: str # 'check_in' or 'check_out'
    notes: Optional[str] = "Manual Entry"

# [NEW] For Emergency Door Open
class EmergencyOpen(BaseModel):
    device_id: int
    reason: str