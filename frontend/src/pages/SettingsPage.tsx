import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCw,
  Server,
  Terminal,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client.js';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [inferenceResult, setInferenceResult] = useState<{
    success: boolean;
    durationMs: number;
    model?: string;
    response?: string;
    error?: string;
  } | null>(null);

  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['ollamaSettings'],
    queryFn: async () => {
      const data = await api.getOllamaSettings();
      if (!selectedModel && data.selectedModel) {
        setSelectedModel(data.selectedModel);
      }
      return data;
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: (model: string) => api.setOllamaModel(model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ollamaSettings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      refetch();
    },
  });

  const testInferenceMutation = useMutation({
    mutationFn: api.testOllamaInference,
    onSuccess: (data) => {
      setInferenceResult(data);
    },
    onError: (err: any) => {
      setInferenceResult({ success: false, durationMs: 0, error: err.message });
    },
  });

  const clearChatsMutation = useMutation({
    mutationFn: api.clearChats,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['agentActivity'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isServerRunning = settings?.serverRunning;
  const isModelAvailable = settings?.modelAvailable;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">System & AI Provider Settings</h2>
        <p className="text-xs text-slate-500">Check the AI connection, available models, and inference readiness</p>
      </div>

      {/* Ollama Connection & Status Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">AI Engine Status</h3>
              <p className="text-xs text-slate-500">Base URL: <code className="font-mono">{settings?.baseUrl}</code></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              isServerRunning
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isServerRunning ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {isServerRunning ? 'Server Active' : 'Unreachable'}
            </span>
            <button
              onClick={() => refetch()}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh AI status"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Model Availability Warning (if requested model beam:cloude is missing) */}
        {settings?.error && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">AI Readiness Notice</p>
              <p className="text-amber-700 leading-relaxed">{settings.error}</p>
              {!isModelAvailable && settings.provider !== 'signet' && (
                <p className="text-[11px] text-amber-600">Select an available model below, then test inference.</p>
              )}
            </div>
          </div>
        )}

        {settings?.warning && (
          <p role="status" data-testid="ai-coverage-warning" className="text-xs text-amber-700">{settings.warning}</p>
        )}

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Requested Model (Specification)
            </label>
            <input
              type="text"
              readOnly
              value={settings?.requestedModel || 'beam:cloude'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-mono outline-none"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Specified in application instructions</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Active Model
            </label>
            <div className="flex gap-2">
              <select
                value={selectedModel || settings?.selectedModel || ''}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-mono font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {settings?.installedModels?.map((m: string) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <button
                onClick={() => updateModelMutation.mutate(selectedModel)}
                disabled={updateModelMutation.isPending || selectedModel === settings?.selectedModel}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-40 shadow-xs"
              >
                {updateModelMutation.isPending ? 'Saving...' : 'Set Active'}
              </button>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Switch to any verified installed model</span>
          </div>
        </div>

        {/* Installed Models Tags */}
        <div className="pt-2">
          <p className="text-xs font-semibold text-slate-700 mb-2">Models Advertised by the AI Provider</p>
          <div className="flex flex-wrap gap-2">
            {settings?.installedModels?.length === 0 ? (
              <span className="text-xs text-slate-400">No models detected via 'ollama list'.</span>
            ) : (
              settings?.installedModels?.map((model: string) => (
                <div
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all ${
                    model === settings?.selectedModel
                      ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Server className="w-3.5 h-3.5 text-slate-400" />
                  <span>{model}</span>
                  {model === settings?.selectedModel && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Real Inference Test Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Chat History</h3>
            <p className="text-xs text-slate-500">Permanently delete all chats for your current account. Patient records, appointments and support tickets are kept.</p>
          </div>
          <button
            type="button"
            data-testid="settings-clear-chats"
            disabled={clearChatsMutation.isPending}
            onClick={() => {
              if (window.confirm('Clear all chats for your current account? This permanently deletes your conversations, messages and their agent activity. This cannot be undone.')) {
                clearChatsMutation.mutate();
              }
            }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 disabled:opacity-40 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {clearChatsMutation.isPending ? 'Clearing...' : 'Clear all chats'}
          </button>
        </div>
        {clearChatsMutation.isSuccess && <p role="status" data-testid="settings-clear-chats-success" className="text-xs text-emerald-700">{clearChatsMutation.data.message}</p>}
        {clearChatsMutation.isError && <p role="alert" className="text-xs text-rose-700">{clearChatsMutation.error.message}</p>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Test Model Inference</h3>
            <p className="text-xs text-slate-500">
              Execute a real inference test against <code className="font-mono font-semibold text-blue-600">{settings?.selectedModel}</code>
            </p>
          </div>

          <button
            onClick={() => testInferenceMutation.mutate()}
            disabled={testInferenceMutation.isPending || !settings?.ready}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-40 shadow-xs"
          >
            <Play className={`w-3.5 h-3.5 ${testInferenceMutation.isPending ? 'animate-spin' : ''}`} />
            {testInferenceMutation.isPending ? 'Running Inference...' : 'Test Inference'}
          </button>
        </div>

        {inferenceResult && (
          <div className={`p-4 rounded-xl border text-xs space-y-2 animate-in fade-in duration-150 ${
            inferenceResult.success ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                {inferenceResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                {inferenceResult.success ? 'Inference Succeeded' : 'Inference Failed'}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Duration: {inferenceResult.durationMs}ms
              </span>
            </div>

            {inferenceResult.response && (
              <div className="bg-white p-3 rounded-lg border border-emerald-200/60 font-sans text-slate-800 text-xs">
                {inferenceResult.response}
              </div>
            )}

            {inferenceResult.error && (
              <p className="text-rose-700 font-mono text-[11px]">{inferenceResult.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
