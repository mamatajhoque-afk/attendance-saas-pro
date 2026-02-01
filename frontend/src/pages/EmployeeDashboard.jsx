import React, { useEffect, useState } from 'react';
import { employeeService } from '../services/api';
import toast from 'react-hot-toast';
import { MapPin, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const EmployeeDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const res = await employeeService.getProfile();
      setProfile(res.data);
    } catch (err) { toast.error("Failed to load profile"); }
  };

  const handlePunch = async () => {
    if (!navigator.geolocation) return toast.error("GPS Required");
    setLoading(true);

    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const loc = `${pos.coords.latitude}, ${pos.coords.longitude}`;
        const res = await employeeService.markAttendance(profile.id, loc);
        
        if (res.data.status === 'success') {
          toast.success(res.data.message);
          loadProfile();
        } else {
          toast(res.data.message, { icon: '⚠️' });
        }
      } catch (err) {
        toast.error("Punch Failed");
      } finally {
        setLoading(false);
      }
    }, () => {
      toast.error("Permission Denied");
      setLoading(false);
    });
  };

  if (!profile) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center">
      {/* Mobile App Header */}
      <div className="w-full max-w-md bg-blue-600 text-white p-6 rounded-b-3xl shadow-lg relative">
        <button onClick={() => { localStorage.clear(); navigate('/'); }} className="absolute top-6 right-6 opacity-80">
          <LogOut size={20} />
        </button>
        <h1 className="text-2xl font-bold">Hi, {profile.name} 👋</h1>
        <div className="mt-6 flex justify-between bg-blue-700/50 p-4 rounded-xl backdrop-blur-sm">
           <div className="text-center">
             <p className="text-xs opacity-70">Check In</p>
             <p className="font-mono font-bold text-lg">{profile.today.checkIn ? new Date(profile.today.checkIn).toLocaleTimeString([], {timeStyle:'short'}) : '--:--'}</p>
           </div>
           <div className="h-10 w-px bg-white/20"></div>
           <div className="text-center">
             <p className="text-xs opacity-70">Check Out</p>
             <p className="font-mono font-bold text-lg">{profile.today.checkOut ? new Date(profile.today.checkOut).toLocaleTimeString([], {timeStyle:'short'}) : '--:--'}</p>
           </div>
        </div>
      </div>

      {/* Big Punch Button */}
      <div className="flex-1 flex flex-col justify-center py-10">
        <button 
          onClick={handlePunch}
          disabled={loading}
          className={`w-56 h-56 rounded-full shadow-2xl flex flex-col items-center justify-center transition-all transform active:scale-95 border-8 
          ${loading ? 'bg-gray-100 border-gray-200' : 'bg-white border-blue-50 hover:border-blue-100 text-blue-600'}`}
        >
          <MapPin size={48} className={loading ? 'animate-bounce text-gray-400' : 'text-blue-500 mb-2'} />
          <span className="text-xl font-bold">{loading ? 'Acquiring GPS...' : 'TAP TO PUNCH'}</span>
        </button>
      </div>
      
      <div className="mb-8 text-slate-400 text-sm">Location: {profile.department}</div>
    </div>
  );
};

export default EmployeeDashboard;