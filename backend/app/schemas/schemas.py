from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# --- 1. AUTH & SHARED ---
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    company_id: Optional[int] = None
    name: Optional[str] = None

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    company_id: Optional[int] = None

class LoginRequest(BaseModel):
    employee_id: str
    password: str
    device_id: str
    device_model: Optional[str] = "Unknown"

# --- 2. COMPANY MANAGEMENT ---
class CompanyCreate(BaseModel):
    name: str
    admin_username: str
    admin_pass: str
    plan: str = "basic"
    hardware_type: str = "ESP32"

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None 

# --- 3. EMPLOYEE MANAGEMENT ---
class EmployeeCreate(BaseModel):
    employee_id: str
    name: str
    password: str
    role: str = "Staff"

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None

class EmployeeResponse(BaseModel):
    id: int
    employee_id: str
    name: str
    role: str
    class Config:
        from_attributes = True

# --- 4. ATTENDANCE & TRACKING ---
# (Restored these for Mobile App)
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

class ManualAttendance(BaseModel):
    employee_id: str
    timestamp: datetime
    type: str
    notes: Optional[str] = "Manual Entry"

# --- 5. OFFICE & HARDWARE ---
class OfficeSettings(BaseModel):
    lat: str
    lng: str
    radius: str

class HardwareUpdate(BaseModel):
    device_type: str

class HardwareLog(BaseModel):
    employee_code: str
    time_iso: str

class EmergencyOpen(BaseModel):
    device_id: int
    reason: str

# [NEW] Schedule Settings
class ScheduleUpdate(BaseModel):
    start_time: str # "09:00"
    end_time: str   # "17:00"