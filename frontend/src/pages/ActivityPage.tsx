import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Wrench,
  Bot,
  X,
  Code2,
} from 'lucide-react';
import { api } from '../api/client.js';

export const ActivityPage: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedSuccess, setSelectedSuccess] = useState<string>('');
  const [inspectedActivity, setInspectedActivity] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agentActivity', selectedAgent, selectedSuccess],
    queryFn: () =>
      api.getAgentActivity({
        agentId: selectedAgent || undefined,
        success: selectedSuccess !== '' ? selectedSuccess === 'true' : undefined,
        limit: 50,
      }),
    refetchInterval: 8000,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Agent Tool Execution Activity</h2>
          <p className="text-xs text-slate-500">Live audit log of autonomous tool invocations, execution times, and status</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-700">Filter By Agent:</span>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none"
          >
            <option value="">All Agents</option>
            <option value="appointment-agent">Appointment Agent</option>
            <option value="records-agent">Patient Records Agent</option>
            <option value="lab-agent">Lab Report Agent</option>
            <option value="care-agent">Care Coordinator Agent</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">Status:</span>
          <select
            value={selectedSuccess}
            onChange={(e) => setSelectedSuccess(e.target.value)}
            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none"
          >
            <option value="">All Statuses</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-600">Error loading activity.</div>
        ) : data?.activities.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No tool executions found matching the current criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3.5">Agent Name</th>
                  <th className="px-5 py-3.5">Tool Invoked</th>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.activities.map((act: any) => (
                  <tr key={act.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-800 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <span>{act.agentName}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-700">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        {act.toolCalled}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {new Date(act.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono">
                      {act.durationMs}ms
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        act.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {act.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {act.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setInspectedActivity(act)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Inspector Modal */}
      {inspectedActivity && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">Tool Execution Audit Details</h3>
              </div>
              <button
                onClick={() => setInspectedActivity(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Agent</span>
                  <span className="font-semibold text-slate-800">{inspectedActivity.agentName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Tool</span>
                  <span className="font-mono font-medium text-slate-800">{inspectedActivity.toolCalled}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Execution Time</span>
                  <span className="font-mono text-slate-800">{inspectedActivity.durationMs}ms</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                  <span className={`font-bold ${inspectedActivity.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {inspectedActivity.success ? 'SUCCESS' : 'FAILED'}
                  </span>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-700 mb-1">Tool Input Arguments</p>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto font-mono text-[11px] max-h-40">
                  {JSON.stringify(inspectedActivity.arguments, null, 2)}
                </pre>
              </div>

              <div>
                <p className="font-bold text-slate-700 mb-1">Execution Output / Response</p>
                <pre className="p-3 bg-slate-900 text-sky-300 rounded-xl overflow-x-auto font-mono text-[11px] max-h-48">
                  {JSON.stringify(inspectedActivity.result || { error: inspectedActivity.error }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
