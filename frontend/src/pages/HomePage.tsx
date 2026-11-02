import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  HeartPulse,
  UserCheck,
  Stethoscope,
  Shield,
  UserPlus,
  ArrowRight,
  Sparkles,
  Calendar,
  FileText,
  Activity,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <HeartPulse className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              Hospital AI Lab
            </span>
            <span className="text-[11px] block text-sky-400 font-semibold tracking-wide">
              Dynamic Healthcare Management Platform
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {currentUser ? (
            <button
              onClick={() => {
                if (currentUser.role === 'ADMIN') navigate('/admin/dashboard');
                else if (currentUser.role === 'DOCTOR') navigate('/doctor/dashboard');
                else navigate('/patient/dashboard');
              }}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/30 transition-all cursor-pointer"
            >
              <span>Go to {currentUser.role} Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <Link
                to="/login"
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white shadow-md shadow-blue-500/20 transition-all"
              >
                New Patient Registration
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 px-6 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6 animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Enterprise Multi-Agent Clinical Operating System</span>
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-6">
          Intelligent Healthcare, <br />
          <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-teal-300 bg-clip-text text-transparent">
            Database-Driven & AI-Augmented
          </span>
        </h1>

        <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-10">
          Seamlessly connect patients, physicians, and administrative specialists with four dedicated clinical AI agents powered by local LLM inference and verified database transactions.
        </p>

        {/* Portal Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left mb-16">
          {/* Card 1: Patient Login */}
          <div className="group bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/60 hover:border-blue-500/50 rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between shadow-xl hover:shadow-blue-500/10">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UserCheck className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Patient Portal</h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Access your medical history, active prescriptions, lab reports, and describe symptoms for AI doctor recommendations.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => navigate('/login?role=PATIENT')}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <span>Patient Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Card 2: Doctor Portal */}
          <div className="group bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/60 hover:border-emerald-500/50 rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between shadow-xl hover:shadow-emerald-500/10">
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Stethoscope className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Doctor Portal</h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Manage assigned patient caseloads, clinical consultation notes, availability schedules, and lab orders securely.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => navigate('/login?role=DOCTOR')}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <span>Doctor Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Card 3: Admin Portal */}
          <div className="group bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/60 hover:border-purple-500/50 rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between shadow-xl hover:shadow-purple-500/10">
            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Admin Portal</h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Hospital operational management, doctor scheduling, doctor-patient assignments, and AI agent execution monitoring.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => navigate('/login?role=ADMIN')}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-purple-600/20 cursor-pointer"
              >
                <span>Admin Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Card 4: New Patient Registration */}
          <div className="group bg-gradient-to-b from-sky-900/40 to-slate-800/80 hover:from-sky-900/60 border border-sky-500/40 hover:border-sky-400 rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UserPlus className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">New Patient?</h2>
              <p className="text-xs text-sky-200/80 leading-relaxed mb-4">
                Create a patient account in seconds. Receive an authoritative Medical Record Number (MRN) and book consultations.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-sky-800/40">
              <button
                onClick={() => navigate('/register')}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-sky-500/30 cursor-pointer"
              >
                <span>Register Account</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <p className="text-[11px] text-center text-sky-300/60 font-medium pt-1">
                Zero waiting time • Instant MRN
              </p>
            </div>
          </div>
        </div>

      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        Hospital AI Lab — Secure Multi-Agent Healthcare Platform • PostgreSQL 16 • Ollama LLM Engine
      </footer>
    </div>
  );
};
