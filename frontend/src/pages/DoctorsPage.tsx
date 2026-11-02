import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Stethoscope,
  Search,
  Calendar,
  Clock,
  DollarSign,
  Award,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api/client.js';

export const DoctorsPage: React.FC = () => {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.getHealth });
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeDoctorForSlots, setActiveDoctorForSlots] = useState<any | null>(null);
  const [slotDate, setSlotDate] = useState<string>('');
  useEffect(() => { if (health?.hospitalTomorrow) setSlotDate(health.hospitalTomorrow); }, [health?.hospitalTomorrow]);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [bookingReason, setBookingReason] = useState('Routine clinical consultation');

  const queryClient = useQueryClient();

  const { data: doctors, isLoading, error } = useQuery({
    queryKey: ['doctors', selectedDept, searchTerm],
    queryFn: () => api.getDoctors({ department: selectedDept || undefined, search: searchTerm || undefined }),
  });

  const { data: slotData, isLoading: isSlotsLoading } = useQuery({
    queryKey: ['doctorSlots', activeDoctorForSlots?.id, slotDate],
    queryFn: () => (activeDoctorForSlots ? api.getDoctorSlots(activeDoctorForSlots.id, slotDate) : null),
    enabled: Boolean(activeDoctorForSlots && slotDate),
  });

  const bookMutation = useMutation({
    mutationFn: api.bookAppointment,
    onSuccess: (res: any) => {
      setBookingSuccess(res.message || 'Appointment successfully booked!');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patientDetail'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['doctorSlots'] });
    },
  });

  const { data: allDoctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: () => api.getDoctors({}),
  });
  const departments: string[] = [...new Set<string>((allDoctors ?? []).map((doctor: { department: string }) => doctor.department))];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Hospital Medical Faculty</h2>
          <p className="text-xs text-slate-500">Browse hospital specialists and their available appointments</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search doctor or specialty..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Department Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedDept('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            selectedDept === '' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Specialties
        </button>
        {departments.map((dept) => (
          <button
            key={dept}
            onClick={() => setSelectedDept(dept)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedDept === dept ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {dept}
          </button>
        ))}
      </div>

      {/* Doctors Grid */}
      {isLoading ? (
        <div className="p-12 flex justify-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="p-6 text-center text-xs text-rose-600">Error loading doctors.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {doctors?.map((doc: any) => (
            <div
              key={doc.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    {doc.department}
                  </span>
                </div>

                <h3 className="font-bold text-slate-800 text-base">{doc.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{doc.specialization}</p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Award className="w-3.5 h-3.5" /> License
                    </span>
                    <span className="font-mono text-slate-700 font-medium">{doc.licenseNumber}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <DollarSign className="w-3.5 h-3.5" /> Consultation Fee
                    </span>
                    <span className="font-semibold text-slate-800">${doc.consultationFee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-start justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
                      <Clock className="w-3.5 h-3.5" /> Hours
                    </span>
                    <span className="text-right text-[11px] text-slate-500">
                      Mon-Fri 09:00 - 17:00 (30m)
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveDoctorForSlots(doc);
                  setBookingSuccess(null);
                }}
                className="mt-5 w-full py-2 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                Check Available Slots
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Available Slots Modal */}
      {activeDoctorForSlots && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Doctor Availability: {activeDoctorForSlots.name}
                </h3>
                <p className="text-xs text-slate-500">{activeDoctorForSlots.department} • {activeDoctorForSlots.specialization}</p>
              </div>
              <button
                onClick={() => {
                  setActiveDoctorForSlots(null);
                  setBookingSuccess(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Date Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Date</label>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => {
                    setSlotDate(e.target.value);
                    setBookingSuccess(null);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Reason Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Visit Reason</label>
                <input
                  type="text"
                  value={bookingReason}
                  onChange={(e) => setBookingReason(e.target.value)}
                  placeholder="e.g. Follow-up consultation"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Success Notification */}
              {bookingSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{bookingSuccess}</span>
                </div>
              )}

              {/* Slot Listing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">Open Appointment Slots ({slotData?.timezone ?? health?.hospitalTimezone})</label>
                  <span className="text-[11px] text-slate-400">
                    {slotData?.slots?.length || 0} slots open
                  </span>
                </div>

                {isSlotsLoading ? (
                  <div className="py-8 flex justify-center">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : slotData?.slots?.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                    {slotData?.message || 'No available slots for this date. Please try another weekday.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                    {slotData?.slots?.map((slotIso: string) => {
                      const d = new Date(slotIso);
                      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: slotData.timezone });
                      return (
                        <button
                          key={slotIso}
                          onClick={() => {
                            bookMutation.mutate({
                              doctorId: activeDoctorForSlots.id,
                              startTime: slotIso,
                              reason: bookingReason,
                            });
                          }}
                          disabled={bookMutation.isPending}
                          className="py-2 px-3 text-xs font-medium rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-600 hover:text-white transition-all text-blue-700 text-center disabled:opacity-50"
                        >
                          {timeStr}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
