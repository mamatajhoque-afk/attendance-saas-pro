from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Boolean, Float
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base  # Importing Base from the file we made previously

# --- 1. ADMIN & TENANCY MODELS ---

class SuperAdmin(Base):
    __tablename__ = "saas_admins"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    password = Column(String) 

class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    plan = Column(String, default="basic")      
    status = Column(String, default="active")   
    valid_until = Column(Date)
    deleted_at = Column(DateTime, nullable=True) # Soft Delete logic

    # Geofencing Settings
    office_lat = Column(String, default="23.8103")
    office_lng = Column(String, default="90.4125")
    office_radius = Column(String, default="50")
    
    # Relationships
    admins = relationship("CompanyAdmin", back_populates="company")
    employees = relationship("Employee", back_populates="company")
    sessions = relationship("DepartmentSession", back_populates="company")

class CompanyAdmin(Base):
    __tablename__ = "company_admins"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    username = Column(String, unique=True)
    password = Column(String)
    
    company = relationship("Company", back_populates="admins")

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id")) 
    
    employee_id = Column(String, unique=True, index=True) 
    name = Column(String)
    password_hash = Column(String) 
    last_login = Column(DateTime)
    deleted_at = Column(DateTime, nullable=True)
    
    # Security Features
    device_id = Column(String, nullable=True) 
    role = Column(String, default="normal") # 'normal' or 'marketing'
    
    company = relationship("Company", back_populates="employees")
    tracking_sessions = relationship("DepartmentSession", back_populates="employee")

# --- 2. GPS TRACKING MODELS ---

class DepartmentSession(Base):
    __tablename__ = "department_mode_sessions"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    company_id = Column(Integer, ForeignKey("companies.id"))
    
    department = Column(String) 
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True)
    route_summary = Column(JSON, default={}) 
    
    employee = relationship("Employee", back_populates="tracking_sessions")
    company = relationship("Company", back_populates="sessions")
    logs = relationship("LocationLog", back_populates="session")

class LocationLog(Base):
    __tablename__ = "employee_location_logs"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("department_mode_sessions.id"))
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(String) 
    recorded_at = Column(DateTime, default=datetime.utcnow)
    session = relationship("DepartmentSession", back_populates="logs")

# --- 3. ATTENDANCE & IOT MODELS ---

class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True)
    
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False) 
    employee_id = Column(String, index=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow)
    date_only = Column(Date, index=True)
    status = Column(String)
    location = Column(String)
    
    check_in_time = Column(DateTime)
    check_out_time = Column(DateTime, nullable=True)

    source = Column(String, default="MOBILE")  # 'MOBILE', 'ZKTECO', 'WEB_ADMIN'
    device_id = Column(String, nullable=True)

class HardwareDevice(Base):
    __tablename__ = "hardware_devices"
    id = Column(Integer, primary_key=True)
    
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    device_uid = Column(String, unique=True, index=True) # e.g. "PI_01"
    device_type = Column(String)     # 'RASPBERRY_PI', 'ZK_DEVICE'
    location = Column(String)        # 'Front Door'
    secret_key = Column(String)      # The password for the device
    active = Column(Boolean, default=True)
    
    company = relationship("Company")

class DoorEvent(Base):
    __tablename__ = "door_events"
    id = Column(Integer, primary_key=True)
    
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    
    event_type = Column(String)     # 'AUTO_OPEN', 'ADMIN_OPEN'
    trigger_reason = Column(String) # 'CHECK_IN', 'EMERGENCY'
    device_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)