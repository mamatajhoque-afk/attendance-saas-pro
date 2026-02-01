import React, { useState, useEffect } from 'react';
import { superAdminService } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Server, Shield, LogOut } from 'lucide-react';

const SuperDashboard = () => {
  const [companies, setCompanies] = useState([]);
  const [hardware, setHardware] = useState([]);
  const [newCo, setNewCo] = useState({ name: '', admin_username: '', admin_pass: '', plan: 'basic', hardware_type: 'ESP32' });
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [coRes, hwRes] = await Promise.all([
        superAdminService.getCompanies(),
        superAdminService.getHardware()
      ]);
      setCompanies(coRes.data);
      setHardware(hwRes.data);
    } catch (err) { toast.error("Failed to load data"); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await superAdminService.createCompany(newCo);
      toast.success("Company Created!");
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-10 border-b border-slate-700 pb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="text-emerald-500"/> Super Admin Console</h1>
          <button onClick={() => { localStorage.clear(); navigate('/'); }} className="text-red-400 flex items-center gap-2 hover:text-red-300">
            <LogOut size={18}/> Logout
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Company Form */}
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 className="font-bold mb-4 text-emerald-400">🚀 Deploy New Tenant</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <input placeholder="Company Name" className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white" 
                onChange={e => setNewCo({...newCo, name: e.target.value})} />
              <input placeholder="Admin Username" className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white" 
                onChange={e => setNewCo({...newCo, admin_username: e.target.value})} />
              <input placeholder="Admin Password" type="password" className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white" 
                onChange={e => setNewCo({...newCo, admin_pass: e.target.value})} />
              <select className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white"
                onChange={e => setNewCo({...newCo, hardware_type: e.target.value})}>
                <option value="ESP32">ESP32 Device</option>
                <option value="RASPBERRY_PI">Raspberry Pi</option>
              </select>
              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded">Deploy</button>
            </form>
          </div>

          {/* Hardware Status */}
          <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 className="font-bold mb-4 flex items-center gap-2"><Server size={20} className="text-blue-400"/> Hardware Network</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400 bg-slate-900">
                  <tr>
                    <th className="p-3">UID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Tenant</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hardware.map(hw => (
                    <tr key={hw.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                      <td className="p-3 font-mono text-xs">{hw.uid}</td>
                      <td className="p-3">{hw.type}</td>
                      <td className="p-3 text-blue-300">{hw.company}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${hw.status === 'Online' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>{hw.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperDashboard;