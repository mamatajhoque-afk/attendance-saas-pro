import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Company, CompanyAdmin, HardwareDevice, SuperAdmin
from app.schemas.schemas import CompanyCreate
from app.core.security import get_password_hash

router = APIRouter()

# 1. CREATE NEW COMPANY (Tenant)
@router.post("/saas/create_company")
def create_company(payload: CompanyCreate, db: Session = Depends(get_db)):
    # Check duplicates
    if db.query(Company).filter(Company.name == payload.name).first():
        raise HTTPException(400, "Company Name Taken")
    if db.query(CompanyAdmin).filter(CompanyAdmin.username == payload.admin_username).first():
        raise HTTPException(400, "Admin Username Taken")

    try:
        # A. Create Company
        new_co = Company(
            name=payload.name,
            plan=payload.plan,
            valid_until=datetime.now().date() + timedelta(days=30),
            status="active"
        )
        db.add(new_co)
        db.flush()
        db.refresh(new_co)

        # B. Create Admin
        db.add(CompanyAdmin(
            company_id=new_co.id,
            username=payload.admin_username,
            password=payload.admin_pass # In real prod, hash this too!
        ))

        # C. Create Hardware (Virtual/Seed)
        uid = f"ZK_{secrets.token_hex(4).upper()}"
        key = secrets.token_urlsafe(20)
        
        db.add(HardwareDevice(
            company_id=new_co.id,
            device_uid=uid,
            device_type=payload.hardware_type.upper(),
            location="Main Entrance",
            secret_key=key,
            active=True
        ))
        
        db.commit()
        
        return {
            "status": "success",
            "company_id": new_co.id,
            "device_config": {"uid": uid, "key": key}
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Creation Failed: {str(e)}")

# 2. GET ALL COMPANIES
@router.get("/saas/companies")
def list_companies(db: Session = Depends(get_db)):
    return db.query(Company).all()

# 3. GET ALL HARDWARE
@router.get("/saas/hardware")
def list_hardware(db: Session = Depends(get_db)):
    # In prod, restrict this to Super Admin Token
    devices = db.query(HardwareDevice).all()
    return [{
        "id": d.id, 
        "uid": d.device_uid, 
        "type": d.device_type, 
        "company": d.company.name,
        "status": "Online" if d.active else "Offline"
    } for d in devices]

# 4. SETUP OWNER (Run once)
@router.get("/setup-owner")
def setup_owner(db: Session = Depends(get_db)):
    if db.query(SuperAdmin).first():
        return {"message": "Owner already exists"}
    
    db.add(SuperAdmin(
        username="owner",
        password=get_password_hash("owner123")
    ))
    db.commit()
    return {"message": "Owner created: owner / owner123"}