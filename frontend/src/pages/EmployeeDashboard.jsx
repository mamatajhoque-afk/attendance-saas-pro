import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeService } from '../services/api';
import toast from 'react-hot-toast';
import Calendar from 'react-calendar'; 
import 'react-calendar/dist/Calendar.css'; 
import { 
  LogOut, User, Calendar as CalendarIcon, 
  CheckCircle, AlertTriangle 
} from 'lucide-react';

const EmployeeDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]); // Store attendance logs
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [todayLog, setTodayLog] = useState(null); // Log for the clicked date
  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
    loadHistory();
  }, []);

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
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to load history");
    }
  };

  // 🎨 COLOR THE CALENDAR TILES
  const getTileClassName = ({ date, view }) => {
    if (view === 'month') {
      // Find log for this specific date
      const log = history.find(h => {
        const hDate = new Date(h.timestamp);
        return hDate.getDate() === date.getDate() &&
               hDate.getMonth() === date.getMonth() &&
               hDate.getFullYear() === date.getFullYear();
      });

      if (log) {
        return log.status === 'Late' 
          ? 'bg-orange-100 text-orange-600 font-bold rounded-full' 
          : 'bg-green-100 text-green-600 font-bold rounded-full';
      }
    }
    return null;
  };

  // 👋 HANDLE DATE CLICK
  const handleDateClick = (date) => {
    setSelectedDate(date);
    const log = history.find(h => {
      const hDate = new Date(h.timestamp);
      return hDate.getDate() === date.getDate() &&
             hDate.getMonth() === date.getMonth() &&
             hDate.getFullYear() === date.getFullYear();
    });
    setTodayLog(log || null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  if (!profile) return <div className="p-8 text-center">Loading Profile...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* === LEFT COLUMN: PROFILE & ACTIONS === */}
        <div className="space-y-6">
          
          {/* 1. Profile Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
              <User size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">{profile.name}</h2>
            <p className="text-sm text-slate-500 font-mono mb-4">{profile.employee_id}</p>
            <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">
              {profile.role}
            </div>
          </div>

          {/* 2. Logout Button (Moved up since Quick Actions is gone) */}
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-500 font-bold p-4 hover:bg-red-50 rounded-xl transition border border-transparent hover:border-red-100 bg-white shadow-sm">
            <LogOut size={18}/> Logout
          </button>
        </div>

        {/* === RIGHT COLUMN: ATTENDANCE CALENDAR === */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. Calendar Card */}
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <CalendarIcon className="text-blue-600"/> My Attendance
              </h2>
              <div className="flex gap-3 text-xs font-bold">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-100 border border-green-500 rounded-full"></span> Present
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-orange-100 border border-orange-500 rounded-full"></span> Late
                </div>
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

          {/* 2. Details for Selected Date */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">
              Details for {selectedDate.toDateString()}
            </h3>
            
            {todayLog ? (
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${todayLog.status === 'Late' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                  {todayLog.status === 'Late' ? <AlertTriangle size={24}/> : <CheckCircle size={24}/>}
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-800">
                    You were {todayLog.status}
                  </h4>
                  <p className="text-slate-500 text-sm">
                    Punch In Time: <span className="font-mono text-slate-700 font-bold">
                      {new Date(todayLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 italic">No attendance record for this day.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;