import React, { useState, useEffect } from 'react';
import { companyService } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { 
  Building2, Users, MapPin, History, LogOut, 
  Trash2, Power, UserCheck, ShieldAlert, Fingerprint, Lock, Settings, Clock, X, Crosshair, ClipboardList, Filter
} from 'lucide-react';

const CompanyDashboard = () => {
  const [activeTab, setActiveTab] = useState('staff'); 
  const [employees, setEmployees] = useState([]);
  const [devices, setDevices] = useState([]); 
  
  // Forms & Modals
  const [newEmp, setNewEmp] = useState({ employee_id: '', name: '', password: '', role: 'Staff' });
  const [manualAtt, setManualAtt] = useState({ employee_id: '', type: 'check_in', date: '', time: '' });
  
  // Settings & Schedule
  const [settings, setSettings] = useState({ lat: '', lng: '', radius: '50' });
  const [schedule, setSchedule] = useState({ start: '09:00', end: '17:00', timezone: 'UTC', superLateThreshold: 30 });

  // Calendar State
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  // AUDIT STATE 
  const [auditData, setAuditData] = useState({ attendance: [], shortLeaves: [], doorEvents: [] });
  const [auditSubTab, setAuditSubTab] = useState('attendance');
  const [attFilter, setAttFilter] = useState('all'); 

  const navigate = useNavigate();

  // Load Initial Data
  useEffect(() => {
    loadEmployees();
    loadDevices(); 
    loadSettings(); // ✅ Added to load saved timezone/schedule
  }, []);

  // Load Audit Logs when tab is active
  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditData();
    }
  }, [activeTab]);

  // --- FUNCTIONS ---

  const loadSettings = async () => {
    try {
      const res = await companyService.getSettings();
      const data = res.data;
      setSettings({
        lat: data.office_lat || '',
        lng: data.office_lng || '',
        radius: data.office_radius || '50'
      });
      setSchedule({
        start: data.work_start_time || '09:00',
        end: data.work_end_time || '17:00',
        timezone: data.timezone || 'UTC',
        superLateThreshold: data.super_late_threshold || 30
      });
    } catch (err) {
      console.error("Failed to load settings");
    }
  };

  const loadAuditData = async () => {
    try {
      const [attRes, leavesRes, doorsRes] = await Promise.all([
        companyService.getAllAttendance(),
        companyService.getAllShortLeaves(),
        companyService.getAllDoorEvents()
      ]);
      setAuditData({
        attendance: attRes.data,
        shortLeaves: leavesRes.data,
        doorEvents: doorsRes.data
      });
    } catch (err) {
      toast.error("Failed to load audit logs");
    }
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      await companyService.updateSchedule(schedule.start, schedule.end, schedule.timezone, schedule.superLateThreshold);
      toast.success("Work Schedule Updated 🕒");
      loadSettings(); // Refresh
    } catch (err) { toast.error("Failed to update schedule"); }
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    try {
      await companyService.updateLocation(settings.lat, settings.lng, settings.radius);
      toast.success("Office Location Updated 📍");
      loadSettings(); // Refresh
    } catch (err) { toast.error("Failed to update location"); }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSettings({
          ...settings,
          lat: position.coords.latitude.toString(),
          lng: position.coords.longitude.toString()
        });
        toast.success("Location Fetched!");
      },
      () => toast.error("Unable to retrieve your location")
    );
  };

  const loadEmployees = async () => {
    try {
      const res = await companyService.getEmployees();
      setEmployees(res.data.filter(e => !e.deleted_at)); 
    } catch (err) { toast.error("Failed to load staff"); }
  };
  
  const loadDevices = async () => {
    try {
      const res = await companyService.getDevices();
      setDevices(res.data);
    } catch (err) { console.error("No devices found"); }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      await companyService.addEmployee(newEmp);
      toast.success("Employee Added");
      loadEmployees();
      setNewEmp({ employee_id: '', name: '', password: '', role: 'Staff' });
    } catch (err) { toast.error("Failed to add"); }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Remove this employee?")) return;
    try {
      await companyService.deleteEmployee(id);
      toast.success("Employee Removed");
      loadEmployees();
    } catch (err) { toast.error("Delete failed"); }
  };

  const handleToggleStatus = async (emp) => {
    const newStatus = emp.status === 'suspended' ? 'active' : 'suspended';
    try {
      await companyService.updateEmployee(emp.id, { status: newStatus });
      toast.success(`User ${newStatus}`);
      loadEmployees();
    } catch (err) { toast.error("Status update failed"); }
  };

  const handleManualAttendance = async (e) => {
    e.preventDefault();
    try {
      const timestamp = new Date(`${manualAtt.date}T${manualAtt.time}`).toISOString();
      await companyService.markAttendance({
        employee_id: manualAtt.employee_id,
        type: manualAtt.type,
        timestamp: timestamp
      });
      toast.success("Attendance Marked!");
    } catch (err) { toast.error("Failed to mark attendance"); }
  };

  const handleEmergencyOpen = async (deviceId) => {
    if(!window.confirm("⚠️ EMERGENCY: Open this door remotely?")) return;
    try {
      await companyService.emergencyOpen(deviceId, "Admin Remote Open");
      toast.success("Door Unlock Command Sent 🔓");
    } catch (err) { toast.error("Command Failed"); }
  };

  const openHistory = async (emp) => {
    setSelectedEmp(emp);
    setShowCalendar(true);
    setAttendanceHistory([]); 
    try {
      const res = await companyService.getEmployeeHistory(emp.employee_id);
      setAttendanceHistory(res.data);
    } catch (err) {
      toast.error("Could not fetch history");
    }
  };

  const getTileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dayLogs = attendanceHistory.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate.getDate() === date.getDate() &&
               logDate.getMonth() === date.getMonth() &&
               logDate.getFullYear() === date.getFullYear();
      });

      if (dayLogs.length > 0) {
        const isSuperLate = dayLogs.some(log => log.status === 'Super Late');
        const isLate = dayLogs.some(log => log.status === 'Late');
        
        if (isSuperLate) return 'bg-[#B8860B] text-white font-bold rounded-md'; 
        if (isLate) return 'bg-[#FFEB3B] text-black font-bold rounded-md';      
        return 'bg-[#006400] text-white font-bold rounded-md';                  
      }
    }
    return null;
  };

  const formatTime = (isoString) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredAttendance = auditData.attendance.filter(log => {
    if (attFilter === 'late') return log.status === 'Late';
    if (attFilter === 'super_late') return log.status === 'Super Late';
    if (attFilter === 'emergency') return log.is_emergency_checkout === true;
    return true; 
  });

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans relative">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Building2 className="text-blue-600"/> Company Portal
          </h1>
          <button onClick={() => { localStorage.clear(); navigate('/'); }} className="text-red-500 hover:bg-red-50 px-3 py-1 rounded flex gap-2">
            <LogOut size={18}/> Logout
          </button>
        </header>

        {/* TABS */}
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setActiveTab('staff')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'staff' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
            <Users size={18}/> Staff
          </button>
          <button onClick={() => setActiveTab('control')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'control' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
            <ShieldAlert size={18}/> Control Center
          </button>
          <button onClick={() => setActiveTab('settings')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'settings' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
            <Settings size={18}/> Office Settings
          </button>
          <button onClick={() => setActiveTab('audit')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
            <ClipboardList size={18}/> Audit Logs
          </button>
        </div>

        {/* === TAB 1: STAFF MANAGEMENT === */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
              <h2 className="font-bold mb-4 text-slate-700">Add New Staff</h2>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <input placeholder="ID (e.g. EMP01)" className="w-full border p-2 rounded" value={newEmp.employee_id} onChange={e => setNewEmp({...newEmp, employee_id: e.target.value})} />
                <input placeholder="Name" className="w-full border p-2 rounded" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                <input placeholder="Password" type="password" className="w-full border p-2 rounded" value={newEmp.password} onChange={e => setNewEmp({...newEmp, password: e.target.value})} />
                <select className="w-full border p-2 rounded" value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})}>
                  <option value="Staff">Office Staff</option>
                  <option value="Marketing">Field Marketing</option>
                </select>
                <button className="w-full bg-blue-600 text-white font-bold py-2 rounded">Register</button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold mb-4 text-slate-700">Staff List</h2>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-mono">{emp.employee_id}</td>
                      <td className="p-3">{emp.name}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${emp.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {emp.status || 'active'}
                        </span>
                      </td>
                      <td className="p-3 text-right flex justify-end gap-2">
                        <button onClick={() => openHistory(emp)} className="p-2 rounded text-blue-600 bg-blue-50 hover:bg-blue-100" title="View Calendar">
                          <History size={16}/>
                        </button>
                        <button onClick={() => handleToggleStatus(emp)} 
                          title={emp.status === 'suspended' ? "Activate" : "Suspend"}
                          className={`p-2 rounded ${emp.status === 'suspended' ? 'text-green-600 bg-green-50' : 'text-amber-600 bg-amber-50'}`}>
                          {emp.status === 'suspended' ? <UserCheck size={16}/> : <Power size={16}/>}
                        </button>
                        <button onClick={() => handleDelete(emp.id)} className="p-2 rounded text-red-600 bg-red-50 hover:bg-red-100">
                          <Trash2 size={16}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* === TAB 2: CONTROL CENTER === */}
        {activeTab === 'control' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold mb-4 flex items-center gap-2 text-blue-700"><Fingerprint/> Manual Attendance</h2>
              <form onSubmit={handleManualAttendance} className="space-y-4">
                <input className="w-full border p-2 rounded mt-1" placeholder="Employee ID (e.g. EMP01)" 
                  onChange={e => setManualAtt({...manualAtt, employee_id: e.target.value})} required />
                <div className="grid grid-cols-2 gap-4">
                  <input type="date" className="w-full border p-2 rounded mt-1" 
                    onChange={e => setManualAtt({...manualAtt, date: e.target.value})} required />
                  <input type="time" className="w-full border p-2 rounded mt-1" 
                    onChange={e => setManualAtt({...manualAtt, time: e.target.value})} required />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="type" value="check_in" defaultChecked onChange={() => setManualAtt({...manualAtt, type: 'check_in'})} /> Check In
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="type" value="check_out" onChange={() => setManualAtt({...manualAtt, type: 'check_out'})} /> Check Out
                  </label>
                </div>
                <button className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700">Submit</button>
              </form>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100">
              <h2 className="font-bold mb-4 flex items-center gap-2 text-red-600"><Lock/> Emergency Door Control</h2>
              <div className="space-y-3">
                {devices.length === 0 ? <p className="text-slate-400 italic">No devices found.</p> : devices.map(dev => (
                  <div key={dev.id} className="border border-slate-200 p-4 rounded-lg flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-slate-700">{dev.device_type}</h4>
                      <p className="text-xs text-slate-500 font-mono">UID: {dev.device_uid}</p>
                    </div>
                    <button onClick={() => handleEmergencyOpen(dev.id)} className="bg-red-100 text-red-600 hover:bg-red-600 hover:text-white px-4 py-2 rounded font-bold text-sm border border-red-200">OPEN DOOR</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === TAB 3: SETTINGS === */}
        {activeTab === 'settings' && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
             <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 h-fit">
              <h2 className="font-bold text-xl mb-6 flex items-center gap-2 text-slate-800">
                <Clock className="text-blue-500"/> Work Schedule & Timezone
              </h2>
              <form onSubmit={handleSaveSchedule} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Company Timezone</label>
                  <select className="w-full border p-2 rounded bg-slate-50"
                    value={schedule.timezone} onChange={e => setSchedule({...schedule, timezone: e.target.value})}>
                    <option value="UTC">UTC (Default)</option>
                    <option value="Asia/Dhaka">Asia/Dhaka (BDT)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Office Start</label>
                    <input type="time" className="w-full border p-2 rounded"
                      value={schedule.start} onChange={e => setSchedule({...schedule, start: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Office End</label>
                    <input type="time" className="w-full border p-2 rounded"
                      value={schedule.end} onChange={e => setSchedule({...schedule, end: e.target.value})} required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Super Late Threshold (Minutes)</label>
                  <input type="number" min="1" className="w-full border p-2 rounded bg-slate-50"
                    value={schedule.superLateThreshold} onChange={e => setSchedule({...schedule, superLateThreshold: e.target.value})} required />
                  <p className="text-xs text-slate-400 mt-1">Check-ins after Start Time + this threshold will be marked as Super Late.</p>
                </div>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded">
                  Update Schedule
                </button>
              </form>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 h-fit">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold text-xl flex items-center gap-2 text-slate-800">
                  <MapPin className="text-red-500"/> Office Location
                </h2>
                <button type="button" onClick={handleGetLocation} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full flex items-center gap-1 font-bold">
                  <Crosshair size={14}/> Get Current
                </button>
              </div>
              <form onSubmit={handleSaveLocation} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Latitude</label>
                    <input type="text" className="w-full border p-2 rounded bg-slate-50"
                      value={settings.lat} onChange={e => setSettings({...settings, lat: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Longitude</label>
                    <input type="text" className="w-full border p-2 rounded bg-slate-50"
                      value={settings.lng} onChange={e => setSettings({...settings, lng: e.target.value})} required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Geofence Radius (Meters)</label>
                  <input type="number" className="w-full border p-2 rounded"
                    value={settings.radius} onChange={e => setSettings({...settings, radius: e.target.value})} required />
                  <p className="text-xs text-slate-400 mt-1">Distance allowed from center point.</p>
                </div>
                <button className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded">
                  Update Location
                </button>
              </form>
            </div>
           </div>
        )}

        {/* === TAB 4: AUDIT LOGS (WITH LATE REASON) === */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50">
              <button onClick={() => setAuditSubTab('attendance')} className={`flex-1 py-3 font-bold text-sm ${auditSubTab === 'attendance' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>Attendance & Emergency</button>
              <button onClick={() => setAuditSubTab('short_leaves')} className={`flex-1 py-3 font-bold text-sm ${auditSubTab === 'short_leaves' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>Short Leaves</button>
              <button onClick={() => setAuditSubTab('door_events')} className={`flex-1 py-3 font-bold text-sm ${auditSubTab === 'door_events' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>Door Access Logs</button>
            </div>

            <div className="p-6 overflow-x-auto">
              {auditSubTab === 'attendance' && (
                <>
                  <div className="flex gap-2 mb-4 items-center">
                    <Filter size={16} className="text-slate-500"/>
                    <select value={attFilter} onChange={(e) => setAttFilter(e.target.value)} className="border rounded p-1.5 text-sm bg-white font-bold text-slate-700">
                      <option value="all">View All</option>
                      <option value="late">Late</option>
                      <option value="super_late">Super Late</option>
                      <option value="emergency">Emergency Check-outs</option>
                    </select>
                  </div>
                  
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Employee ID</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Check In</th>
                        <th className="p-3">Door Unlocked</th>
                        <th className="p-3">Check Out</th>
                        <th className="p-3 max-w-[150px]">Late Reason</th>
                        <th className="p-3 max-w-[150px]">Emergency Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendance.length === 0 ? <tr><td colSpan="8" className="p-4 text-center text-slate-500">No records found.</td></tr> : null}
                      {filteredAttendance.map(log => (
                        <tr key={log.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-700">{log.date}</td>
                          <td className="p-3 font-mono">{log.employee_id}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              log.status === 'Super Late' ? 'bg-[#B8860B] text-white' :
                              log.status === 'Late' ? 'bg-[#FFEB3B] text-black' : 'bg-[#006400] text-white'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="p-3">{formatTime(log.check_in_time)}</td>
                          <td className="p-3">{formatTime(log.door_unlock_time)}</td>
                          <td className="p-3">
                            <span className={log.is_emergency_checkout ? "text-red-600 font-bold flex items-center gap-1" : ""}>
                              {formatTime(log.check_out_time)}
                              {log.is_emergency_checkout && <span className="text-[10px] bg-red-100 px-1 rounded uppercase">Emerg.</span>}
                            </span>
                          </td>
                          <td className="p-3 max-w-[150px] truncate text-orange-700 italic" title={log.late_reason}>
                            {log.late_reason || '-'}
                          </td>
                          <td className="p-3 max-w-[150px] truncate text-red-700 italic" title={log.emergency_checkout_reason}>
                            {log.emergency_checkout_reason || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {auditSubTab === 'short_leaves' && (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Employee ID</th>
                      <th className="p-3">Exit Time</th>
                      <th className="p-3">Return Time</th>
                      <th className="p-3 min-w-[200px]">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.shortLeaves.length === 0 ? <tr><td colSpan="5" className="p-4 text-center text-slate-500">No short leaves found.</td></tr> : null}
                    {auditData.shortLeaves.map(leave => (
                      <tr key={leave.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-700">{leave.date}</td>
                        <td className="p-3 font-mono">{leave.employee_id}</td>
                        <td className="p-3 text-orange-600 font-bold">{formatTime(leave.exit_time)}</td>
                        <td className="p-3 text-green-600 font-bold">{leave.return_time ? formatTime(leave.return_time) : 'Active...'}</td>
                        <td className="p-3 text-slate-600">{leave.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {auditSubTab === 'door_events' && (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Device ID</th>
                      <th className="p-3">Event Type</th>
                      <th className="p-3">Trigger Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.doorEvents.length === 0 ? <tr><td colSpan="4" className="p-4 text-center text-slate-500">No door events found.</td></tr> : null}
                    {auditData.doorEvents.map(event => {
                      const dt = new Date(event.timestamp);
                      return (
                        <tr key={event.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-700">{dt.toLocaleDateString()} {dt.toLocaleTimeString()}</td>
                          <td className="p-3 font-mono">{event.device_id}</td>
                          <td className="p-3">
                            <span className="px-2 py-1 bg-slate-200 text-slate-800 rounded text-xs font-bold">{event.event_type}</span>
                          </td>
                          <td className="p-3 text-slate-600">{event.trigger_reason}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>

      {showCalendar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <button onClick={() => setShowCalendar(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={24}/>
            </button>
            
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-800">{selectedEmp?.name}</h2>
              <p className="text-slate-500 text-sm">Attendance History</p>
            </div>

            <div className="calendar-container">
              <Calendar 
                tileClassName={getTileClassName}
                className="w-full border-none shadow-none text-sm"
              />
            </div>

            <div className="mt-4 flex gap-4 text-xs font-bold justify-center flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[#006400]"></div> <span>Present</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[#FFEB3B] border border-slate-300"></div> <span>Late</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[#B8860B]"></div> <span>Super Late</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[#8B0000]"></div> <span>Absent</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyDashboard;