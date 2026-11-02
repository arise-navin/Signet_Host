import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  UserCheck,
  Calendar,
  Pill,
  FileText,
  Ticket,
  Bot,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Stethoscope,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Search,
  Plus,
} from 'lucide-react';
import { api, apiFetch } from '../api/client.js';

export const PatientDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'symptom_ai' | 'appointments' | 'doctors' | 'prescriptions' | 'labs' | 'tickets'>('symptom_ai');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 7: Health Issue Submission State
  const [symptomInput, setSymptomInput] = useState('');
  const [submittingSymptom, setSubmittingSymptom] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<any>(null);
  const [selectedDoctorForBooking, setSelectedDoctorForBooking] = useState<any>(null);
  const queryClient = useQueryClient();
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.getHealth });
  const [bookingDate, setBookingDate] = useState<string>('');
  const { data: slots, isFetching: slotsLoading, error: slotsError } = useQuery({
    queryKey: ['doctorSlots', selectedDoctorForBooking?.id, bookingDate],
    queryFn: () => api.getDoctorSlots(selectedDoctorForBooking.id, bookingDate),
    enabled: Boolean(selectedDoctorForBooking && bookingDate),
  });
  const availableSlots: string[] = slots?.slots ?? [];
  useEffect(() => { if (health?.hospitalTomorrow) setBookingDate(health.hospitalTomorrow); }, [health?.hospitalTomorrow]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<any>(null);

  const loadPatientData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/patient/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatientData();
  }, []);

  const handleSymptomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptomInput.trim()) return;
    setSubmittingSymptom(true);
    setAiRecommendation(null);
    setSelectedDoctorForBooking(null);
    setBookingSuccess(null);
    try {
      const res = await apiFetch('/api/patient/symptoms/submit', {
        method: 'POST',
        body: JSON.stringify({ description: symptomInput }),
      });
      setAiRecommendation(res);
      if (res.doctors && res.doctors.length > 0) {
        handleDoctorSelect(res.doctors[0]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingSymptom(false);
    }
  };

  const handleDoctorSelect = (doctor: { id: string; name: string }): void => {
    setSelectedDoctorForBooking(doctor);
    setSelectedSlot('');
  };

  const handleBookRecommendedAppointment = async () => {
    if (!aiRecommendation || !selectedDoctorForBooking || !selectedSlot) return;
    setBookingLoading(true);
    try {
      const res = await apiFetch(`/api/patient/symptoms/${aiRecommendation.recommendationId}/book`, {
        method: 'POST',
        body: JSON.stringify({
          doctorId: selectedDoctorForBooking.id,
          startTime: selectedSlot,
          reason: symptomInput,
        }),
      });
      setBookingSuccess(res);
      await Promise.all(['appointments', 'patients', 'patientDetail', 'doctorSlots', 'dashboardStats'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      await loadPatientData();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
        <h2 className="font-bold mb-1">Patient Portal Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  const { profile, metrics, upcomingAppointments, pastAppointments, assignedDoctors, prescriptions, labReports, supportTickets, symptomRequests } = data;

  return (
    <div className="space-y-6 font-sans">
      {/* Patient Profile Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-sky-600 to-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-blue-500/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-bold text-2xl shadow-inner">
            <UserCheck className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-black">{profile.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-mono text-xs font-bold tracking-wide">
                {profile.mrn}
              </span>
            </div>
            <p className="text-blue-100 text-xs font-medium mt-0.5">
              DOB: {profile.dateOfBirth} • Blood Group: {profile.bloodGroup || 'Not recorded'} • {profile.gender}
            </p>
            <p className="text-[11px] text-blue-200/80 mt-1">
              Allergies: <span className="font-semibold">{profile.allergies || 'None known'}</span> • Conditions: <span className="font-semibold">{profile.chronicConditions || 'None'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/chat"
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white text-blue-800 hover:bg-blue-50 font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <Bot className="w-4 h-4 text-blue-600" />
            <span>AI Symptom Concierge</span>
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { key: 'symptom_ai', label: 'Describe Health Issue (AI Triage)', icon: Sparkles, highlight: true },
          { key: 'appointments', label: `My Appointments (${upcomingAppointments.length})`, icon: Calendar },
          { key: 'doctors', label: `Assigned Doctors (${assignedDoctors.length})`, icon: Stethoscope },
          { key: 'prescriptions', label: `Prescriptions (${prescriptions.length})`, icon: Pill },
          { key: 'labs', label: `Lab Reports (${labReports.length})`, icon: FileText },
          { key: 'tickets', label: `Support Tickets (${supportTickets.length})`, icon: Ticket },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              } ${tab.highlight && activeTab !== tab.key ? 'text-sky-700 font-semibold' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PHASE 7 AI DOCTOR RECOMMENDATION WORKFLOW */}
      {activeTab === 'symptom_ai' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
            <div className="max-w-3xl">
              <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>AI Clinical Specialty Triage</span>
              </div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">
                Describe Your Health Concern in Natural Language
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Enter your symptoms or what you are experiencing. Our clinical AI model will suggest the appropriate hospital department, match verified physicians from the PostgreSQL database, and let you confirm an appointment immediately.
              </p>

              {/* Symptom Input Form */}
              <form onSubmit={handleSymptomSubmit} className="space-y-4">
                <div>
                  <textarea
                    rows={3}
                    required
                    value={symptomInput}
                    onChange={(e) => setSymptomInput(e.target.value)}
                    placeholder="e.g. I have recurring chest discomfort after climbing stairs and want to consult a specialist..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">Quick examples:</span>
                  {[
                    'Recurring chest tightness and exertional shortness of breath',
                    'Severe throbbing migraine with vision aura',
                    'Chronic knee joint pain and stiffness when walking',
                    'Persistent infant cough and fever',
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSymptomInput(example)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      {example.slice(0, 35)}...
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={submittingSymptom || !symptomInput.trim()}
                  className={`px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center space-x-2 transition-all cursor-pointer ${
                    submittingSymptom ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{submittingSymptom ? 'Analyzing Symptoms...' : 'Analyze & Recommend Specialists'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* AI Recommendation Result */}
          {aiRecommendation && (
            <div className="bg-white p-6 rounded-3xl border border-blue-200 shadow-md space-y-6 animate-in fade-in">
              {/* Emergency Banner if flagged */}
              {aiRecommendation.urgencyFlag && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 flex items-start space-x-3">
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold block text-sm">EMERGENCY MEDICAL WARNING</span>
                    <p className="mt-0.5">
                      Your described symptoms suggest a potentially urgent medical condition. If you are experiencing crushing chest pain, difficulty breathing, or stroke symptoms, please dial 911 or visit the nearest emergency department immediately.
                    </p>
                  </div>
                </div>
              )}

              {/* Triage Summary */}
              <div className="p-5 rounded-2xl bg-blue-50/60 border border-blue-100">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Recommended Specialty:</span>
                  <span className="px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-black shadow-xs">
                    {aiRecommendation.recommendedSpecialty}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {aiRecommendation.aiRationale}
                </p>
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  {aiRecommendation.disclaimer}
                </p>
              </div>

              {/* Candidate Doctors */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-blue-600" />
                  <span>Matching Specialists from Database ({aiRecommendation.doctors.length})</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiRecommendation.doctors.map((doc: any) => (
                    <div
                      key={doc.id}
                      onClick={() => handleDoctorSelect(doc)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        selectedDoctorForBooking?.id === doc.id
                          ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-slate-800">{doc.name}</span>
                          <span className="font-mono text-xs font-black text-blue-700">
                            ${doc.consultationFee}
                          </span>
                        </div>
                        <p className="text-xs text-blue-600 font-medium">{doc.specialization}</p>
                        <p className="text-[11px] text-slate-500 mt-1">Department of {doc.department}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">{doc.licenseNumber}</span>
                        <span className="font-bold text-blue-600 flex items-center gap-1">
                          {selectedDoctorForBooking?.id === doc.id ? 'Selected' : 'Select Doctor'}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Slot Picker & Confirmation */}
              {selectedDoctorForBooking && !bookingSuccess && (
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Confirm Appointment with {selectedDoctorForBooking.name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Choose an available slot for clinical consultation
                      </span>
                    </div>
                  </div>

                  <label className="block text-xs text-slate-700">
                    Appointment date
                    <input type="date" data-testid="ai-booking-date" value={bookingDate} min={health?.hospitalToday}
                      onChange={(event) => { setBookingDate(event.target.value); setSelectedSlot(''); }}
                      className="block mt-1 border border-slate-200 rounded-lg p-2" />
                  </label>
                  {slotsError ? <p role="alert" className="text-xs text-rose-600">{slotsError.message}</p> : slotsLoading ? (
                    <p className="text-xs text-slate-400">Loading available slots...</p>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-xs text-slate-500">No available slots on this date. Choose another date.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          data-testid={`ai-booking-slot-${slot}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                            selectedSlot === slot
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400'
                          }`}
                        >
                          {new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    data-testid="ai-booking-confirm"
                    onClick={handleBookRecommendedAppointment}
                    disabled={bookingLoading || slotsLoading || !selectedSlot || !availableSlots.includes(selectedSlot)}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {bookingLoading ? (
                      <span>Confirming Booking...</span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm Appointment Booking</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Booking Success Confirmation */}
              {bookingSuccess && (
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Appointment Confirmed!</span>
                  </div>
                  <p className="text-xs">
                    Your appointment with <span className="font-semibold">{bookingSuccess.appointment.doctorName}</span> has been confirmed for{' '}
                    <span className="font-semibold">
                      {new Date(bookingSuccess.appointment.startTime).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>.
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    This booking has been persisted in your appointment schedule and linked to your symptom recommendation history.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Upcoming Consultations</span>
            </h2>

            {upcomingAppointments.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No upcoming appointments scheduled.</p>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((a: any) => (
                  <div key={a.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800 text-sm">{a.doctorName}</span>
                        <span className="text-slate-500">({a.specialization})</span>
                      </div>
                      <p className="text-slate-600 text-xs mt-1">{a.reason}</p>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-1 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(a.startTime).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ASSIGNED DOCTORS */}
      {activeTab === 'doctors' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-blue-600" />
            <span>My Care Team & Assigned Specialists</span>
          </h2>

          {assignedDoctors.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No doctors assigned yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedDoctors.map((doc: any) => (
                <div key={doc.doctorId} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                  <span className="font-bold text-sm text-slate-800 block">{doc.name}</span>
                  <span className="text-blue-600 font-semibold block">{doc.specialization} • {doc.department}</span>
                  <p className="text-slate-500 text-[11px] mt-2">{doc.notes || 'Primary clinical care relationship'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PRESCRIPTIONS */}
      {activeTab === 'prescriptions' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Pill className="w-4 h-4 text-blue-600" />
            <span>Active Prescriptions & Medications</span>
          </h2>

          {prescriptions.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No active prescriptions.</p>
          ) : (
            <div className="space-y-3">
              {prescriptions.map((p: any) => (
                <div key={p.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-sm text-slate-800">{p.medication} ({p.dosage})</span>
                    <p className="text-slate-600 mt-1">{p.frequency} • {p.instructions}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">Prescribed by {p.doctorName}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Active
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: LAB REPORTS */}
      {activeTab === 'labs' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>Diagnostic Laboratory Reports</span>
          </h2>

          {labReports.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No lab reports available.</p>
          ) : (
            <div className="space-y-3">
              {labReports.map((l: any) => (
                <div key={l.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-slate-800">{l.testName}</span>
                      <span className="font-mono text-[11px] text-slate-400 ml-2">({l.testCode})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                      {l.status}
                    </span>
                  </div>
                  <p className="text-slate-600">{l.clinicalSummary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: SUPPORT TICKETS */}
      {activeTab === 'tickets' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-blue-600" />
            <span>Care Coordinator Inquiries & Tickets</span>
          </h2>

          {supportTickets.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No open support tickets.</p>
          ) : (
            <div className="space-y-3">
              {supportTickets.map((t: any) => (
                <div key={t.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-700">{t.ticketNumber}</span>
                    <span className="font-semibold text-slate-800 ml-2">{t.subject}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">Category: {t.category}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    t.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
