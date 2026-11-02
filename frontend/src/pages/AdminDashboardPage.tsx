import React, { useState, useEffect } from 'react';
import {
  Users,
  Stethoscope,
  Calendar,
  Ticket,
  Activity,
  Bot,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  UserPlus,
  Shield,
  Clock,
  Sparkles,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { apiFetch } from '../api/client.js';

export const AdminDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'doctors' | 'patients' | 'appointments' | 'agents'>('overview');
  const [data, setData] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');

  // Add Doctor Modal
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [doctorForm, setDoctorForm] = useState({
    name: '',
    email: '',
    password: 'password123',
    departmentId: '',
    specialization: '',
    licenseNumber: '',
    consultationFee: 150,
    bio: '',
  });

  // Assign Patient Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [assignedDoctorId, setAssignedDoctorId] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, docsData, deptsData, patientsData, apptsData, agentsData] = await Promise.all([
        apiFetch('/api/admin/overview'),
        apiFetch('/api/admin/doctors'),
        apiFetch('/api/admin/departments'),
        apiFetch('/api/patients?limit=50'),
        apiFetch('/api/appointments?limit=50'),
        apiFetch('/api/admin/ai-agents'),
      ]);

      setData(overviewData);
      setDoctors(docsData);
      setDepartments(deptsData);
      setPatients(patientsData.patients || []);
      setAppointments(apptsData.appointments || apptsData || []);
      setAgents(agentsData);
      if (deptsData.length > 0 && !doctorForm.departmentId) {
        setDoctorForm((prev) => ({ ...prev, departmentId: deptsData[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/doctors', {
        method: 'POST',
        body: JSON.stringify({
          ...doctorForm,
          consultationFee: Number(doctorForm.consultationFee),
        }),
      });
      setShowAddDoctor(false);
      setDoctorForm({
        name: '',
        email: '',
        password: 'password123',
        departmentId: departments[0]?.id || '',
        specialization: '',
        licenseNumber: '',
        consultationFee: 150,
        bio: '',
      });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleDoctorStatus = async (id: string, currentStatus: boolean) => {
    try {
      await apiFetch(`/api/admin/doctors/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAssignPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !assignedDoctorId) return;
    try {
      await apiFetch('/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: assignedDoctorId,
          patientId: selectedPatient.id,
          notes: assignmentNotes,
          active: true,
        }),
      });
      setShowAssignModal(false);
      setSelectedPatient(null);
      setAssignmentNotes('');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>Administrative Command</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Admin Operations Dashboard</h1>
          <p className="text-xs text-slate-500">Real-time clinical governance, doctor scheduling, and AI agent observability</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAddDoctor(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Doctor</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { key: 'overview', label: 'Hospital Overview', icon: Activity },
          { key: 'doctors', label: `Doctors (${doctors.length})`, icon: Stethoscope },
          { key: 'patients', label: `Patients (${patients.length})`, icon: Users },
          { key: 'appointments', label: `Appointments (${appointments.length})`, icon: Calendar },
          { key: 'agents', label: 'AI Agent Traces', icon: Bot },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer border-b-2 -mb-[2px] ${
                activeTab === tab.key
                  ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && data && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">Total Doctors</span>
              <span className="text-2xl font-black text-slate-800">{data.metrics.totalDoctors}</span>
              <span className="text-[10px] text-emerald-600 block mt-0.5">{data.metrics.activeDoctors} Active</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">Total Patients</span>
              <span className="text-2xl font-black text-slate-800">{data.metrics.totalPatients}</span>
              <span className="text-[10px] text-blue-600 block mt-0.5">Verified MRN profiles</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">Today's Appts</span>
              <span className="text-2xl font-black text-purple-700">{data.metrics.todayAppointments}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{data.metrics.upcomingAppointments} Upcoming</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">Completed</span>
              <span className="text-2xl font-black text-emerald-600">{data.metrics.completedAppointments}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Clinical encounters</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">Open Tickets</span>
              <span className="text-2xl font-black text-amber-600">{data.metrics.openTickets}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Care Coordinator queue</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">AI Tool Success</span>
              <span className="text-2xl font-black text-blue-600">{data.metrics.agentSuccessRate}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{data.metrics.agentExecutionsCount} total runs</span>
            </div>
          </div>

          {/* Clinical Departments Summary */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-purple-600" />
              <span>Hospital Department Coverage</span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {data.departments.map((dept: any) => (
                <div key={dept.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-slate-800 block">{dept.name}</span>
                  <span className="text-[11px] text-slate-500 block">Code: {dept.code}</span>
                  <span className="text-xs font-semibold text-purple-700 mt-1 block">
                    {dept.doctorCount} Doctors
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent AI Recommendations & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span>Recent AI Doctor Recommendations</span>
                </span>
                <span className="text-[11px] text-slate-400 font-normal">Real-time triage</span>
              </h2>
              <div className="space-y-2.5">
                {data.recentRecommendations.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No recommendations logged yet.</p>
                ) : (
                  data.recentRecommendations.map((r: any) => (
                    <div key={r.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>{r.patientName}</span>
                        <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px]">
                          {r.specialty}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] mt-1 line-clamp-1 italic">"{r.symptom}"</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                        <span>Doctor: {r.selectedDoctor}</span>
                        <span className="uppercase font-bold">{r.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-600" />
                  <span>Recent Agent Tool Executions</span>
                </span>
                <span className="text-[11px] text-slate-400 font-normal">Audit trail</span>
              </h2>
              <div className="space-y-2.5">
                {data.recentActivity.slice(0, 5).map((e: any) => (
                  <div key={e.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span className="text-purple-700">{e.agentName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {e.status}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] mt-1 truncate">{e.prompt}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span>{e.toolCount} tools called</span>
                      <span>{e.durationMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOCTORS MANAGEMENT */}
      {activeTab === 'doctors' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Hospital Medical Staff Directory</h2>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search doctors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Doctor Name</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Specialization</th>
                  <th className="px-4 py-3">License No.</th>
                  <th className="px-4 py-3">Consult Fee</th>
                  <th className="px-4 py-3">Assigned Patients</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {doctors
                  .filter((d) =>
                    !searchTerm ||
                    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    d.specialization.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    d.department.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {doc.name}
                        <span className="block text-[10px] text-slate-400 font-normal">{doc.email}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600">{doc.department}</td>
                      <td className="px-4 py-3 text-slate-600">{doc.specialization}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{doc.licenseNumber}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">${doc.consultationFee}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                          {doc.assignedPatientsCount} patients
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          doc.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {doc.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleToggleDoctorStatus(doc.id, doc.isActive)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                            doc.isActive
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {doc.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PATIENTS & ASSIGNMENTS */}
      {activeTab === 'patients' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Registered Patient Records & Care Assignments</h2>
            <span className="text-xs text-slate-500">{patients.length} Registered Patients</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Patient Name</th>
                  <th className="px-4 py-3">MRN Number</th>
                  <th className="px-4 py-3">Gender / DOB</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Total Appts</th>
                  <th className="px-4 py-3 text-right">Assign Doctor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {patients.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {p.name}
                      <span className="block text-[10px] text-slate-400 font-normal">{p.email}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-purple-700 font-bold">{p.mrn}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.gender} • {p.dateOfBirth}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.phone}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                        {p.counts?.appointments || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedPatient(p);
                          setAssignedDoctorId(doctors[0]?.id || '');
                          setShowAssignModal(true);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-[11px] transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Assign Doctor</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Hospital Scheduling Log</h2>
            <span className="text-xs text-slate-500">Live PostgreSQL Rows</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {appointments.slice(0, 30).map((a: any) => (
                  <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{a.patientName || a.patient?.user?.name}</td>
                    <td className="px-4 py-3 text-slate-700">{a.doctorName || a.doctor?.user?.name}</td>
                    <td className="px-4 py-3 text-slate-500">{a.department || a.doctor?.department?.name}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {new Date(a.startTime).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-xs">{a.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === 'CONFIRMED' || a.status === 'SCHEDULED'
                          ? 'bg-blue-50 text-blue-700'
                          : a.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: AI AGENT OBSERVABILITY */}
      {activeTab === 'agents' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {agents.map((ag) => (
              <div key={ag.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-slate-800">{ag.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                      {ag.successRate}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">{ag.description}</p>
                  <div className="text-[10px] text-slate-400 font-mono mb-3">
                    ID: {ag.id}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-medium">
                  <span>Executions: {ag.totalExecutions}</span>
                  <span className="text-emerald-600">{ag.successCount} OK</span>
                  {ag.failureCount > 0 && <span className="text-rose-600">{ag.failureCount} Fail</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ADD DOCTOR */}
      {showAddDoctor && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-1">Add Medical Doctor</h3>
            <p className="text-xs text-slate-500 mb-4">Creates practitioner user account, clinical profile, and weekly schedules.</p>

            <form onSubmit={handleCreateDoctor} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Doctor Name *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.name}
                    onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
                    placeholder="Dr. Alexander Wright"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={doctorForm.email}
                    onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                    placeholder="dr.wright@hospital.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department *</label>
                  <select
                    value={doctorForm.departmentId}
                    onChange={(e) => setDoctorForm({ ...doctorForm, departmentId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Specialization *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.specialization}
                    onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                    placeholder="Pediatric Cardiology"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">License Number *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.licenseNumber}
                    onChange={(e) => setDoctorForm({ ...doctorForm, licenseNumber: e.target.value })}
                    placeholder="MED-CARD-991"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Consultation Fee ($) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={doctorForm.consultationFee}
                    onChange={(e) => setDoctorForm({ ...doctorForm, consultationFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinical Biography (Optional)</label>
                <textarea
                  rows={2}
                  value={doctorForm.bio}
                  onChange={(e) => setDoctorForm({ ...doctorForm, bio: e.target.value })}
                  placeholder="Specialty expertise, certifications, and clinical experience..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddDoctor(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold cursor-pointer shadow-sm"
                >
                  Save Doctor Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN PATIENT TO DOCTOR */}
      {showAssignModal && selectedPatient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-1">Assign Patient to Doctor</h3>
            <p className="text-xs text-slate-500 mb-4">
              Authorize clinical access relationship for <span className="font-semibold text-slate-800">{selectedPatient.name}</span> ({selectedPatient.mrn}).
            </p>

            <form onSubmit={handleAssignPatient} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Attending Specialist *</label>
                <select
                  required
                  value={assignedDoctorId}
                  onChange={(e) => setAssignedDoctorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {doctors.filter((d) => d.isActive).map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} — {doc.department} ({doc.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Care Coordination Notes</label>
                <textarea
                  rows={3}
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  placeholder="e.g. Primary attending physician for cardiovascular rehabilitation follow-up."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold cursor-pointer shadow-sm"
                >
                  Confirm Care Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
