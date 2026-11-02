import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Plus,
  RefreshCw,
  XCircle,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { api } from '../api/client.js';

export const AppointmentsPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedApptForReschedule, setSelectedApptForReschedule] = useState<any | null>(null);
  const [newDateTime, setNewDateTime] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['appointments', statusFilter],
    queryFn: () => api.getAppointments({ status: statusFilter || undefined, limit: 100 }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, newStartTime }: { id: string; newStartTime: string }) =>
      api.rescheduleAppointment(id, newStartTime),
    onSuccess: (res: any) => {
      setActionNotice(res.message || 'Appointment rescheduled.');
      setSelectedApptForReschedule(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err: any) => {
      setActionNotice(`Reschedule error: ${err.message}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelAppointment(id, 'Patient requested cancellation from portal'),
    onSuccess: (res: any) => {
      setActionNotice(res.message || 'Appointment cancelled.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err: any) => {
      setActionNotice(`Cancellation error: ${err.message}`);
    },
  });

  const statuses = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED'];

  const getStatusColor = (st: string) => {
    switch (st) {
      case 'CONFIRMED':
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'SCHEDULED':
      case 'RESCHEDULED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CANCELLED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Hospital Appointments Manager</h2>
          <p className="text-xs text-slate-500">Live booking, rescheduling, cancellations, and status tracking</p>
        </div>
      </div>

      {/* Action Notification */}
      {actionNotice && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center justify-between">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-blue-500 hover:text-blue-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            statusFilter === '' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Appointments
        </button>
        {statuses.map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === st ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Appointment Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-600">
            Error loading appointments: {(error as any)?.message}
          </div>
        ) : data?.appointments.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No appointments found for the selected status.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3.5">Patient</th>
                  <th className="px-5 py-3.5">Doctor & Specialty</th>
                  <th className="px-5 py-3.5">Scheduled Time ({data?.timezone})</th>
                  <th className="px-5 py-3.5">Reason</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.appointments.map((a: any) => {
                  const isCancelable = a.status === 'SCHEDULED' || a.status === 'CONFIRMED' || a.status === 'RESCHEDULED';
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{a.patientName}</div>
                        <div className="text-[11px] text-slate-400">{a.patientEmail}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">{a.doctorName}</div>
                        <div className="text-[11px] text-slate-400">{a.department}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-700">{new Date(a.startTime).toLocaleDateString([], { timeZone: data.timezone })}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(a.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: data.timezone })} -{' '}
                          {new Date(a.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: data.timezone })}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs truncate text-slate-600" title={a.reason}>
                        {a.reason}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(a.status)}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {isCancelable && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedApptForReschedule(a);
                                setNewDateTime(new Intl.DateTimeFormat('sv-SE', { timeZone: data.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(a.startTime)).replace(' ', 'T'));
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Cancel appointment with ${a.doctorName}?`)) {
                                  cancelMutation.mutate(a.id);
                                }
                              }}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reschedule Modal */}
      {selectedApptForReschedule && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">Reschedule Appointment</h3>
              <button
                onClick={() => setSelectedApptForReschedule(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Rescheduling appointment with <span className="font-semibold text-slate-800">{selectedApptForReschedule.doctorName}</span> for patient <span className="font-semibold text-slate-800">{selectedApptForReschedule.patientName}</span>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">New Date and Time ({data?.timezone})</label>
              <input
                type="datetime-local"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedApptForReschedule(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (newDateTime) {
                    rescheduleMutation.mutate({
                      id: selectedApptForReschedule.id,
                      newStartTime: newDateTime,
                    });
                  }
                }}
                disabled={rescheduleMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {rescheduleMutation.isPending ? 'Saving...' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
