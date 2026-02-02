import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeService } from '../services/api';
import toast from 'react-hot-toast';
import Calendar from 'react-calendar'; 
import 'react-calendar/dist/Calendar.css'; 
import { 
  LogOut, User, Calendar as CalendarIcon, 
  CheckCircle, AlertTriangle, XCircle, BarChart3
} from 'lucide-react';

const EmployeeDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]); 
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [todayLog, setTodayLog] = useState(null); 
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0 });

  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
    loadHistory();
  }, []);

  useEffect(() => {
    if (history.length > 0) {
      calculateMonthlyStats();
      // Auto-select today if available
      handleDateClick(new Date());
    }
  }, [history]);

  const loadProfile = async () => {
    try {
      const res = await employeeService.getProfile();
      setProfile(res.data);
    } catch (err) {
      toast.error("Session expired");
      navigate('/');
    }
  };

  const loadHistory = async () => {
    try {
      const res = await employeeService.getHistory();
      console.log("History Loaded:", res.data); // Debugging
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to load history");
    }
  };

  // ✅ HELPER: Format Date to "YYYY-MM-DD" to match Database exactly
  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const dateKey = formatDateKey(date);
    
    // Find log by strict Date Only match
    const log = history.find(h => h.date_only === dateKey);
    setTodayLog(log || null);
  };

  const calculateMonthlyStats = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const thisMonthLogs = history.filter(log => {
      // Safe parsing of YYYY-MM-DD string
      if (!log.date_only) return false;
      const [y, m, d] = log.date_only.split('-').map(Number);
      return (m - 1) === currentMonth && y === currentYear;
    });

    const presentCount = thisMonthLogs.filter(l => l.status === 'Present').length;
    const lateCount = thisMonthLogs.filter(l => l.status === 'Late').length;

    let workingDaysSoFar = 0;
    const today = now.getDate();
    for (let i = 1; i <= today; i++) {
      const dayCheck = new Date(currentYear, currentMonth, i);
      const dayOfWeek = dayCheck.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDaysSoFar++;
    }

    const totalAttended = presentCount + lateCount;
    const absentCount = Math.max(0, workingDaysSoFar - totalAttended);
    setStats({ present: presentCount, late: lateCount, absent: absentCount });
  };

  // 🎨 [FIXED] Calendar Colors - Uses date_only for 100% accuracy
  const getTileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dateKey = formatDateKey(date); // e.g. "2026-02-02"
      const today = new Date();
      today.setHours(0,0,0,0);

      // 1. Check for Log (Present/Late) using strict string match
      const log = history.find(l => l.date_only === dateKey);
      
      if (log) {
        const isLate = log.status && log.status.toLowerCase() === 'late';
        return isLate 
          ? 'bg-orange-100 text-orange-600 font-bold rounded-md' 
          : 'bg-green-100 text-green-600 font-bold rounded-md';
      }

      // 2. Check for Absent (Past Weekday + No Log)
      if (date < today && date.getDay() !== 0 && date.getDay() !== 6) {
        return 'bg-red-100 text-red-600 font-bold rounded-md';
      }
    }
    return null;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  if (!profile) return <div className="p-8 text-center">Loading Profile...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600"><User size={32} /></div>
            <h2 className="text-xl font-bold text-slate-800">{profile.name}</h2>
            <p className="text-sm text-slate-500 font-mono mb-4">{profile.employee_id}</p>
            <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">{profile.role}</div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-500 font-bold p-4 hover:bg-red-50 rounded-xl transition border border-transparent hover:border-red-100 bg-white shadow-sm"><LogOut size={18}/> Logout</button>
        </div>

        {/* Right Column: Calendar & Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CalendarIcon className="text-blue-600"/> My Attendance</h2>
              <div className="flex gap-3 text-xs font-bold">
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 border border-green-500 rounded-full"></span> Present</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-100 border border-orange-500 rounded-full"></span> Late</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-500 rounded-full"></span> Absent</div>
              </div>
            </div>
            <div className="calendar-wrapper custom-calendar">
              <Calendar 
                onChange={handleDateClick} 
                value={selectedDate} 
                tileClassName={getTileClassName} 
                className="w-full border-none font-sans text-sm"
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Details for {selectedDate.toDateString()}</h3>
            {todayLog ? (
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${todayLog.status === 'Late' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>{todayLog.status === 'Late' ? <AlertTriangle size={24}/> : <CheckCircle size={24}/>}</div>
                <div><h4 className="font-bold text-lg text-slate-800">You were {todayLog.status}</h4><p className="text-slate-500 text-sm">Punch In Time: <span className="font-mono text-slate-700 font-bold">{new Date(todayLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p></div>
              </div>
            ) : (<p className="text-slate-400 italic">No attendance record for this day.</p>)}
          </div>

          <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-200"><BarChart3 size={20}/> This Month's Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className="text-3xl font-bold text-green-400 mb-1">{stats.present}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><CheckCircle size={12}/> Present</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className="text-3xl font-bold text-orange-400 mb-1">{stats.late}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><AlertTriangle size={12}/> Late</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className="text-3xl font-bold text-red-400 mb-1">{stats.absent}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><XCircle size={12}/> Absent</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default EmployeeDashboard;