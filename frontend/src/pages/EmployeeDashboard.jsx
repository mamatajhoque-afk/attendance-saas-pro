import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { employeeService } from '../services/api';
import toast from 'react-hot-toast';
import Calendar from 'react-calendar'; 
import 'react-calendar/dist/Calendar.css'; 
import { 
  LogOut, User, Calendar as CalendarIcon, 
  CheckCircle, AlertTriangle, XCircle, BarChart3, AlertOctagon, LogIn
} from 'lucide-react';

// --- NEW EXACT APP COLORS ---
const COLOR_PRESENT = '#009933'; // Green
const COLOR_LATE = '#FFFF66';    // Yellow
const COLOR_SUPER_LATE = '#CCCC00'; // Olive/Dark Yellow
const COLOR_ABSENT = '#CC0000';  // Red
const COLOR_HOLIDAY = '#99CCFF'; // Light Blue

const EmployeeDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]); 
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [todayLog, setTodayLog] = useState(null); 
  const [stats, setStats] = useState({ present: 0, late: 0, superLate: 0, absent: 0 });
  const [isLoading, setIsLoading] = useState(false);

  const [holidays, setHolidays] = useState({ weekly: [], single: [] });

  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
    loadHistory();
    loadHolidays();
  }, []);

  useEffect(() => {
    if (history.length > 0 || holidays.weekly.length > 0 || holidays.single.length > 0) {
      calculateMonthlyStats(selectedDate); 
      handleDateClick(selectedDate);     
    }
  }, [history, holidays]);

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
      setHistory(Array.from(uniqueMap.values()));
    } catch (err) {
      console.error("Failed to load history");
    }
  };

  const loadHolidays = async () => {
    try {
      const res = await api.get('/api/holidays');
      setHolidays({
        weekly: res.data.weekly_holidays || [],
        single: res.data.single_dates.map(h => h.date) || []
      });
    } catch (err) {
      console.error("Failed to load holidays");
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

  const isHoliday = (date) => {
    const dateStr = formatDateKey(date);
    if (holidays.single.includes(dateStr)) return true;

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = daysOfWeek[date.getDay()];
    if (holidays.weekly.includes(dayName)) return true;

    return false;
  };

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
      if (!isHoliday(dayCheck)) {
        workingDaysCount++;
      }
    }

    const totalAttended = presentCount + lateCount + superLateCount;
    const absentCount = Math.max(0, workingDaysCount - totalAttended);

    setStats({ present: presentCount, late: lateCount, superLate: superLateCount, absent: absentCount });
  };

  // ✅ PERFECT CIRCLE COLOR LOGIC 
  const getTileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dateKey = formatDateKey(date); 
      const today = new Date();
      today.setHours(0,0,0,0);

      const log = history.find(l => l.date_only === dateKey);
      
      if (log) {
        const status = log.status ? log.status.toLowerCase() : "";
        if (status === 'super late') return `!bg-[${COLOR_SUPER_LATE}] !text-black font-bold shadow-sm`; 
        if (status === 'late') return `!bg-[${COLOR_LATE}] !text-black font-bold shadow-sm`;      
        return `!bg-[${COLOR_PRESENT}] !text-white font-bold shadow-sm`;                  
      }

      if (isHoliday(date)) {
        return `!bg-[${COLOR_HOLIDAY}] !text-[#003366] font-bold shadow-sm border border-[#66B2FF]`;
      }

      if (date < today) {
        return `!bg-[${COLOR_ABSENT}] !text-white font-bold shadow-sm`; 
      }
    }
    return null;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  const handleCheckIn = async () => {
    setIsLoading(true);
    try {
      await employeeService.markAttendance(profile.id, "Web Dashboard");
      toast.success("Checked in successfully!");
      await loadProfile();
      await loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to check in");
    }
    setIsLoading(false);
  };

  const handleCheckOut = async () => {
    setIsLoading(true);
    try {
      await api.post('/api/mark_checkout', { employee_id: profile.id });
      toast.success("Checked out successfully!");
      await loadProfile();
      await loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to check out");
    }
    setIsLoading(false);
  };

  if (!profile) return <div className="p-8 text-center">Loading Profile...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Profile & Actions */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600"><User size={32} /></div>
            <h2 className="text-xl font-bold text-slate-800">{profile.name}</h2>
            <p className="text-sm text-slate-500 font-mono mb-4">{profile.id}</p>
            <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">{profile.role}</div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
               <CalendarIcon size={18} className="text-blue-600"/> Today's Action
             </h3>
             {!profile.today?.checkIn ? (
                <button 
                  onClick={handleCheckIn} 
                  disabled={isLoading}
                  className="w-full bg-[#009688] hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition flex justify-center items-center gap-2 disabled:opacity-50">
                  <LogIn size={18}/> Check In
                </button>
             ) : !profile.today?.checkOut ? (
                <button 
                  onClick={handleCheckOut} 
                  disabled={isLoading}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition flex justify-center items-center gap-2 disabled:opacity-50">
                  <LogOut size={18}/> Check Out
                </button>
             ) : (
                <div className="w-full bg-slate-100 text-slate-500 font-bold py-3 rounded-xl flex justify-center items-center gap-2">
                  <CheckCircle size={18}/> Checked Out
                </div>
             )}
             <p className="text-xs text-slate-400 mt-4 text-center">Note: Door unlock is available via mobile app only.</p>
          </div>

          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-500 font-bold p-4 hover:bg-red-50 rounded-xl transition border border-transparent hover:border-red-100 bg-white shadow-sm"><LogOut size={18}/> Logout</button>
        </div>

        {/* Right Column: Calendar */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CalendarIcon className="text-blue-600"/> My Attendance</h2>
              
              {/* ✅ NEW APP-SYNCED LEGEND */}
              <div className="flex flex-wrap gap-3 text-xs font-bold justify-center">
                <div className="flex items-center gap-1"><span className={`w-3 h-3 bg-[${COLOR_PRESENT}] rounded-full`}></span> Present</div>
                <div className="flex items-center gap-1"><span className={`w-3 h-3 bg-[${COLOR_LATE}] border border-slate-300 rounded-full`}></span> Late</div>
                <div className="flex items-center gap-1"><span className={`w-3 h-3 bg-[${COLOR_SUPER_LATE}] rounded-full`}></span> Super Late</div>
                <div className="flex items-center gap-1"><span className={`w-3 h-3 bg-[${COLOR_HOLIDAY}] rounded-full`}></span> Holiday</div>
                <div className="flex items-center gap-1"><span className={`w-3 h-3 bg-[${COLOR_ABSENT}] rounded-full`}></span> Absent</div>
              </div>
            </div>
            
            {/* ✅ CUSTOM CSS TO FORCE PERFECT CIRCLES & REMOVE BLUE ACTIVE MARK */}
            <style>{`
              .custom-calendar .react-calendar__month-view__days {
                gap: 4px 0; /* Add slight vertical spacing between rows */
              }
              .custom-calendar .react-calendar__tile {
                aspect-ratio: 1/1; /* Forces square shape for bounding box */
                border-radius: 50% !important; /* Perfect circle */
                display: flex;
                align-items: center;
                justify-content: center;
                max-width: 44px; /* Keeps circles uniformly sized */
                margin: 0 auto; 
                padding: 0;
              }
              /* Strip default blue active backgrounds */
              .custom-calendar .react-calendar__tile--active {
                background: transparent !important;
                color: inherit !important;
              }
              .custom-calendar .react-calendar__tile--active:enabled:hover,
              .custom-calendar .react-calendar__tile--active:enabled:focus {
                background: transparent !important;
              }
              /* Strip today's blue background, add an underline to the text instead */
              .custom-calendar .react-calendar__tile--now {
                background: transparent !important;
              }
              .custom-calendar .react-calendar__tile--now abbr {
                font-weight: 900 !important;
                text-decoration: underline;
                text-underline-offset: 4px;
                text-decoration-color: #111827; /* Dark slate underline */
                text-decoration-thickness: 2px;
              }
            `}</style>

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
                <div className="p-3 rounded-full" style={{
                  backgroundColor: todayLog.status?.toLowerCase() === 'super late' ? `${COLOR_SUPER_LATE}33` : // 33 is 20% opacity in hex
                                   todayLog.status?.toLowerCase() === 'late' ? `${COLOR_LATE}66` : 
                                   `${COLOR_PRESENT}33`,
                  color: todayLog.status?.toLowerCase() === 'super late' ? COLOR_SUPER_LATE :
                         todayLog.status?.toLowerCase() === 'late' ? '#999900' : 
                         COLOR_PRESENT
                }}>
                  {todayLog.status?.toLowerCase() === 'super late' ? <AlertOctagon size={24}/> :
                   todayLog.status?.toLowerCase() === 'late' ? <AlertTriangle size={24}/> : 
                   <CheckCircle size={24}/>}
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-800">You were {todayLog.status}</h4>
                  <p className="text-slate-500 text-sm">Punch In Time: <span className="font-mono text-slate-700 font-bold">
                    {todayLog.check_in_time ? new Date(todayLog.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(todayLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span></p>
                  {todayLog.late_reason && (
                    <p className="text-slate-500 text-sm mt-1">Excuse: <span className="text-orange-600 italic">"{todayLog.late_reason}"</span></p>
                  )}
                </div>
              </div>
            ) : isHoliday(selectedDate) ? (
              <div className="p-4 rounded-lg font-bold flex items-center gap-2 border" 
                   style={{ backgroundColor: `${COLOR_HOLIDAY}33`, color: '#003366', borderColor: COLOR_HOLIDAY }}>
                 🎉 This day is marked as a company holiday!
              </div>
            ) : (
              <p className="text-slate-400 italic">No attendance record for this day.</p>
            )}
          </div>

          <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-200"><BarChart3 size={20}/> Monthly Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className={`text-3xl font-bold mb-1 text-[${COLOR_PRESENT}]`}>{stats.present}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><CheckCircle size={12}/> Present</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className={`text-3xl font-bold mb-1 text-[${COLOR_LATE}]`}>{stats.late}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><AlertTriangle size={12}/> Late</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className={`text-3xl font-bold mb-1 text-[${COLOR_SUPER_LATE}]`}>{stats.superLate}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><AlertOctagon size={12}/> Super Late</div></div>
              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600"><div className={`text-3xl font-bold mb-1 text-[${COLOR_ABSENT}]`}>{stats.absent}</div><div className="text-xs text-slate-400 uppercase font-bold flex justify-center items-center gap-1"><XCircle size={12}/> Absent</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default EmployeeDashboard;
