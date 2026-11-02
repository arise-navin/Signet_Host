import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Stethoscope,
  Users,
  Calendar,
  Clock,
  FileText,
  FlaskConical,
  Bot,
  Search,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../api/client.js';

export const DoctorDashboardPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientModal, setSelectedPatientModal] = useState<any>(null);

  const loadDoctorData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/doctor/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctorData();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
        <h2 className="font-bold mb-1 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>Doctor Portal Access Error</span>
        </h2>
        <p>{error}</p>
      </div>
    );
  }

  const { profile, metrics, todayAppointments, upcomingAppointments, assignedPatients, pendingLabReports } = data;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-6 font-sans">
      {/* Doctor Profile Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-lg shadow-emerald-600/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-bold text-2xl shadow-inner">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-black">{profile.name}</h1>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold tracking-wide">
                {profile.licenseNumber}
              </span>
            </div>
            <p className="text-emerald-100 text-xs font-medium">
              {profile.specialization} • Department of {profile.department}
            </p>
            <p className="text-[11px] text-emerald-200/80 mt-1">
              Standard Consultation: ${profile.consultationFee} • Active License
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/chat"
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <Bot className="w-4 h-4 text-emerald-600" />
            <span>AI Clinical Assistant</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Today's Visits</span>
          <span className="text-2xl font-black text-emerald-700">{metrics.todayAppointmentsCount}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Scheduled for today</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Assigned Patients</span>
          <span className="text-2xl font-black text-slate-800">{metrics.assignedPatientsCount}</span>
          <span className="text-[10px] text-emerald-600 block mt-0.5">Active care relationships</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Upcoming</span>
          <span className="text-2xl font-black text-blue-600">{metrics.upcomingCount}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Future appointments</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Completed</span>
          <span className="text-2xl font-black text-purple-700">{metrics.completedCount}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Total encounters</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Today's Schedule & Assigned Patients */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Appointments */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Today's Consultation Schedule</span>
              </span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                {todayAppointments.length} Appointments Today
              </span>
            </h2>

            {todayAppointments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No consultations scheduled for today. Check upcoming appointments below.
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments.map((appt: any) => (
                  <div
                    key={appt.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs hover:border-emerald-200 transition-colors"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800 text-sm">{appt.patientName}</span>
                        <span className="font-mono text-[10px] text-slate-500 font-semibold">{appt.patientMrn}</span>
                      </div>
                      <p className="text-slate-600 text-xs mt-1 font-medium">{appt.reason}</p>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {new Date(appt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {new Date(appt.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span>• Phone: {appt.patientPhone}</span>
                      </div>
                    </div>
                    <div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                        {appt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Patients Directory */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>My Assigned Patients ({assignedPatients.length})</span>
              </h2>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter patients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-2.5 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-2.5">Patient</th>
                    <th className="px-3 py-2.5">MRN</th>
                    <th className="px-3 py-2.5">Gender</th>
                    <th className="px-3 py-2.5">Blood</th>
                    <th className="px-3 py-2.5">Chronic Context</th>
                    <th className="px-3 py-2.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {assignedPatients
                    .filter((p: any) =>
                      !searchTerm ||
                      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      p.mrn.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((pat: any) => (
                      <tr key={pat.patientId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{pat.name}</td>
                        <td className="px-3 py-2.5 font-mono text-emerald-700 font-bold">{pat.mrn}</td>
                        <td className="px-3 py-2.5 text-slate-500">{pat.gender}</td>
                        <td className="px-3 py-2.5 text-slate-600">{pat.bloodGroup || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-500 truncate max-w-xs">{pat.chronicConditions || 'None'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => setSelectedPatientModal(pat)}
                            className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-[11px] cursor-pointer"
                          >
                            View Card
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Weekly Schedule & Pending Lab Reviews */}
        <div className="space-y-6">
          {/* Weekly Schedule */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Weekly Availability</span>
            </h2>
            <div className="space-y-2 text-xs">
              {profile.schedules.map((s: any) => (
                <div key={s.id} className="p-2.5 rounded-xl bg-slate-50 flex items-center justify-between border border-slate-100">
                  <span className="font-semibold text-slate-700">{dayNames[s.dayOfWeek]}</span>
                  <span className="font-mono text-emerald-700 text-[11px] font-semibold">
                    {s.startTime} - {s.endTime} ({s.slotMinutes}m)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Diagnostic Reviews */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-amber-600" />
                <span>Pending Lab Reviews</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                {pendingLabReports.length} Pending
              </span>
            </h2>

            {pendingLabReports.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No pending lab reviews.</p>
            ) : (
              <div className="space-y-2.5">
                {pendingLabReports.map((l: any) => (
                  <div key={l.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span>{l.patientName}</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] uppercase font-bold">
                        {l.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">{l.testName}</p>
                    <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                      MRN: {l.mrn}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Patient Detail Modal */}
      {selectedPatientModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <h3 className="text-base font-bold text-slate-800 mb-1">{selectedPatientModal.name}</h3>
            <p className="font-mono text-emerald-700 font-bold mb-4">{selectedPatientModal.mrn}</p>

            <div className="space-y-2.5 border-t border-b border-slate-100 py-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Gender / Blood:</span>
                <span className="font-semibold text-slate-800">
                  {selectedPatientModal.gender} • {selectedPatientModal.bloodGroup || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <span className="font-semibold text-slate-800">{selectedPatientModal.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Known Allergies:</span>
                <span className="font-semibold text-rose-600">{selectedPatientModal.allergies || 'None known'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Chronic Conditions:</span>
                <span className="font-semibold text-slate-800">{selectedPatientModal.chronicConditions || 'None'}</span>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setSelectedPatientModal(null)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
