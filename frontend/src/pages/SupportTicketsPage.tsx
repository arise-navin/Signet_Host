import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

export const SupportTicketsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [page, setPage] = useState<number>(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['supportTickets', currentUser?.id, page],
    queryFn: () => api.getSupportTickets(page),
    enabled: currentUser !== null,
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Support Tickets</h2>
        <p className="text-xs text-slate-500">Your support requests and tickets explicitly assigned to you</p>
      </div>
      {isLoading && <p role="status">Loading support tickets...</p>}
      {error && <p role="alert" className="text-rose-700">Failed to load support tickets: {error.message}</p>}
      {data && <>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-xs text-left" data-testid="support-tickets-table">
            <thead className="bg-slate-50 text-slate-500"><tr>
              <th scope="col" className="p-4">Ticket ID</th><th scope="col" className="p-4">Request</th>
              <th scope="col" className="p-4">Priority</th><th scope="col" className="p-4">Status</th>
              <th scope="col" className="p-4">Appointment</th><th scope="col" className="p-4">Created</th>
            </tr></thead>
            <tbody>{data.tickets.map((ticket) => <tr key={ticket.id} data-testid={`support-ticket-${ticket.id}`} className="border-t border-slate-100">
              <td className="p-4 font-mono">{ticket.id}</td>
              <td className="p-4"><p className="font-semibold">{ticket.subject}</p><p>{ticket.category}</p><p className="text-slate-500 whitespace-pre-wrap">{ticket.description}</p></td>
              <td className="p-4">{ticket.priority}</td><td className="p-4">{ticket.status}</td>
              <td className="p-4">{ticket.appointmentId ?? 'None'}</td>
              <td className="p-4">{new Date(ticket.createdAt).toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
          {data.total === 0 && <p className="p-4 text-sm text-slate-500" data-testid="support-tickets-empty">No support tickets yet.</p>}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <button data-testid="support-tickets-previous" disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-2 border rounded-lg disabled:opacity-40">Previous</button>
          <span>Page {page} · {data.total} tickets</span>
          <button data-testid="support-tickets-next" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)} className="px-3 py-2 border rounded-lg disabled:opacity-40">Next</button>
        </div>
      </>}
    </div>
  );
};
