import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  Calendar,
  Bot,
  Activity,
  Ticket,
  Settings,
  FlaskConical,
  HeartPulse,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Shield,
  UserCheck,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api/client.js';

export const Layout: React.FC = () => {
  const { currentUser, demoUsers, switchUser, logout } = useAuth();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    backend: string;
    ollama: string;
    model: string;
    error?: string;
  }>({ backend: 'checking', ollama: 'checking', model: '' });

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await api.getHealth();
        setHealthStatus({
          backend: data.services.backend.status,
          ollama: data.services.ollama.status,
          model: data.services.ollama.activeModel,
          error: data.services.ollama.error,
        });
      } catch (e: any) {
        setHealthStatus({ backend: 'down', ollama: 'down', model: '', error: e.message });
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Role-scoped navigation items
  const role = currentUser?.role;

  interface NavItem {
    name: string;
    to: string;
    icon: any;
    badge?: string;
    highlight?: boolean;
  }

  const roleDashboardLink: NavItem =
    role === 'ADMIN'
      ? { name: 'Admin Dashboard', to: '/admin/dashboard', icon: Shield, badge: 'Admin' }
      : role === 'DOCTOR'
      ? { name: 'Doctor Dashboard', to: '/doctor/dashboard', icon: Stethoscope, badge: 'Doctor' }
      : { name: 'Patient Dashboard', to: '/patient/dashboard', icon: UserCheck, badge: 'Patient' };

  const navItems: NavItem[] = [
    roleDashboardLink,
    { name: 'System Overview', to: '/dashboard', icon: LayoutDashboard },
    { name: 'Patients', to: '/patients', icon: Users },
    { name: 'Doctors', to: '/doctors', icon: Stethoscope },
    { name: 'Appointments', to: '/appointments', icon: Calendar },
    { name: 'AI Agent Chat', to: '/chat', icon: Bot, highlight: true },
    { name: 'Support Tickets', to: '/support-tickets', icon: Ticket },
    { name: 'Agent Activity', to: '/activity', icon: Activity },
    { name: 'Settings', to: '/settings', icon: Settings },
    { name: 'Test Lab', to: '/test-lab', icon: FlaskConical, badge: '16 Tests' },
  ];

  const getRoleBadgeColor = (r?: string) => {
    switch (r) {
      case 'ADMIN': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'DOCTOR': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'RECEPTIONIST': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm z-20">
        {/* Brand */}
        <div
          onClick={() => navigate('/')}
          className="h-16 px-6 border-b border-slate-100 flex items-center space-x-3 bg-gradient-to-r from-blue-600 to-sky-600 text-white cursor-pointer select-none"
        >
          <div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-sm">
            <HeartPulse className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-base block leading-tight">Hospital AI Lab</span>
            <span className="text-[11px] text-blue-100 font-medium tracking-wide">Multi-Agent Healthcare</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                data-testid={`nav-${item.to === '/' ? 'dashboard' : item.to.replace(/\//g, '-')}`}
                to={item.to}
                className={
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  } ${item.highlight && !location.pathname.startsWith('/chat') ? 'border border-blue-200/60 bg-blue-50/40' : ''}`
                }
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    item.badge === 'Admin' ? 'bg-purple-100 text-purple-700' :
                    item.badge === 'Doctor' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Ollama Status pill */}
        <div className="p-3 m-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div className="flex items-center justify-between font-medium text-slate-700 mb-1">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${healthStatus.ollama === 'ready' ? 'bg-emerald-500' : healthStatus.ollama === 'model_missing' ? 'bg-amber-500' : 'bg-rose-500'}`} />
              AI Engine
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-500">
              {healthStatus.ollama}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate" title={healthStatus.model || 'No model active'}>
            Model: <span className="font-mono text-slate-800">{healthStatus.model || 'none'}</span>
          </p>
          {healthStatus.error && (
            <p className="text-[10px] text-amber-600 mt-1 line-clamp-2 leading-tight" title={healthStatus.error}>
              {healthStatus.error}
            </p>
          )}
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-xs z-10">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-slate-800">
              {navItems.find((i) => i.to === location.pathname)?.name || 'Hospital AI Dashboard'}
            </h1>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
              PostgreSQL Active (Port 5433)
            </span>
          </div>

          {/* Right Header: User Menu & Switcher */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <button
                data-testid="user-menu"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-3 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {currentUser?.name?.charAt(0) || 'U'}
                </div>
                <div className="hidden md:block">
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    {currentUser?.name || 'User Session'}
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getRoleBadgeColor(currentUser?.role)}`}>
                      {currentUser?.role || 'PATIENT'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {currentUser?.email || 'Active Account'}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quick Switch Persona</p>
                    <p className="text-[11px] text-slate-500">Switch user for rapid boundary testing</p>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {demoUsers.map((u) => (
                      <button
                        key={u.id}
                        data-testid={`demo-user-${u.email}`}
                        onClick={() => {
                          switchUser(u.id);
                          setUserDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 flex items-start justify-between transition-colors cursor-pointer ${
                          currentUser?.id === u.id ? 'bg-blue-50/70' : ''
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            {u.name}
                            {currentUser?.id === u.id && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                          </div>
                          <div className="text-[11px] text-slate-500">{u.email}</div>
                          {u.mrn && <div className="text-[10px] text-slate-400">MRN: {u.mrn}</div>}
                          {u.specialization && <div className="text-[10px] text-slate-400">{u.specialization}</div>}
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${getRoleBadgeColor(u.role)}`}>
                          {u.role}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-100 px-3">
                    <button
                      onClick={handleLogout}
                      className="w-full py-2 px-3 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Temporary Bootstrap Warning Banner if mustChangePassword */}
        {currentUser?.mustChangePassword && (
          <div className="bg-amber-500 text-white px-8 py-2 text-xs font-semibold flex items-center justify-between shadow-xs">
            <span className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              <span>Security notice: You are logged in with temporary bootstrap credentials. Please change your password.</span>
            </span>
            <button
              onClick={() => navigate('/login')}
              className="px-2.5 py-0.5 rounded-md bg-white text-amber-900 text-[11px] font-bold hover:bg-amber-50 cursor-pointer"
            >
              Update Password
            </button>
          </div>
        )}

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
