import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  ShieldCheck,
  Bot,
  Filter,
  CheckCheck,
} from 'lucide-react';
import { api } from '../api/client.js';
import { TestScenarioResult } from '@hospital/shared';

export const TestLabPage: React.FC = () => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed'>('all');
  const [runningIndividualId, setRunningIndividualId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['testLabResults'],
    queryFn: api.runTestLabAll,
    refetchOnWindowFocus: false,
  });

  const [individualResults, setIndividualResults] = useState<Record<string, TestScenarioResult>>({});

  const runSingleMutation = useMutation({
    mutationFn: (testId: string) => api.runTestLabSingle(testId),
    onMutate: (testId) => {
      setRunningIndividualId(testId);
    },
    onSuccess: (res: TestScenarioResult) => {
      setIndividualResults((prev) => ({
        ...prev,
        [res.testId]: res,
      }));
      setRunningIndividualId(null);
    },
    onError: () => {
      setRunningIndividualId(null);
    },
  });

  const mergedResults: TestScenarioResult[] = (data?.results || []).map((r: TestScenarioResult) => {
    return individualResults[r.testId] || r;
  });

  const total = mergedResults.length;
  const passedCount = mergedResults.filter((r) => r.passed).length;
  const failedCount = total - passedCount;
  const totalDuration = mergedResults.reduce((acc, r) => acc + (r.executionTimeMs || 0), 0);

  const filteredResults = mergedResults.filter((r) => {
    if (filterStatus === 'passed') return r.passed;
    if (filterStatus === 'failed') return !r.passed;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Hospital AI Test Lab</h2>
          <p className="text-xs text-slate-500">
            Real executable automated test suite covering TEST-001 through TEST-016
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 shrink-0 self-start sm:self-auto"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Executing Test Suite...' : 'Run All 16 Tests'}
        </button>
      </div>

      {/* Metrics & Filter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Scenarios</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{total || 16}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Passed Tests</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{passedCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Failed Tests</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{failedCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Suite Duration</p>
          <p className="text-2xl font-bold text-slate-800 mt-1 font-mono">{totalDuration}ms</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            filterStatus === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All ({total})
        </button>
        <button
          onClick={() => setFilterStatus('passed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            filterStatus === 'passed'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Passed ({passedCount})
        </button>
        <button
          onClick={() => setFilterStatus('failed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            filterStatus === 'failed'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Failed ({failedCount})
        </button>
      </div>

      {/* Tests Grid */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">Executing standalone test suite...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredResults.map((test) => {
            const isCurrentlyRunning = runningIndividualId === test.testId;
            return (
              <div
                key={test.testId}
                className={`bg-white rounded-xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                  test.passed ? 'border-slate-200 hover:border-emerald-300' : 'border-rose-200 bg-rose-50/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        {test.testId}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {test.agent}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        test.passed
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {test.passed ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> PASSED
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" /> FAILED
                        </>
                      )}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-800 text-sm mb-3">{test.name}</h3>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                        Expected Result
                      </p>
                      <p className="text-slate-700">{test.expectedResult}</p>
                    </div>

                    <div
                      className={`p-2.5 rounded-lg border ${
                        test.passed ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/60 border-rose-200'
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-slate-500">
                        Actual Result
                      </p>
                      <p className={`font-mono text-[11px] ${test.passed ? 'text-emerald-900' : 'text-rose-800'}`}>
                        {test.actualResult}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                    <Clock className="w-3.5 h-3.5" /> {test.executionTimeMs}ms
                  </span>

                  <button
                    onClick={() => runSingleMutation.mutate(test.testId)}
                    disabled={isCurrentlyRunning}
                    className="px-3 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg font-semibold text-[11px] transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <Play className={`w-3 h-3 ${isCurrentlyRunning ? 'animate-spin' : ''}`} />
                    {isCurrentlyRunning ? 'Running...' : 'Run Test'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
