from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer # <--- Added Import
from datetime import datetime

from app.db.database import get_db
from app.db.models import SuperAdmin, CompanyAdmin, Employee
from app.core.security import verify_password, create_access_token, get_password_hash
from app.schemas.schemas import LoginRequest, Token

router = APIRouter()

# ⚠️ THIS WAS MISSING
# This allows other files to import "oauth2_scheme" to verify tokens
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="saas/login") 

# 1. SUPER ADMIN LOGIN (OAuth2 Standard for Swagger UI)
@router.post("/saas/login", response_model=Token)
def login_super_admin(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # In production, check DB. For demo, we check hardcoded or DB.
    # Note: You should check db.query(SuperAdmin) here.
    if form_data.username == "admin" and form_data.password == "admin123":
         return {
             "access_token": create_access_token(form_data.username, "super_admin"),
             "token_type": "bearer",
             "role": "super_admin"
         }
    raise HTTPException(status_code=401, detail="Invalid Credentials")

# 2. COMPANY ADMIN LOGIN (Form Data)
@router.post("/company/login", response_model=Token)
def login_company_admin(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    admin = db.query(CompanyAdmin).filter(CompanyAdmin.username == username).first()
    
    if not admin or admin.password != password:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    
    if admin.company.status == "suspended":
        raise HTTPException(status_code=403, detail="Company Suspended")
        
    token = create_access_token(admin.username, "admin", admin.company_id)
    return {
        "access_token": token, 
        "token_type": "bearer", 
        "role": "admin",
        "company_id": admin.company_id,
        "name": admin.company.name
    }

# 3. EMPLOYEE LOGIN (Secure JSON)
@router.post("/api/login")
def login_employee(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id, 
        Employee.deleted_at == None
    ).first()
    
    if not user: return {"status": "error", "message": "User not found"}
    
    if not verify_password(payload.password, user.password_hash):
        return {"status": "error", "message": "Wrong Password"}
    
    # Device Lock Logic
    if not user.device_id:
        user.device_id = payload.device_id
        db.commit()
    elif user.device_id != payload.device_id:
        return {"status": "error", "message": "Account locked to another device"}
        
    user.last_login = datetime.utcnow()
    db.commit()
    
    token = create_access_token(user.employee_id, "employee", user.company_id)
    
    return {
        "status": "success", 
        "access_token": token, 
        "name": user.name, 
        "company_id": user.company_id
    }