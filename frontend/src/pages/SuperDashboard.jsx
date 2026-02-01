import React, { useState, useEffect } from 'react';
import { superAdminService } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Server, Shield, LogOut, Trash2, Settings, Edit2, Power, X, Check } from 'lucide-react';

const SuperDashboard = () => {
  const [companies, setCompanies] = useState([]);
  const [hardware, setHardware] = useState([]);
  const [newCo, setNewCo] = useState({ name: '', admin_username: '', admin_pass: '', plan: 'basic', hardware_type: 'ESP32' });
  
  // Track editing states
  const [editingHw, setEditingHw] = useState(null); 
  const [editingCo, setEditingCo] = useState(null); // ID of company being renamed
  const [tempName, setTempName] = useState("");     // Temp storage for name edit

  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [coRes, hwRes] = await Promise.all([
        superAdminService.getCompanies(),
        superAdminService.getHardware()
      ]);
      // Filter out fully deleted companies
      setCompanies(coRes.data.filter(c => c.status !== 'deleted'));
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

  const handleDelete = async (id) => {
    if(!window.confirm("Permanently delete? This cannot be undone.")) return;
    try {
      await superAdminService.deleteCompany(id);
      toast.success("Company Deleted");
      loadData();
    } catch (err) { toast.error("Delete failed"); }
  };

  // [NEW] Toggle Suspend/Active
  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const action = newStatus === 'active' ? 'Activate' : 'Suspend';
    
    if(!window.confirm(`${action} this company?`)) return;

    try {
      await superAdminService.updateCompany(id, null, newStatus);
      toast.success(`Company ${newStatus}`);
      loadData();
    } catch (err) { toast.error("Status update failed"); }
  };

  // [NEW] Rename Company
  const startEditCompany = (co) => {
    setEditingCo(co.id);
    setTempName(co.name);
  };

  const saveCompany = async (id) => {
    try {
      await superAdminService.updateCompany(id, tempName, null);
      toast.success("Name Updated");
      setEditingCo(null);
      loadData();
    } catch (err) { toast.error("Update failed"); }
  };

  // Hardware Update
  const handleUpdateHardware = async (id, newType) => {
    try {
      await superAdminService.updateHardware(id, newType);
      toast.success("Hardware Updated");
      setEditingHw(null);
      loadData();
    } catch (err) { toast.error("Update failed"); }
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
          {/* Create Form */}
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit">
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

          <div className="lg:col-span-2 space-y-8">
            {/* 1. Companies List */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h2 className="font-bold mb-4 flex items-center gap-2 text-white">🏢 Active Tenants</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-400 bg-slate-900">
                    <tr>
                      <th className="p-3">Company</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map(co => (
                      <tr key={co.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                        {/* Name Column with Edit Logic */}
                        <td className="p-3 font-bold">
                          {editingCo === co.id ? (
                            <div className="flex gap-2">
                              <input 
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white w-32"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                              />
                              <button onClick={() => saveCompany(co.id)} className="text-emerald-400"><Check size={16}/></button>
                              <button onClick={() => setEditingCo(null)} className="text-red-400"><X size={16}/></button>
                            </div>
                          ) : (
                            <span className="flex items-center gap-2">
                              {co.name}
                              <button onClick={() => startEditCompany(co)} className="text-slate-500 hover:text-blue-400"><Edit2 size={12}/></button>
                            </span>
                          )}
                        </td>

                        {/* Status Column */}
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${co.status === 'active' ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'}`}>
                            {co.status.toUpperCase()}
                          </span>
                        </td>

                        {/* Actions: Suspend & Delete */}
                        <td className="p-3 text-right flex justify-end gap-3">
                          <button 
                            onClick={() => handleToggleStatus(co.id, co.status)} 
                            title={co.status === 'active' ? "Suspend Service" : "Activate Service"}
                            className={`${co.status === 'active' ? 'text-amber-400 hover:bg-amber-900/30' : 'text-emerald-400 hover:bg-emerald-900/30'} p-2 rounded`}
                          >
                            <Power size={16} />
                          </button>
                          
                          <button onClick={() => handleDelete(co.id)} className="text-red-400 hover:bg-red-900/50 p-2 rounded" title="Delete Permanently">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Hardware List */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h2 className="font-bold mb-4 flex items-center gap-2 text-blue-400"><Server size={20}/> Hardware Network</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-400 bg-slate-900">
                    <tr>
                      <th className="p-3">UID</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Tenant</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hardware.map(hw => (
                      <tr key={hw.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                        <td className="p-3 font-mono text-xs">{hw.uid}</td>
                        <td className="p-3">
                          {editingHw === hw.id ? (
                            <select 
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                              defaultValue={hw.type}
                              onChange={(e) => handleUpdateHardware(hw.id, e.target.value)}
                            >
                              <option value="ESP32">ESP32</option>
                              <option value="RASPBERRY_PI">RASPBERRY_PI</option>
                              <option value="ZK_DEVICE">ZK_DEVICE</option>
                            </select>
                          ) : hw.type}
                        </td>
                        <td className="p-3 text-blue-300">{hw.company}</td>
                        <td className="p-3">
                          {editingHw === hw.id ? (
                            <button onClick={() => setEditingHw(null)} className="text-slate-400 text-xs">Cancel</button>
                          ) : (
                            <button onClick={() => setEditingHw(hw.id)} className="text-blue-400 hover:text-blue-300 p-1"><Settings size={14}/></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperDashboard;