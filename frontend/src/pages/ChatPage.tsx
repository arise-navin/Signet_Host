import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Bot,
  User,
  Sparkles,
  CalendarDays,
  FileText,
  FlaskConical,
  HeartHandshake,
  Wrench,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Plus,
  MessageSquare,
  Clock,
  Loader2,
  StopCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api/client.js';
import { ChatMarkdown } from '../components/ChatMarkdown.js';
import { ChatActivity } from '../components/ChatActivity.js';
import { ActivityStep, activityFromToolResult, AGENT_IDS, AgentId, ToolExecutionResult } from '@hospital/shared';

interface ChatMessageItem {
  id: string;
  senderRole: 'user' | 'assistant' | 'system';
  agentId?: string;
  content: string;
  toolCalls?: ToolExecutionResult[];
  createdAt: string;
  isStreaming?: boolean;
  activities?: ActivityStep[];
}

interface StreamingEventState {
  currentToolCall?: { toolName: string; args: any; callId: string };
  completedTools: ToolExecutionResult[];
  handoff?: { fromAgent: string; toAgent: string; reason: string };
}

export const ChatPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const initialAgent = (searchParams.get('agent') as AgentId) || AGENT_IDS.CARE;
  const [selectedAgent, setSelectedAgent] = useState<AgentId>(initialAgent);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(searchParams.get('conversation'));

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingState, setStreamingState] = useState<StreamingEventState>({ completedTools: [] });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryRequestRef = useRef<{ text: string; conversationId: string | null; requestId: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { data: conversations, refetch: refetchConversations } = useQuery({
    queryKey: ['conversations', currentUser?.id],
    queryFn: api.getConversations,
  });

  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.getHealth });

  // Load message history when activeConversationId changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const msgs = await api.getMessages(activeConversationId);
        if (!cancelled) setMessages(msgs);
      } catch (err: any) {
        setErrorMessage(`Failed to load chat history: ${err.message}`);
      }
    };

    loadMessages();
    return () => { cancelled = true; };
  }, [activeConversationId]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingState]);

  const agents = [
    { id: AGENT_IDS.CARE, name: 'Care Coordinator', icon: HeartHandshake, desc: 'FAQ, Support & Routing' },
    { id: AGENT_IDS.APPOINTMENT, name: 'Appointment Agent', icon: CalendarDays, desc: 'Doctor Schedules & Booking' },
    { id: AGENT_IDS.RECORDS, name: 'Patient Records', icon: FileText, desc: 'Medical History & Summaries' },
    { id: AGENT_IDS.LAB, name: 'Lab Report Agent', icon: FlaskConical, desc: 'Diagnostic Results & Reviews' },
  ];

  const quickPrompts = [
    'Show my appointments.',
    'Book an appointment with a cardiologist tomorrow.',
    'Show my previous visit summary.',
    'Is my lab report ready?',
    'Explain the fields in my synthetic blood test report.',
    'Create a support ticket for billing.',
    'I want to speak to hospital staff.',
  ];

  const handleSendMessage = async (promptToSend?: string) => {
    const text = (promptToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    setInputMessage('');
    setErrorMessage(null);
    setStreamingState({ completedTools: [] });

    // Append local user message
    const userMsg: ChatMessageItem = {
      id: `local_user_${Date.now()}`,
      senderRole: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    // Temporary placeholder for streaming assistant response
    const assistantMsgId = `local_ast_${Date.now()}`;
    const assistantMsg: ChatMessageItem = {
      id: assistantMsgId,
      senderRole: 'assistant',
      agentId: selectedAgent,
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const previousRequest = retryRequestRef.current;
      const requestId = previousRequest?.text === text && previousRequest.conversationId === activeConversationId ? previousRequest.requestId : crypto.randomUUID();
      retryRequestRef.current = { text, conversationId: activeConversationId, requestId };
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',

        },
        body: JSON.stringify({
          requestId,
          prompt: text,
          agentId: selectedAgent,
          conversationId: activeConversationId || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat stream failed (HTTP ${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Streaming response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let completed = false;
      let streamError: string | null = null;
      const completedTools: ToolExecutionResult[] = [];
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          let eventType = 'message';
          let dataStr = '';

          const subLines = line.split('\n');
          for (const sub of subLines) {
            if (sub.startsWith('event: ')) {
              eventType = sub.replace('event: ', '').trim();
            } else if (sub.startsWith('data: ')) {
              dataStr = sub.replace('data: ', '').trim();
            }
          }

          if (!dataStr) continue;

          {
            const parsedData = JSON.parse(dataStr);

            if (eventType === 'activity') {
              const step: ActivityStep = parsedData;
              setMessages((previous) => previous.map((message) => message.id === assistantMsgId ? { ...message, activities: [...(message.activities ?? []).filter((item) => item.id !== step.id), step] } : message));
            } else if (eventType === 'token') {
              accumulatedContent += parsedData.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: accumulatedContent, isStreaming: true }
                    : m
                )
              );
            } else if (eventType === 'tool_call') {
              setStreamingState((s) => ({
                ...s,
                currentToolCall: parsedData,
              }));
            } else if (eventType === 'tool_result') {
              completedTools.push(parsedData);
              setStreamingState((s) => ({
                ...s,
                currentToolCall: undefined,
                completedTools: [...s.completedTools, parsedData],
              }));
            } else if (eventType === 'handoff') {
              setStreamingState((s) => ({
                ...s,
                handoff: parsedData,
              }));

            } else if (eventType === 'done') {
              completed = true;
              if (parsedData.conversationId && !activeConversationId) {
                setActiveConversationId(parsedData.conversationId);
                setSearchParams({ agent: selectedAgent, conversation: parsedData.conversationId });
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: parsedData.response || accumulatedContent,
                        agentId: parsedData.agentId,
                        toolCalls: [...completedTools],
                        activities: parsedData.activities ?? m.activities,
                        isStreaming: false,
                      }
                    : m
                )
              );
            } else if (eventType === 'error') {
              streamError = parsedData.message;
              setErrorMessage(parsedData.message);
              if (parsedData.conversationId) {
                setActiveConversationId(parsedData.conversationId);
                setSearchParams({ agent: selectedAgent, conversation: parsedData.conversationId });
              }
              setMessages((previous) => previous.map((message) => message.id === assistantMsgId ? {
                ...message, content: parsedData.message, agentId: parsedData.agentId ?? message.agentId,
                activities: parsedData.activities ?? message.activities,
              } : message));
            }
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!completed && !controller.signal.aborted) throw new Error('Chat ended before a complete response was received. Check the conversation before retrying.');
      refetchConversations();
      queryClient.invalidateQueries({ queryKey: ['agentActivity'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Stream connection error');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
      );
    }
  };

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setSearchParams({ agent: selectedAgent });
    retryRequestRef.current = null;
    setMessages([]);
    setStreamingState({ completedTools: [] });
    setErrorMessage(null);
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden max-w-7xl mx-auto">
      {/* Sidebar: Conversation History */}
      <div className="w-64 border-r border-slate-200 bg-slate-50/70 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-200">
          <button
            data-testid="chat-new"
            disabled={isStreaming}
            onClick={startNewConversation}
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Consultation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
            Past Consultations
          </p>
          {conversations?.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">No past consultations.</p>
          ) : (
            conversations?.map((conv: any) => (
              <button
                key={conv.id}
                data-testid={`conversation-${conv.id}`}
                disabled={isStreaming}
                onClick={() => {
                  setActiveConversationId(conv.id);
                  setSearchParams({ agent: selectedAgent, conversation: conv.id });
                }}
                className={`w-full text-left p-2.5 rounded-xl text-xs transition-all ${
                  activeConversationId === conv.id
                    ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="truncate font-medium">{conv.title || 'Consultation'}</div>
                <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                  <span>{conv.agentName?.split(' ')[0]}</span>
                  <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Active Session Footer */}
        <div className="p-3 border-t border-slate-200 bg-white text-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Caller Identity</p>
          <div className="font-semibold text-slate-800 truncate">{currentUser?.name}</div>
          <div className="text-[10px] text-slate-500 font-mono">
            {currentUser?.role} {currentUser?.mrn ? `• ${currentUser.mrn}` : ''}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Agent Selector */}
        <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {agents.map((ag) => {
              const Icon = ag.icon;
              const isSelected = selectedAgent === ag.id;
              return (
                <button
                  key={ag.id}
                  data-testid={`agent-${ag.id}`}
                  disabled={isStreaming}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedAgent(ag.id);
                    setSearchParams({ agent: ag.id, ...(activeConversationId ? { conversation: activeConversationId } : {}) });
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{ag.name}</span>
                </button>
              );
            })}
          </div>

          <span className="text-[11px] text-slate-400 hidden sm:inline">
            {health?.services.ollama.status === 'ready' ? 'Ollama connected' : 'Ollama unavailable'} | {health?.hospitalTimezone}
          </span>
        </div>

        {/* Messages Stream Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 shadow-xs">
                <Bot className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Hospital AI Agent Concierge</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Ask questions to manage appointments, review verified clinical history, check lab status, or coordinate support.
              </p>

              {/* Sample Prompts */}
              <div className="mt-6 w-full space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-left mb-2">
                  Sample Prompts
                </p>
                <div className="flex flex-col gap-1.5">
                  {quickPrompts.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      onClick={() => handleSendMessage(p)}
                      className="text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 text-xs text-slate-700 transition-colors"
                    >
                      "{p}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.senderRole === 'user';
              return (
                <div key={m.id} data-testid={`message-${m.senderRole}`} data-agent-id={m.agentId} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-2xl rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-br-xs shadow-xs'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-xs'
                  }`}>
                    {!isUser && m.agentId && (
                      <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">
                        {agents.find((a) => a.id === m.agentId)?.name || m.agentId}
                      </div>
                    )}

                    <div className="font-sans">
                      {isUser ? <div className="whitespace-pre-wrap">{m.content}</div> : <ChatMarkdown content={m.content} />}
                      {m.isStreaming && <span className="inline-block w-1.5 h-3.5 bg-blue-600 ml-1 animate-pulse align-middle" />}
                    </div>
                    {!isUser && ((m.activities?.length ?? 0) > 0 || (m.toolCalls?.length ?? 0) > 0) && (
                      <ChatActivity steps={m.activities?.length ? m.activities : (m.toolCalls ?? []).map(activityFromToolResult)} />
                    )}
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span role="alert" data-testid="chat-error">{errorMessage}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-200 bg-white">
          {/* Quick chips when chat has messages */}
          {messages.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none">
              {quickPrompts.slice(0, 3).map((qp) => (
                <button
                  key={qp}
                  onClick={() => handleSendMessage(qp)}
                  className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-[11px] font-medium whitespace-nowrap transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              data-testid="chat-input"
              aria-label="Chat message"
              type="text"
              placeholder={`Message ${agents.find((a) => a.id === selectedAgent)?.name}...`}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isStreaming}
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <StopCircle className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button
                data-testid="chat-send"
                type="submit"
                disabled={!inputMessage.trim()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shadow-xs"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

