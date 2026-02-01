import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.database import engine, Base

# Import Routers
from app.routers import auth, super_admin, company, employee, hardware

# 1. SETUP LOGGING
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("saas_core")

# 2. CREATE DATABASE TABLES
Base.metadata.create_all(bind=engine)

# 3. INIT APP
app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0 (Pro)",
    description="Enterprise Attendance SaaS API"
)

# 4. CORS (Allow Frontend)
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://attendance-frontends.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. REGISTER ROUTERS
app.include_router(auth.router, tags=["Authentication"])
app.include_router(super_admin.router, tags=["Super Admin"])
app.include_router(company.router, tags=["Company Management"])
app.include_router(employee.router, tags=["Employee App"])
app.include_router(hardware.router, tags=["IoT & Hardware"])

@app.get("/")
def root():
    return {"message": "Attendance SaaS API is Running 🚀"}