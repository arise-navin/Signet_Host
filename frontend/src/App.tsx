import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext.js';
import { Layout } from './components/Layout.js';
import { HomePage } from './pages/HomePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { AdminDashboardPage } from './pages/AdminDashboardPage.js';
import { DoctorDashboardPage } from './pages/DoctorDashboardPage.js';
import { PatientDashboardPage } from './pages/PatientDashboardPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { DoctorsPage } from './pages/DoctorsPage.js';
import { AppointmentsPage } from './pages/AppointmentsPage.js';
import { ChatPage } from './pages/ChatPage.js';
import { SupportTicketsPage } from './pages/SupportTicketsPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public standalone pages */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Authenticated Application Shell */}
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/doctor/dashboard" element={<DoctorDashboardPage />} />
              <Route path="/patient/dashboard" element={<PatientDashboardPage />} />
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/doctors" element={<DoctorsPage />} />
              <Route path="/appointments" element={<AppointmentsPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/support-tickets" element={<SupportTicketsPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
