import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Search,
  FileText,
  FlaskConical,
  Calendar,
  Pill,
  ShieldAlert,
  X,
  AlertCircle,
  Eye,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { api } from '../api/client.js';

export const PatientsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['patients', searchTerm],
    queryFn: () => api.getPatients({ search: searchTerm || undefined, limit: 50 }),
  });

  const { data: detailData, isLoading: isDetailLoading, error: detailError } = useQuery({
    queryKey: ['patientDetail', selectedPatientId],
    queryFn: () => (selectedPatientId ? api.getPatientDetail(selectedPatientId) : null),
    enabled: Boolean(selectedPatientId),
  });

  const [activeTab, setActiveTab] = useState<'records' | 'labs' | 'appointments' | 'prescriptions'>('records');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Hospital Patient Directory</h2>
          <p className="text-xs text-slate-500">
            Authorized patient profiles, synthetic clinical records, lab reports, and appointment history
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by MRN, name, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Patient Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-600">
            Error loading patients: {(error as any)?.message}
          </div>
        ) : data?.patients.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No patient records matched your search query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3.5">MRN</th>
                  <th className="px-5 py-3.5">Patient Name</th>
                  <th className="px-5 py-3.5">Gender / DOB</th>
                  <th className="px-5 py-3.5">Blood Group</th>
                  <th className="px-5 py-3.5">Allergies</th>
                  <th className="px-5 py-3.5">Clinical Records</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.patients.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-slate-800 font-medium">{p.mrn}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{p.name}</div>
                      <div className="text-[11px] text-slate-400">{p.email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div>{p.gender}</div>
                      <div className="text-[11px] text-slate-400">{p.dateOfBirth}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                        {p.bloodGroup || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${p.allergies?.includes('None') ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {p.allergies || 'None'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span title="Medical Records">{p.counts?.medicalRecords || 0} notes</span>
                        <span>•</span>
                        <span title="Lab Reports">{p.counts?.labReports || 0} labs</span>
                        <span>•</span>
                        <span title="Appointments">{p.counts?.appointments || 0} appts</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedPatientId(p.id)}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-semibold text-xs transition-colors inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View File
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Patient Detail Modal */}
      {selectedPatientId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-start justify-between bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-800">{detailData?.name || 'Loading Patient...'}</h3>
                  {detailData?.mrn && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
                      {detailData.mrn}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {detailData?.gender} • Born {detailData?.dateOfBirth} • Blood: {detailData?.bloodGroup} • Phone: {detailData?.phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedPatientId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {isDetailLoading ? (
                <div className="p-12 flex justify-center">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : detailError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>{(detailError as any)?.message || 'Failed to load details'}</span>
                </div>
              ) : (
                <>
                  {/* Demographics & Clinical Alerts Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs">
                      <p className="font-bold text-amber-800 uppercase tracking-wider text-[10px] mb-1">Documented Allergies</p>
                      <p className="text-amber-900 font-medium">{detailData?.allergies || 'No allergies recorded'}</p>
                    </div>
                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs">
                      <p className="font-bold text-blue-800 uppercase tracking-wider text-[10px] mb-1">Chronic Conditions</p>
                      <p className="text-blue-900 font-medium">{detailData?.chronicConditions || 'None reported'}</p>
                    </div>
                  </div>

                  {/* Clinical Access Restriction Warning (if Receptionist) */}
                  {detailData?.clinicalAccessDenied && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Clinical Records Restricted for Front-Desk Role</p>
                        <p className="mt-0.5 text-amber-700">
                          {detailData.clinicalAccessNotice || 'Receptionists do not have authorization to view diagnostic evaluations or laboratory results.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Tabs */}
                  <div className="border-b border-slate-200 flex gap-4 text-xs font-semibold">
                    <button
                      onClick={() => setActiveTab('records')}
                      className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeTab === 'records' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Medical Records ({detailData?.medicalRecords?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('labs')}
                      className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeTab === 'labs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FlaskConical className="w-3.5 h-3.5" />
                      Lab Reports ({detailData?.labReports?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('appointments')}
                      className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeTab === 'appointments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Appointments ({detailData?.appointments?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('prescriptions')}
                      className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeTab === 'prescriptions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Pill className="w-3.5 h-3.5" />
                      Prescriptions ({detailData?.prescriptions?.length || 0})
                    </button>
                  </div>

                  {/* Tab 1: Medical Records */}
                  {activeTab === 'records' && (
                    <div className="space-y-4">
                      {detailData?.medicalRecords?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6 text-center">No authorized clinical records accessible.</p>
                      ) : (
                        detailData?.medicalRecords?.map((rec: any) => (
                          <div key={rec.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-slate-800 text-sm">{rec.title}</span>
                              <span className="text-[11px] text-slate-400">{rec.date}</span>
                            </div>
                            <p className="text-slate-500 font-medium mb-2">Attending: {rec.doctorName}</p>
                            <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-100 leading-relaxed font-sans">
                              {rec.content}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab 2: Lab Reports */}
                  {activeTab === 'labs' && (
                    <div className="space-y-4">
                      {detailData?.labReports?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6 text-center">No authorized laboratory reports found.</p>
                      ) : (
                        detailData?.labReports?.map((lab: any) => (
                          <div key={lab.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="font-bold text-slate-800 text-sm">{lab.testName}</span>
                                <span className="ml-2 font-mono text-[10px] text-slate-400">({lab.testCode})</span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {lab.status}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-500 mb-2">Reference Range: {lab.normalRange}</p>

                            <div className="bg-white rounded-lg border border-slate-200 p-3 mb-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Measured Values</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {Object.entries(lab.resultValues || {}).map(([key, val]) => (
                                  <div key={key} className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                                    <span className="font-mono font-medium text-slate-800">{String(val)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {lab.clinicalSummary && (
                              <p className="text-[11px] text-slate-600 italic">
                                Summary: {lab.clinicalSummary}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab 3: Appointments */}
                  {activeTab === 'appointments' && (
                    <div className="divide-y divide-slate-100">
                      {detailData?.appointments?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6 text-center">No appointment history found.</p>
                      ) : (
                        detailData?.appointments?.map((a: any) => (
                          <div key={a.id} className="py-3 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{a.doctorName} ({a.department})</p>
                              <p className="text-slate-500">{a.reason}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{new Date(a.startTime).toLocaleString()}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                              {a.status}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab 4: Prescriptions */}
                  {activeTab === 'prescriptions' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {detailData?.prescriptions?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6 text-center col-span-2">No active prescriptions.</p>
                      ) : (
                        detailData?.prescriptions?.map((p: any) => (
                          <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-slate-800">{p.medication}</span>
                              <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                                {p.dosage}
                              </span>
                            </div>
                            <p className="text-slate-600 mb-1">{p.frequency}</p>
                            <p className="text-[11px] text-slate-400">Prescribed by {p.prescribedBy}</p>
                            {p.instructions && (
                              <p className="text-[10px] text-slate-500 mt-1 italic">{p.instructions}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
