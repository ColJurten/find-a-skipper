'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Avatar, CountBadge, EmptyState, ErrorBanner, LoadingState } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { refreshBadges } from '@/lib/badges';
import { buildVerifyEmailPath, isEmailVerified } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatConversationStamp, formatDateTimeForLocale, interpolate } from '@/lib/i18n/format';
import { localizeRole } from '@/lib/i18n/options';
import { resolveAvatarUrls } from '@/lib/media';
import { missionRoute } from '@/lib/mission';
import type { ConversationSummary, Message } from '@/lib/database.types';

function upsertMessage(list: Message[], incoming: Message) {
  if (list.some((message) => message.id === incoming.id)) return list;
  const optimistic = list.findIndex((message) => message.id.startsWith('tmp-') && message.sender_id === incoming.sender_id && message.text === incoming.text);
  if (optimistic >= 0) {
    const next = [...list];
    next[optimistic] = incoming;
    return next;
  }
  return [...list, incoming].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function conversationName(conversation: ConversationSummary) {
  return conversation.other_role !== 'skipper' && conversation.other_company ? conversation.other_company : conversation.other_name;
}

function MessagesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { copy, locale } = useLocale();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [activeId, setActiveId] = useState<string | null>(params.get('conversation'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(Boolean(params.get('conversation')));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const active = useMemo(() => conversations.find((conversation) => conversation.conversation_id === activeId) || null, [conversations, activeId]);

  const loadConversations = useCallback(async () => {
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('my_conversations');
    if (rpcError) {
      setError(friendlyError(copy, rpcError));
      return;
    }
    const rows = (data as ConversationSummary[]) || [];
    setConversations(rows);
    // A conversation that is not (or no longer) accessible cannot stay open.
    if (activeIdRef.current && !rows.some((row) => row.conversation_id === activeIdRef.current)) {
      setError(copy.messaging.stale);
      setActiveId(null);
    }
    setAvatars(await resolveAvatarUrls(supabase, rows.map((row) => ({ id: row.other_id, avatar_url: row.other_avatar_url }))));
  }, [copy]);

  function selectConversation(conversationId: string | null) {
    if (conversationId === activeId) return;
    setMessages([]);
    setLoadingThread(Boolean(conversationId));
    setActiveId(conversationId);
  }

  const markRead = useCallback(async (conversationId: string) => {
    const supabase = createClient();
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    setConversations((current) => current.map((row) => (row.conversation_id === conversationId ? { ...row, unread_count: 0 } : row)));
    refreshBadges();
  }, []);

  // Initial load + realtime subscription for every conversation of the user.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login?next=/messages');
        return;
      }
      if (!isEmailVerified(user)) {
        router.replace(buildVerifyEmailPath(user.email || null, '/messages'));
        return;
      }
      setUserId(user.id);
      await loadConversations();
      setLoading(false);

      channel = supabase
        .channel(`messaging-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const incoming = payload.new as Message;
          if (incoming.conversation_id === activeIdRef.current) {
            setMessages((current) => upsertMessage(current, incoming));
            if (incoming.sender_id !== user.id) void markRead(incoming.conversation_id);
          }
          void loadConversations();
        })
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadConversations, markRead, router]);

  // Load the selected conversation.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set('conversation', activeId);
    else url.searchParams.delete('conversation');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);

    if (!activeId || !userId) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data, error: fetchError } = await supabase.from('messages').select('*').eq('conversation_id', activeId).order('created_at', { ascending: true });
      if (cancelled) return;
      setLoadingThread(false);
      if (fetchError) {
        setError(friendlyError(copy, fetchError));
        return;
      }
      setError('');
      setMessages((data as Message[]) || []);
      void markRead(activeId);
      inputRef.current?.focus();
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, userId, copy, markRead]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !activeId || !userId || sending) return;
    setSending(true);
    setError('');
    const optimistic: Message = { id: `tmp-${Date.now()}`, conversation_id: activeId, sender_id: userId, text, created_at: new Date().toISOString(), read_at: null };
    // The message appears immediately and the user stays in the conversation.
    setMessages((current) => [...current, optimistic]);
    setDraft('');
    const supabase = createClient();
    const { data, error: insertError } = await supabase.from('messages').insert({ conversation_id: activeId, sender_id: userId, text }).select('*').single();
    setSending(false);
    if (insertError) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setDraft(text);
      setError(friendlyError(copy, insertError));
      return;
    }
    setMessages((current) => upsertMessage(current, data as Message));
    setConversations((current) => {
      const updated = current.map((row) => (row.conversation_id === activeId ? { ...row, last_message: text, last_message_at: (data as Message).created_at, last_sender_id: userId } : row));
      return updated.sort((left, right) => right.last_message_at.localeCompare(left.last_message_at));
    });
    inputRef.current?.focus();
  }

  if (loading) return <LoadingState label={copy.common.loading} />;

  return (
    <main className="mx-auto max-w-6xl px-0 py-0 sm:px-6 sm:py-8">
      <h1 className="font-display mb-4 hidden text-3xl font-bold text-marine sm:block">{copy.messaging.title}</h1>
      <div className="px-4 sm:px-0"><ErrorBanner message={error} /></div>

      {conversations.length === 0 ? (
        <div className="px-4 py-8 sm:px-0 sm:py-0">
          <EmptyState text={copy.messaging.empty} />
        </div>
      ) : (
        <div className="flex h-[calc(100svh-73px)] overflow-hidden border-navy/[0.08] bg-white sm:h-[calc(100svh-220px)] sm:min-h-[520px] sm:rounded-2xl sm:border">
          {/* Conversation list (left) */}
          <aside className={`w-full shrink-0 flex-col border-e border-navy/[0.08] md:flex md:w-80 ${activeId ? 'hidden' : 'flex'}`}>
            <div className="border-b border-navy/[0.08] px-4 py-3 sm:hidden">
              <h1 className="font-display text-xl font-bold text-marine">{copy.messaging.title}</h1>
            </div>
            <ul className="flex-1 overflow-y-auto">
              {conversations.map((conversation) => {
                const name = conversationName(conversation);
                const mine = conversation.last_sender_id === userId;
                const selected = conversation.conversation_id === activeId;
                return (
                  <li key={conversation.conversation_id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(conversation.conversation_id)}
                      className={`flex w-full items-center gap-3 border-b border-navy/[0.05] px-4 py-3 text-start transition ${selected ? 'bg-lightblue' : 'hover:bg-offwhite'}`}
                    >
                      <Avatar name={name} url={avatars[conversation.other_id]} size={48} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-bold text-anthracite">{name}</span>
                          <span className={`shrink-0 text-[11px] ${conversation.unread_count ? 'font-semibold text-emerald-700' : 'text-gray-400'}`}>
                            {formatConversationStamp(conversation.last_message_at, locale)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-normal text-gray-600">
                            {conversation.last_message ? `${mine ? copy.messaging.you : ''}${conversation.last_message}` : interpolate(copy.messaging.mission, { route: missionRoute({ departure: conversation.mission_departure, destination: conversation.mission_destination }) })}
                          </span>
                          <CountBadge count={conversation.unread_count} label={interpolate(copy.messaging.unread, { count: conversation.unread_count })} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Conversation (right) */}
          <section className={`min-w-0 flex-1 flex-col ${activeId ? 'flex' : 'hidden md:flex'}`}>
            {!active ? (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">{copy.messaging.select}</div>
            ) : (
              <>
                <header className="flex items-center gap-3 border-b border-navy/[0.08] px-3 py-2.5 sm:px-4">
                  <button type="button" onClick={() => selectConversation(null)} className="rounded-lg p-2 text-marine hover:bg-lightblue md:hidden" aria-label={copy.messaging.back}>
                    <ArrowLeft size={18} className="rtl:rotate-180" />
                  </button>
                  <Avatar name={conversationName(active)} url={avatars[active.other_id]} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{conversationName(active)}</p>
                    <Link href={`/missions/${active.mission_id}`} className="block truncate text-xs text-gray-500 hover:text-marine hover:underline">
                      {localizeRole(copy, active.other_role)} · {interpolate(copy.messaging.mission, { route: missionRoute({ departure: active.mission_departure, destination: active.mission_destination }) })}
                    </Link>
                  </div>
                </header>

                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,#f4f8fc_0%,#fafcfe_100%)] px-3 py-4 sm:px-6">
                  {loadingThread ? (
                    <div className="flex justify-center py-10 text-gray-400"><Loader2 className="animate-spin" size={20} /></div>
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-gray-500">{copy.messaging.first}</p>
                  ) : (
                    messages.map((message) => {
                      const mine = message.sender_id === userId;
                      return (
                        <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] shadow-sm sm:max-w-[70%] ${mine ? 'rounded-ee-md bg-marine text-white' : 'rounded-es-md bg-white text-anthracite'} ${message.id.startsWith('tmp-') ? 'opacity-70' : ''}`}>
                            <p dir="auto" className="whitespace-pre-wrap break-words">{message.text}</p>
                            <p className={`mt-0.5 text-end text-[10px] ${mine ? 'text-white/70' : 'text-gray-400'}`}>
                              {formatDateTimeForLocale(message.created_at, locale, { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-navy/[0.08] p-2.5 sm:p-3">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    maxLength={4000}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder={copy.messaging.placeholder}
                    aria-label={copy.messaging.placeholder}
                    className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-[15px] outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                  />
                  <button type="submit" disabled={!draft.trim() || sending} aria-label={copy.messaging.send} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marine text-white transition disabled:opacity-40">
                    {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} className="rtl:-scale-x-100" />}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default function MessagesPage() {
  const { copy } = useLocale();
  return (
    <Suspense fallback={<LoadingState label={copy.common.loading} />}>
      <MessagesInner />
    </Suspense>
  );
}
