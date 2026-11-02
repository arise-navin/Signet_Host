import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Stethoscope,
  Calendar,
  Ticket,
  Bot,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  CalendarDays,
  FileText,
  FlaskConical,
  HeartHandshake,
} from 'lucide-react';
import { api } from '../api/client.js';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: api.getDashboardStats,
    refetchInterval: 10000,
  });

  const agentIcons: Record<string, any> = {
    'appointment-agent': CalendarDays,
    'records-agent': FileText,
    'lab-agent': FlaskConical,
    'care-agent': HeartHandshake,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        Failed to load dashboard metrics: {(error as any)?.message || 'Unknown error'}
      </div>
    );
  }

  const { metrics, agents, recentActivities, recentAppointments } = data;

  const metricCards = [
    { name: 'Total Patients', value: metrics.totalPatients, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', link: '/patients' },
    { name: 'Total Doctors', value: metrics.totalDoctors, icon: Stethoscope, color: 'text-emerald-600', bg: 'bg-emerald-50', link: '/doctors' },
    { name: "Today's Appointments", value: metrics.todayAppointments, icon: Calendar, color: 'text-sky-600', bg: 'bg-sky-50', link: '/appointments' },
    { name: 'Open Support Tickets', value: metrics.activeTickets, icon: Ticket, color: 'text-amber-600', bg: 'bg-amber-50', link: '/support-tickets' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-sky-700 to-indigo-800 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-xs font-medium mb-2 backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-sky-200" />
            Hospital AI Multi-Agent Lab Active
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Clinical AI Multi-Agent Concierge</h2>
          <p className="text-blue-100 text-sm max-w-2xl mt-1">
            Autonomous specialized AI agents coordinating clinical records, appointments, diagnostics, and patient navigation powered by local Ollama inference.
          </p>
        </div>
        <button
          onClick={() => navigate('/chat')}
          className="px-5 py-2.5 bg-white text-blue-700 hover:bg-blue-50 font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center gap-2 shrink-0 self-start md:self-auto"
        >
          <Bot className="w-4 h-4" />
          Launch AI Chat Lab
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {metricCards.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.name}
              data-testid={`metric-${m.link.slice(1)}`}
              to={m.link}
              className="bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{m.name}</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{m.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${m.bg} ${m.color} group-hover:scale-105 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Four AI Agents Showcase */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Hospital AI Agents</h3>
            <p className="text-xs text-slate-500">Four specialized agents operating within PostgreSQL and RBAC boundaries</p>
          </div>
          <Link to="/chat" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
            Open Chat Studio <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {agents.map((ag: any) => {
            const Icon = agentIcons[ag.id] || Bot;
            return (
              <div
                key={ag.id}
                className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between hover:border-blue-300 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">{ag.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">{ag.description}</p>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Authorized Tools</p>
                    <div className="flex flex-wrap gap-1">
                      {ag.allowedTools.slice(0, 3).map((tool: string) => (
                        <span key={tool} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {tool}
                        </span>
                      ))}
                      {ag.allowedTools.length > 3 && (
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          +{ag.allowedTools.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/chat?agent=${ag.id}`)}
                  className="mt-5 w-full py-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Chat with {ag.name.split(' ')[0]}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activities & Appointments Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Recent Agent Executions
            </h3>
            <Link to="/activity" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No agent executions recorded yet.</p>
            ) : (
              recentActivities.slice(0, 5).map((act: any) => (
                <div key={act.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">{act.agentName}</span>
                    <p className="text-slate-500 truncate max-w-xs">{act.prompt}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                      <span>{new Date(act.createdAt).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span>{act.durationMs}ms</span>
                      <span>•</span>
                      <span>{act.toolCount} tool(s)</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${act.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {act.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Appointments */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-600" />
              Recent Appointments
            </h3>
            <Link to="/appointments" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {recentAppointments.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No appointments found.</p>
            ) : (
              recentAppointments.slice(0, 5).map((appt: any) => (
                <div key={appt.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">{appt.patientName}</span>
                    <p className="text-slate-500">with {appt.doctorName} ({appt.department})</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{new Date(appt.startTime).toLocaleString()}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 shrink-0">
                    {appt.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
