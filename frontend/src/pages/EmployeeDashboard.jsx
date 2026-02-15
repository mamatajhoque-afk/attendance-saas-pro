import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeService } from '../services/api';
import toast from 'react-hot-toast';
import Calendar from 'react-calendar'; 
import 'react-calendar/dist/Calendar.css'; 
import { 
  LogOut, User, Calendar as CalendarIcon, 
  CheckCircle, AlertTriangle, XCircle, BarChart3, AlertOctagon
} from 'lucide-react';

const EmployeeDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]); 
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [todayLog, setTodayLog] = useState(null); 
  // ✅ UPDATED: Added superLate to stats
  const [stats, setStats] = useState({ present: 0, late: 0, superLate: 0, absent: 0 });

  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
    loadHistory();
  }, []);

  useEffect(() => {
    if (history.length > 0) {
      calculateMonthlyStats(new Date()); 
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
      
      const uniqueMap = new Map();
      res.data.forEach(log => {
        if (!uniqueMap.has(log.date_only)) {
          uniqueMap.set(log.date_only, log);
        }
      });
      
      const uniqueHistory = Array.from(uniqueMap.values());
      setHistory(uniqueHistory);

    } catch (err) {
      console.error("Failed to load history");
    }
  };

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const dateKey = formatDateKey(date);
    const log = history.find(h => h.date_only === dateKey);
    setTodayLog(log || null);
  };

  // ✅ UPDATED: Calculate Super Late
  const calculateMonthlyStats = (referenceDate) => {
    const viewYear = referenceDate.getFullYear();
    const viewMonth = referenceDate.getMonth();

    const thisMonthLogs = history.filter(log => {
      if (!log.date_only) return false;
      const [y, m, d] = log.date_only.split('-').map(Number);
      return (m - 1) === viewMonth && y === viewYear;
    });

    let presentCount = 0;
    let lateCount = 0;
    let superLateCount = 0;

    thisMonthLogs.forEach(l => {
        const status = l.status ? l.status.toLowerCase() : "";
        if (status === 'super late') superLateCount++;
        else if (status === 'late') lateCount++;
        else if (status === 'present') presentCount++;
    });

    let workingDaysCount = 0;
    const now = new Date();
    
    const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const limitDay = isCurrentMonth ? now.getDate() : daysInMonth;

    for (let i = 1; i <= limitDay; i++) {
      const dayCheck = new Date(viewYear, viewMonth, i);
      const dayOfWeek = dayCheck.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysCount++;
      }
    }

    const totalAttended = presentCount + lateCount + superLateCount;
    const absentCount = Math.max(0, workingDaysCount - totalAttended);

    setStats({ present: presentCount, late: lateCount, superLate: superLateCount, absent: absentCount });
  };

  // ✅ UPDATED: Exact Colors for Calendar
  const getTileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dateKey = formatDateKey(date); 
      const today = new Date();
      today.setHours(0,0,0,0);

      const log = history.find(l => l.date_only === dateKey);
      
      if (log) {
        const status = log.status ? log.status.toLowerCase() : "";
        if (status === 'super late') return 'bg-[#B8860B] text-white font-bold rounded-md'; // Dark Yellow
        if (status === 'late') return 'bg-[#FFEB3B] text-black font-bold rounded-md';      // Yellow
        return 'bg-[#006400] text-white font-bold rounded-md';                  // Pure Dark Green
      }

      // Check for Absent
      if (date < today && date.getDay() !== 0 && date.getDay() !== 6) {
        return 'bg-[#8B0000] text-white font-bold rounded-md'; // Dark Reddish
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

        {/* Right Column: Calendar */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CalendarIcon className="text-blue-600"/> My Attendance</h2>
              
              {/* ✅ UPDATED: Legend */}
              <div className="flex flex-wrap gap-3 text-xs font-bold justify-center">
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#006400] rounded-full"></span> Present</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#FFEB3B] border border-slate-300 rounded-full"></span> Late</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#B8860B] rounded-full"></span> Super Late</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#8B0000] rounded-full"></span> Absent</div>
              </div>
            </div>
            
            <div className="calendar-wrapper custom-calendar">
              <Calendar 
                onChange={handleDateClick} 
                onActiveStartDateChange={({ activeStartDate }) => calculateMonthlyStats(activeStartDate)}
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
                <div className={`p-3 rounded-full ${
                  todayLog.status?.toLowerCase() === 'super late' ? 'bg-orange-200 text-[#B8860B]' :
                  todayLog.status?.toLowerCase() === 'late' ? 'bg-yellow-100 text-[#B8860B]' : 
                  'bg-green-100 text-[#006400]'
                }`}>
                  {todayLog.status?.toLowerCase() === 'super late' ? <AlertOctagon size={24}/> :
                   todayLog.status?.toLowerCase() === 'late' ? <AlertTriangle size={24}/> : 
                   <CheckCircle size={24}/>}
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-800">You were {todayLog.status}</h4>
                  <p className="text-slate-500 text-sm">Punch In Time: <span className="font-mono text-slate-700 font-bold">
                    {todayLog.check_in_time ? new Date(todayLog.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(todayLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span></p>
                </div>
              </div>
            ) : (<p className="text-slate-400 italic">No attendance record for this day.</p>)}
          </div>

          {/* ✅ UPDATED: Stats Section (4 Columns) */}
          <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-200"><BarChart3 size={20}/> Monthly Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className="text-3xl font-bold text-[#4ade80] mb-1">{stats.present}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><CheckCircle size={12}/> Present</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className="text-3xl font-bold text-[#fde047] mb-1">{stats.late}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><AlertTriangle size={12}/> Late</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className="text-3xl font-bold text-[#fb923c] mb-1">{stats.superLate}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><AlertOctagon size={12}/> Super Late</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className="text-3xl font-bold text-[#f87171] mb-1">{stats.absent}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><XCircle size={12}/> Absent</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default EmployeeDashboard;