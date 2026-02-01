import axios from 'axios';

// ⚠️ CHANGE THIS URL WHEN DEPLOYING TO RENDER
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to set the JWT Token for all requests
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('token', token);
  } else {
    delete api.defaults.headers.common['Authorization'];
    localStorage.removeItem('token');
  }
};

export const authService = {
  // 👑 SUPER ADMIN (OAuth2 Form Data)
  loginSuperAdmin: async (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return api.post('/saas/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  },

  // 🏢 COMPANY ADMIN (Multipart Form Data)
  loginCompany: async (username, password) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    return api.post('/company/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // 📱 EMPLOYEE (Secure JSON)
  loginEmployee: async (employeeId, password, deviceId) => {
    return api.post('/api/login', { 
      employee_id: employeeId, 
      password: password, 
      device_id: deviceId 
    });
  }
};

export const superAdminService = {
  createCompany: (data) => api.post('/saas/create_company', data),
  getCompanies: () => api.get('/saas/companies'),
  getHardware: () => api.get('/saas/hardware'),

  // [NEW] Delete Company
  deleteCompany: (id) => api.delete(`/saas/companies/${id}`),

  // [NEW] Update Hardware
  updateHardware: (id, type) => api.put(`/saas/hardware/${id}`, { device_type: type }),
  
  // [NEW] Update Company (Name or Status)
  updateCompany: (id, name, status) => api.put(`/saas/companies/${id}`, { name, status }),
  
  // 🚨 IoT Remote Open
  emergencyOpen: (companyId, deviceId, reason) => api.post('/admin/door/emergency-open', {
    company_id: companyId,
    device_id: deviceId,
    reason: reason
  })
};

export const companyService = {
  // ✅ FIXED: URL changed from '/company/add_employee' to '/company/employees'
  addEmployee: (data) => api.post('/company/employees', data),
  
  getEmployees: () => api.get('/company/employees'),

  // [Live tracking & history]
  getEmployeeHistory: (empId) => api.get(`/company/employees/${empId}/attendance`),
  getLiveTracking: () => api.get('/company/tracking/live'),
  
  // [NEW FEATURES]
  deleteEmployee: (dbId) => api.delete(`/company/employees/${dbId}`),
  updateEmployee: (dbId, data) => api.put(`/company/employees/${dbId}`, data), 
  markAttendance: (data) => api.post('/company/attendance/manual', data),
  
  // Device Control
  getDevices: () => api.get('/company/devices'),
  emergencyOpen: (deviceId, reason) => api.post('/company/devices/emergency-open', { device_id: deviceId, reason }),

  // ⚙️ Settings (Form Data)
  updateSettings: (lat, lng, radius) => {
    const formData = new FormData();
    formData.append('lat', lat);
    formData.append('lng', lng);
    formData.append('radius', radius);
    return api.post('/company/settings/location', formData);
  }
};

export const employeeService = {
  getProfile: () => api.get('/api/me'),
  
  // 📍 GPS Punch
  markAttendance: (id, location) => api.post('/api/mark_attendance', {
    employee_id: id,
    location: location
  }),
  
  // 🚚 Tracking
  startTracking: (id, dept) => api.post('/api/tracking/start', {
    employee_id: id,
    department: dept
  }),
  pushLocation: (sessionId, lat, lng, status) => api.post('/api/tracking/update', {
    session_id: sessionId,
    lat, lng, status
  })
};

export default api;