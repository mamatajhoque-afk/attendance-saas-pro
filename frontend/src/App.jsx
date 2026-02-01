import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Import your pages
import Login from './pages/Login';
import SuperDashboard from './pages/SuperDashboard';
import CompanyDashboard from './pages/CompanyDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';

// 🔒 SECURITY GUARD COMPONENT
// This checks if you have a token and the correct role before showing the page.
const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  // If not logged in OR wrong role -> Kick back to Login
  if (!token || role !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      {/* This enables the pop-up notifications (Toasts) everywhere */}
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

      <Routes>
        {/* Public Login Page */}
        <Route path="/" element={<Login />} />

        {/* 👑 TIER 1: Super Admin (Owner) */}
        <Route 
          path="/super-dashboard" 
          element={
            <ProtectedRoute allowedRole="super_admin">
              <SuperDashboard />
            </ProtectedRoute>
          } 
        />

        {/* 🏢 TIER 2: Company Admin (Tenant) */}
        <Route 
          path="/company-dashboard" 
          element={
            <ProtectedRoute allowedRole="admin">
              <CompanyDashboard />
            </ProtectedRoute>
          } 
        />

        {/* 📱 TIER 3: Employee App */}
        <Route 
          path="/employee-dashboard" 
          element={
            <ProtectedRoute allowedRole="employee">
              <EmployeeDashboard />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;