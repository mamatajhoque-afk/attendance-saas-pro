import React, { useState, useEffect } from 'react';
import { companyService } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { 
  Building2, Users, MapPin, History, LogOut, 
  Trash2, Power, UserCheck, ShieldAlert, Fingerprint, Lock, Settings, Clock, X, Crosshair
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
  const [schedule, setSchedule] = useState({ start: '09:00', end: '17:00' });

  // Calendar State
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    loadEmployees();
    loadDevices(); 
    // You might want to load existing settings here if your API supports GET settings
  }, []);

  // --- FUNCTIONS ---

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      await companyService.updateSchedule(schedule.start, schedule.end);
      toast.success("Work Schedule Updated 🕒");
    } catch (err) { toast.error("Failed to update schedule"); }
  };

  // ✅ NEW: Save Location Function
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    try {
      await companyService.updateLocation(settings.lat, settings.lng, settings.radius);
      toast.success("Office Location Updated 📍");
    } catch (err) { toast.error("Failed to update location"); }
  };

  // ✅ NEW: Auto-Detect Location Helper
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

  // --- CALENDAR FUNCTIONS ---
  
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
        const isLate = dayLogs.some(log => log.status === 'Late');
        return isLate ? 'bg-orange-100 text-orange-600 font-bold' : 'bg-green-100 text-green-600 font-bold';
      }
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans relative">
      <div className="max-w-6xl mx-auto">
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
          <button onClick={() => setActiveTab('staff')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'staff' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>
            <Users size={18}/> Staff
          </button>
          <button onClick={() => setActiveTab('control')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'control' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}>
            <ShieldAlert size={18}/> Control Center
          </button>
          <button onClick={() => setActiveTab('settings')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${activeTab === 'settings' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600'}`}>
            <Settings size={18}/> Office Settings
          </button>
        </div>

        {/* === TAB 1: STAFF MANAGEMENT === */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ADD STAFF FORM */}
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

            {/* STAFF LIST */}
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

        {/* === TAB 3: SETTINGS (✅ UPDATED WITH LOCATION) === */}
        {activeTab === 'settings' && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
             
             {/* 1. SCHEDULE CARD */}
             <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 h-fit">
              <h2 className="font-bold text-xl mb-6 flex items-center gap-2 text-slate-800">
                <Clock className="text-blue-500"/> Work Schedule
              </h2>
              <form onSubmit={handleSaveSchedule} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Office Start Time</label>
                  <input type="time" className="w-full border p-2 rounded"
                    value={schedule.start} onChange={e => setSchedule({...schedule, start: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Office End Time</label>
                  <input type="time" className="w-full border p-2 rounded"
                    value={schedule.end} onChange={e => setSchedule({...schedule, end: e.target.value})} required />
                </div>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded">
                  Update Schedule
                </button>
              </form>
            </div>

            {/* 2. ✅ NEW: LOCATION CARD */}
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

      </div>

      {/* === CALENDAR MODAL === */}
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

            <div className="mt-4 flex gap-4 text-sm justify-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-100 border border-green-600 rounded"></div>
                <span>Present</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-100 border border-orange-600 rounded"></div>
                <span>Late</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyDashboard;