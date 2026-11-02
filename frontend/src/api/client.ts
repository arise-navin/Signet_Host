import { supportTicketListSchema } from '@hospital/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'PATIENT' | 'DOCTOR' | 'RECEPTIONIST' | 'ADMIN';
  patientId?: string;
  mrn?: string;
  doctorId?: string;
  specialization?: string;
  mustChangePassword?: boolean;
}

const STORAGE_KEY = 'hospital_ai_active_user_id';
const TOKEN_KEY = 'hospital_ai_auth_token';

export function getActiveUserId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveUserId(userId: string): void {
  localStorage.setItem(STORAGE_KEY, userId);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body !== undefined && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errJson.message || errorMsg;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Health
  getHealth: () => apiFetch('/api/health'),

  // Auth
  login: (payload: { identifier: string; password: string; expectedRole?: string }) =>
    apiFetch<{ token: string; message: string; user: AuthUser; mustChangePassword?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  register: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    dateOfBirth: string;
    gender?: string;
    bloodGroup?: string;
    allergies?: string;
    chronicConditions?: string;
    emergencyContact?: string;
    address?: string;
  }) =>
    apiFetch<{ token: string; message: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiFetch<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    apiFetch<{ success: boolean; message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  getMe: () => apiFetch<{ user: AuthUser }>('/api/auth/me'),

  getSupportTickets: async (page: number) =>
    supportTicketListSchema.parse(await apiFetch(`/api/support-tickets?page=${page}&limit=25`)),

  // Dashboard stats
  getDashboardStats: () => apiFetch('/api/dashboard/stats'),

  // Patients
  getPatients: (params?: { search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch(`/api/patients?${q.toString()}`);
  },
  getPatientDetail: (id: string) => apiFetch(`/api/patients/${id}`),

  // Doctors
  getDoctors: (params?: { department?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.department) q.set('department', params.department);
    if (params?.search) q.set('search', params.search);
    return apiFetch(`/api/doctors?${q.toString()}`);
  },
  getDoctorSlots: (doctorId: string, date: string) =>
    apiFetch(`/api/doctors/${doctorId}/slots?date=${date}`),

  // Appointments
  getAppointments: (params?: { status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch(`/api/appointments?${q.toString()}`);
  },
  bookAppointment: (data: { doctorId: string; startTime: string; reason: string; patientId?: string }) =>
    apiFetch('/api/appointments/book', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  rescheduleAppointment: (id: string, newStartTime: string) =>
    apiFetch(`/api/appointments/${id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ newStartTime }),
    }),
  cancelAppointment: (id: string, reason?: string) =>
    apiFetch(`/api/appointments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Chat
  getConversations: () => apiFetch('/api/chat/conversations'),
  clearChats: () =>
    apiFetch<{ deletedCount: number; message: string }>('/api/chat/conversations', { method: 'DELETE' }),
  getMessages: (conversationId: string) => apiFetch(`/api/chat/conversations/${conversationId}/messages`),

  // Activity
  getAgentActivity: (params?: { page?: number; limit?: number; agentId?: string; success?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.agentId) q.set('agentId', params.agentId);
    if (params?.success !== undefined) q.set('success', String(params.success));
    return apiFetch(`/api/agent-activity?${q.toString()}`);
  },

  // Settings
  getOllamaSettings: () => apiFetch('/api/settings/ollama'),
  setOllamaModel: (model: string) =>
    apiFetch('/api/settings/ollama/model', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),
  testOllamaInference: () =>
    apiFetch('/api/settings/ollama/test', {
      method: 'POST',
    }),

  // Test Lab
  runTestLabAll: () => apiFetch('/api/test-lab/run-all'),
  runTestLabSingle: (testId: string) =>
    apiFetch(`/api/test-lab/run/${testId}`, {
      method: 'POST',
    }),
};
