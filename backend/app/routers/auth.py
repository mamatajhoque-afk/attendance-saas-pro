from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from datetime import datetime
from jose import JWTError, jwt # <--- New Import for decoding tokens

from app.db.database import get_db
from app.db.models import SuperAdmin, CompanyAdmin, Employee
from app.core.security import verify_password, create_access_token, get_password_hash
from app.core.config import settings # <--- New Import for Secret Key
from app.schemas.schemas import LoginRequest, Token, TokenData # <--- New Import

router = APIRouter()

# This is the "Security Guard" configuration
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="saas/login") 

# ==========================================
# 👇 NEW: SECURITY DEPENDENCIES (THE FIX)
# ==========================================

# 1. Decode Token & Get User Info
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode the token using the Secret Key
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        company_id: int = payload.get("company_id")
        
        if username is None:
            raise credentials_exception
            
        token_data = TokenData(username=username, role=role, company_id=company_id)
    except JWTError:
        raise credentials_exception
    return token_data

# 2. Guard: Only Allow Company Admins
def get_current_active_admin(current_user: TokenData = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=400, detail="Not a company admin")
    return current_user

# ==========================================
# 👆 END NEW SECURITY DEPENDENCIES
# ==========================================

# 1. SUPER ADMIN LOGIN
@router.post("/saas/login", response_model=Token)
def login_super_admin(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # A. Check DB
    admin_user = db.query(SuperAdmin).filter(SuperAdmin.username == form_data.username).first()
    if admin_user and verify_password(form_data.password, admin_user.password):
         return {
             "access_token": create_access_token(admin_user.username, "super_admin"),
             "token_type": "bearer",
             "role": "super_admin"
         }
    # B. Fallback
    if form_data.username == "admin" and form_data.password == "admin123":
         return {
             "access_token": create_access_token(form_data.username, "super_admin"),
             "token_type": "bearer",
             "role": "super_admin"
         }
    raise HTTPException(status_code=401, detail="Invalid Credentials")

# 2. COMPANY ADMIN LOGIN
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

# 3. EMPLOYEE LOGIN
@router.post("/api/login")
def login_employee(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(Employee).filter(
        Employee.employee_id == payload.employee_id, 
        Employee.deleted_at == None
    ).first()
    
    if not user: return {"status": "error", "message": "User not found"}
    
    if not verify_password(payload.password, user.password_hash):
        return {"status": "error", "message": "Wrong Password"}
    
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