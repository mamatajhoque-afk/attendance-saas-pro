import React, { useState, useEffect } from 'react';
import { companyService } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, Users, MapPin, History, LogOut, 
  Search, UserPlus, Clock, Navigation 
} from 'lucide-react';

const CompanyDashboard = () => {
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' or 'tracking'
  const [employees, setEmployees] = useState([]);
  const [trackingData, setTrackingData] = useState([]);
  
  // Modal State
  const [selectedEmp, setSelectedEmp] = useState(null); // Employee Object
  const [historyLogs, setHistoryLogs] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const [newEmp, setNewEmp] = useState({ employee_id: '', name: '', password: '', role: 'Staff' });
  const navigate = useNavigate();

  useEffect(() => {
    loadEmployees();
    // Poll tracking data every 30 seconds if on tracking tab
    let interval;
    if (activeTab === 'tracking') {
      loadTracking();
      interval = setInterval(loadTracking, 30000);
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  const loadEmployees = async () => {
    try {
      const res = await companyService.getEmployees();
      setEmployees(res.data);
    } catch (err) { toast.error("Failed to load staff"); }
  };

  const loadTracking = async () => {
    try {
      const res = await companyService.getLiveTracking();
      setTrackingData(res.data);
    } catch (err) { console.error("Tracking load failed"); }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      await companyService.addEmployee(newEmp);
      toast.success("Employee Added");
      loadEmployees();
    } catch (err) { toast.error("Failed to add"); }
  };

  // [NEW] View History Function
  const handleViewHistory = async (emp) => {
    try {
      setSelectedEmp(emp);
      const res = await companyService.getEmployeeHistory(emp.employee_id);
      setHistoryLogs(res.data);
      setShowModal(true);
    } catch (err) { toast.error("Could not fetch history"); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Building2 className="text-blue-600"/> Company Portal
          </h1>
          <button onClick={() => { localStorage.clear(); navigate('/'); }} className="text-red-500 hover:bg-red-50 px-3 py-1 rounded flex gap-2">
            <LogOut size={18}/> Logout
          </button>
        </header>

        {/* Navigation Tabs */}
        <div className="flex gap-4 mb-6">
          <button 
            onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'staff' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}
          >
            <Users size={18}/> Staff Management
          </button>
          <button 
            onClick={() => setActiveTab('tracking')}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'tracking' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
          >
            <Navigation size={18}/> Live Tracking
          </button>
        </div>

        {/* === TAB 1: STAFF MANAGEMENT === */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Add Employee */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
              <h2 className="font-bold mb-4 flex items-center gap-2 text-slate-700"><UserPlus size={20}/> Register Staff</h2>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <input placeholder="Employee ID (e.g. EMP001)" className="w-full border p-2 rounded" 
                  onChange={e => setNewEmp({...newEmp, employee_id: e.target.value})} />
                <input placeholder="Full Name" className="w-full border p-2 rounded" 
                  onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                <input placeholder="Password" type="password" className="w-full border p-2 rounded" 
                  onChange={e => setNewEmp({...newEmp, password: e.target.value})} />
                <select className="w-full border p-2 rounded"
                  onChange={e => setNewEmp({...newEmp, role: e.target.value})}>
                  <option value="Staff">Office Staff</option>
                  <option value="Marketing">Field Marketing</option>
                  <option value="Manager">Manager</option>
                </select>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded">Add Employee</button>
              </form>
            </div>

            {/* Employee List */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold mb-4 text-slate-700">Employee Directory</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-mono text-sm">{emp.employee_id}</td>
                        <td className="p-3 font-medium">{emp.name}</td>
                        <td className="p-3"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">{emp.role}</span></td>
                        <td className="p-3">
                          <button 
                            onClick={() => handleViewHistory(emp)}
                            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                          >
                            <History size={14}/> History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* === TAB 2: LIVE TRACKING === */}
        {activeTab === 'tracking' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="font-bold mb-6 text-indigo-700 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
              </span>
              Live Marketing Team Status
            </h2>
            
            {trackingData.length === 0 ? (
              <p className="text-slate-400 text-center py-10">No active marketing staff found nearby.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trackingData.map((data, idx) => (
                  <div key={idx} className="border border-indigo-100 bg-indigo-50/30 p-4 rounded-xl flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-800">{data.name}</h3>
                        <span className="text-xs text-indigo-600 font-mono">{data.id}</span>
                      </div>
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                        Active
                      </span>
                    </div>
                    
                    <div className="bg-white p-3 rounded border border-slate-200 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Lat:</span>
                        <span className="font-mono">{data.lat.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Lon:</span>
                        <span className="font-mono">{data.lon.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400 mt-2 pt-2 border-t">
                        <span>Last Seen:</span>
                        <span>{new Date(data.last_seen).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => window.open(`https://www.google.com/maps?q=${data.lat},${data.lon}`, '_blank')}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded text-sm flex justify-center items-center gap-2"
                    >
                      <MapPin size={16}/> View on Map
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === MODAL: ATTENDANCE HISTORY === */}
        {showModal && selectedEmp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-lg">Attendance History: {selectedEmp.name}</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500">Close</button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Time</th>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-left">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLogs.map(log => (
                      <tr key={log.id} className="border-b">
                        <td className="p-2">{new Date(log.timestamp).toLocaleDateString()}</td>
                        <td className="p-2 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${log.type === 'check_in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {log.type.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="p-2 text-slate-500">{log.method}</td>
                      </tr>
                    ))}
                    {historyLogs.length === 0 && (
                      <tr><td colSpan="4" className="p-4 text-center text-slate-400">No records found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CompanyDashboard;