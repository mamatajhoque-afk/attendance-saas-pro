import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, setAuthToken } from '../services/api';
import toast from 'react-hot-toast';

const Login = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('company'); 
  const [formData, setFormData] = useState({ username: '', password: '', deviceId: 'WEB_CLIENT_01' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let res;
      
      if (activeTab === 'super') {
        res = await authService.loginSuperAdmin(formData.username, formData.password);
        setAuthToken(res.data.access_token);
        localStorage.setItem('role', 'super_admin');
        navigate('/super-dashboard');
      } 
      else if (activeTab === 'company') {
        res = await authService.loginCompany(formData.username, formData.password);
        setAuthToken(res.data.access_token);
        localStorage.setItem('role', 'admin');
        localStorage.setItem('company_id', res.data.company_id);
        navigate('/company-dashboard');
      } 
      else {
        // Employee
        res = await authService.loginEmployee(formData.username, formData.password, formData.deviceId);
        if(res.data.status === 'error') throw new Error(res.data.message);
        
        setAuthToken(res.data.access_token);
        localStorage.setItem('role', 'employee');
        navigate('/employee-dashboard');
      }
      toast.success("Welcome back!");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || err.message || "Login Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-slate-800">SaaS Attendance</h1>
        <p className="text-center text-slate-500 mb-6">Secure Enterprise Login</p>

        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
          {['company', 'employee', 'super'].map(role => (
            <button
              key={role}
              onClick={() => setActiveTab(role)}
              className={`flex-1 py-2 text-sm font-medium rounded-md capitalize transition-all 
                ${activeTab === role ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
            >
              {role === 'super' ? 'Owner' : role}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder={activeTab === 'employee' ? 'Employee ID (e.g. EMP001)' : 'Username'}
            onChange={e => setFormData({...formData, username: e.target.value})}
            required
          />
          <input
            type="password"
            className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Password"
            onChange={e => setFormData({...formData, password: e.target.value})}
            required
          />
          <button 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : `Login as ${activeTab.toUpperCase()}`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;