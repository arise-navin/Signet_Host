import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  HeartPulse,
  UserCheck,
  Stethoscope,
  Shield,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, changePassword, authError, clearError } = useAuth();

  const roleParam = searchParams.get('role');
  const [activeTab, setActiveTab] = useState<'PATIENT' | 'DOCTOR' | 'ADMIN'>(
    roleParam === 'DOCTOR' ? 'DOCTOR' : roleParam === 'ADMIN' ? 'ADMIN' : 'PATIENT'
  );

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forced password change state
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    clearError();
    // Keep the administrator login; other roles require their own account credentials.
    if (activeTab === 'ADMIN') {
      setIdentifier('admin');
      setPassword('');
    } else {
      setIdentifier('');
      setPassword('');
    }
  }, [activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;
    setLoading(true);
    try {
      const user = await login(identifier, password, activeTab);
      if (user.mustChangePassword) {
        setMustResetPassword(true);
        setCurrentPassword(password);
      } else {
        if (user.role === 'ADMIN') navigate('/admin/dashboard');
        else if (user.role === 'DOCTOR') navigate('/doctor/dashboard');
        else navigate('/patient/dashboard');
      }
    } catch {
      // Handled in context
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (newPassword.length < 6) {
      setResetError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setResetSuccess(true);
      setTimeout(() => {
        if (activeTab === 'ADMIN') navigate('/admin/dashboard');
        else if (activeTab === 'DOCTOR') navigate('/doctor/dashboard');
        else navigate('/patient/dashboard');
      }, 1200);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-6 font-sans">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <HeartPulse className="w-7 h-7 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-white">Hospital AI Lab</h1>
          <p className="text-xs text-slate-400">Authenticated Clinical Portal Access</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/80 border border-slate-700/70 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          {!mustResetPassword ? (
            <>
              {/* Role selection tabs */}
              <div className="flex bg-slate-900/60 p-1 rounded-xl mb-6 border border-slate-700/50">
                <button
                  type="button"
                  onClick={() => setActiveTab('PATIENT')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    activeTab === 'PATIENT'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Patient</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('DOCTOR')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    activeTab === 'DOCTOR'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Doctor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ADMIN')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    activeTab === 'ADMIN'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
              </div>

              {/* Error banner */}
              {authError && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-identifier" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {activeTab === 'ADMIN' ? 'Username or Email' : 'Email Address'}
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={activeTab === 'ADMIN' ? 'admin or admin@hospital.com' : 'you@example.com'}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 rounded-xl font-bold text-sm text-white shadow-lg transition-all flex items-center justify-center space-x-2 mt-2 cursor-pointer ${
                    activeTab === 'ADMIN'
                      ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
                      : activeTab === 'DOCTOR'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                  } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {loading ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      <span>Sign In as {activeTab}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Registration and auxiliary links */}
              {activeTab === 'PATIENT' && (
                <div className="mt-6 pt-4 border-t border-slate-700/60 text-center">
                  <span className="text-xs text-slate-400">First time visiting our hospital? </span>
                  <Link
                    to="/register"
                    className="text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    Register New Patient
                  </Link>
                </div>
              )}
            </>
          ) : (
            /* First-login password change required */
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4 mx-auto">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-center text-white mb-1">Password Change Required</h2>
              <p className="text-xs text-slate-400 text-center mb-6">
                Your temporary bootstrap credentials require setting a personal password before accessing the {activeTab} dashboard.
              </p>

              {resetError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{resetError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Password updated! Redirecting to dashboard...</span>
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Current Password</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Password (min 6 characters)</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter secure password"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || resetSuccess}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center space-x-2 mt-4 cursor-pointer"
                >
                  {loading ? <span>Updating Password...</span> : <span>Update & Continue</span>}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            ← Back to Hospital Home
          </Link>
        </div>
      </div>
    </div>
  );
};
