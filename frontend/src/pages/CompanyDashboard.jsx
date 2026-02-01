import React, { useState, useEffect } from 'react';
import { companyService } from '../services/api';
import toast from 'react-hot-toast';
import { Users, MapPin, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CompanyDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [newEmp, setNewEmp] = useState({ emp_id: '', name: '', password: '', role: 'normal' });
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await companyService.getEmployees();
      setEmployees(res.data);
    } catch (err) { toast.error("Failed to load data"); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await companyService.addEmployee(newEmp);
      toast.success("Employee Added!");
      loadData();
      setNewEmp({ emp_id: '', name: '', password: '', role: 'normal' });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">🏢 Company Admin Portal</h1>
          <button onClick={() => { localStorage.clear(); navigate('/'); }} className="flex items-center gap-2 text-red-600 font-medium">
            <LogOut size={18} /> Logout
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Employee Form */}
          <div className="bg-white p-6 rounded-xl shadow-sm border h-fit">
            <div className="flex items-center gap-2 mb-4 text-slate-700">
              <Users size={20} /> <h2 className="font-bold">Register Staff</h2>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <input placeholder="ID (EMP-01)" className="w-full border p-2 rounded" 
                value={newEmp.emp_id} onChange={e => setNewEmp({...newEmp, emp_id: e.target.value})} required />
              <input placeholder="Full Name" className="w-full border p-2 rounded" 
                value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} required />
              <input placeholder="Password" type="password" className="w-full border p-2 rounded" 
                value={newEmp.password} onChange={e => setNewEmp({...newEmp, password: e.target.value})} required />
              <select className="w-full border p-2 rounded" 
                value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})}>
                <option value="normal">Office Staff</option>
                <option value="marketing">Field Marketing</option>
              </select>
              <button className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700">Add Employee</button>
            </form>
          </div>

          {/* Employee List */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border">
             <h2 className="font-bold mb-4 text-slate-700">Staff List</h2>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-slate-100 text-slate-600 text-sm">
                   <tr>
                     <th className="p-3 rounded-l-lg">ID</th>
                     <th className="p-3">Name</th>
                     <th className="p-3">Role</th>
                     <th className="p-3 rounded-r-lg">Device Lock</th>
                   </tr>
                 </thead>
                 <tbody>
                   {employees.map(emp => (
                     <tr key={emp.id} className="border-b last:border-0 hover:bg-slate-50">
                       <td className="p-3 font-mono text-sm">{emp.employee_id}</td>
                       <td className="p-3 font-medium">{emp.name}</td>
                       <td className="p-3"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs uppercase font-bold">{emp.role}</span></td>
                       <td className="p-3 text-sm text-slate-400">{emp.device_id ? '🔒 Locked' : '🔓 Open'}</td>
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

export default CompanyDashboard;