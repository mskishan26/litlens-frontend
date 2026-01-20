"use client";

import { AssistantRuntimeProvider, useThread, ThreadPrimitive, useAssistantState, useAssistantRuntime, unstable_useRemoteThreadListRuntime } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { createRemoteThreadListAdapter } from "@/lib/thread-list-adapter";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import {
  HallucinationCheckProvider,
  useHallucinationCheck,
} from "@/components/assistant-ui/thread";
import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { LoginModal } from "@/components/auth/LoginModal";
import { UserMenu } from "@/components/auth/UserMenu";
import { useChatStore } from "@/lib/chat-store";
import { useRouter } from "next/navigation";

const ThreadTitle = () => {
  const title = useAssistantState((state: any) => {
    const threadId = state.threadId;
    const threads = state.threads;
    if (!threads || !threadId) return null;

    // Check if threads is array
    if (Array.isArray(threads)) {
      return threads.find((t: any) => t.id === threadId)?.title;
    }

    // Check if threads is global store with .get
    if (typeof threads.get === 'function') {
      return threads.get(threadId)?.title;
    }

    // Check if threads is keyed object
    return threads[threadId]?.title;
  });

  return <span className='font-semibold'>{title || "New Chat"}</span>;
};

const AssistantRuntimeLayer = ({ chatId }: { chatId?: string }) => {
  const { user, isAnonymous, loading } = useAuth();

  const { enableHallucinationCheck } = useHallucinationCheck();
  const enableHallucinationCheckRef = useRef(enableHallucinationCheck);

  // Chat store for tracking IDs and queries
  const {
    chatId: storeChatId,
    userQueries,
    titleGenerated,
    setChatId,
    addMessageId,
    addUserQuery,
    setTitleGenerated,
    reset: resetChatStore
  } = useChatStore();

  useEffect(() => {
    enableHallucinationCheckRef.current = enableHallucinationCheck;
  }, [enableHallucinationCheck]);

  // Auto-generate title after 2+ queries for non-anonymous users
  useEffect(() => {
    console.log('[Title] Effect check - queries:', userQueries.length, 'chatId:', storeChatId, 'isAnon:', isAnonymous, 'titleGen:', titleGenerated, 'hasUser:', !!user);
    if (userQueries.length >= 2 && !isAnonymous && storeChatId && !titleGenerated && user) {
      console.log('[Title] Conditions met, generating title...');
      const generateTitle = async () => {
        try {
          const token = await user.getIdToken();
          const res = await fetch('/api/title/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              chat_id: storeChatId,
              queries: userQueries.slice(0, 3)
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setTitleGenerated(true);
            // Store the title to be applied by TitleUpdater component
            if (data.title) {
              useChatStore.getState().setPendingTitle(data.title);
              console.log('[Title] Generated title:', data.title);
            }
            console.log('[Title] Auto-generated title for chat:', storeChatId);
          } else {
            console.error('[Title] Generate failed:', await res.text());
          }
        } catch (err) {
          console.error('[Title] Failed to generate title:', err);
        }
      };
      generateTitle();
    }
  }, [userQueries.length, storeChatId, isAnonymous, titleGenerated, user, userQueries, setTitleGenerated]);

  // Create thread list adapter (memoized to prevent recreation)
  const threadListAdapter = useMemo(() => {
    return createRemoteThreadListAdapter(() => user);
  }, [user]);

  // Inner hook for the chat runtime - will be called by useRemoteThreadListRuntime
  const useChatRuntimeInner = () => {
    return useChatRuntime({
      transport: new AssistantChatTransport({
        api: "/api/chat",
        fetch: async (input, init) => {
          const url = new URL(input.toString(), window.location.origin);
          url.searchParams.set(
            "check",
            String(enableHallucinationCheckRef.current)
          );

          // Only pass existing conversation ID if we have a valid one from the store
          // Don't pass auto-generated conversation IDs
          const currentChatId = useChatStore.getState().chatId;
          if (currentChatId && currentChatId.startsWith('conv_')) {
            url.searchParams.set("conv_id", currentChatId);
            console.log('[Chat] Using existing chatId:', currentChatId);
          } else {
            console.log('[Chat] No valid chatId found, letting backend create new one');
          }

          const headers = new Headers(init?.headers);

          // SECURITY: Send Firebase ID token instead of plain UID
          if (user) {
            try {
              const idToken = await user.getIdToken();
              headers.set("Authorization", `Bearer ${idToken}`);
            } catch (error) {
              console.error("Failed to get ID token:", error);
            }
          }

          // Add X-User-Anonymous header
          headers.set("X-User-Anonymous", String(isAnonymous));

          // Extract query from request body for tracking
          try {
            if (init?.body) {
              console.log('[Chat] Body type:', typeof init.body, init.body?.constructor?.name);

              // Body could be string, ReadableStream, or other types
              let bodyText: string | null = null;
              if (typeof init.body === 'string') {
                bodyText = init.body;
              } else if (init.body instanceof ArrayBuffer) {
                bodyText = new TextDecoder().decode(init.body);
              } else if (init.body instanceof Blob) {
                bodyText = await init.body.text();
              }

              if (bodyText) {
                console.log('[Chat] Parsed body text (first 200 chars):', bodyText.slice(0, 200));
                const bodyJson = JSON.parse(bodyText);
                const messages = bodyJson.messages;
                if (messages && messages.length > 0) {
                  const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop();
                  if (lastUserMsg) {
                    let content = '';

                    // Handle different message formats
                    if (lastUserMsg.content) {
                      // Standard format: content is string or array
                      content = typeof lastUserMsg.content === 'string'
                        ? lastUserMsg.content
                        : lastUserMsg.content.map((p: any) => p.text || '').join('');
                    } else if (lastUserMsg.parts) {
                      // assistant-ui format: parts array with {type, text}
                      content = lastUserMsg.parts
                        .filter((p: any) => p.type === 'text')
                        .map((p: any) => p.text || '')
                        .join('');
                    }

                    if (content) {
                      useChatStore.getState().addUserQuery(content);
                      console.log('[Chat] Tracked user query:', content.slice(0, 50));
                    }
                  }
                }
              } else {
                console.log('[Chat] Could not extract body text');
              }
            }
          } catch (e) {
            console.log('[Chat] Failed to parse body for query tracking:', e);
          }

          const response = await fetch(url.toString(), {
            ...init,
            headers,
          });

          // Capture IDs from response headers
          const conversationId = response.headers.get('x-conversation-id');
          const messageId = response.headers.get('x-message-id');

          console.log('[Chat] Response headers - conversationId:', conversationId, 'messageId:', messageId);

          if (conversationId && conversationId.startsWith('conv_')) {
            const currentChatId = useChatStore.getState().chatId;
            if (!currentChatId || currentChatId !== conversationId) {
              useChatStore.getState().setChatId(conversationId);
              console.log('[Chat] Set chatId:', conversationId);
            }
          }
          if (messageId) {
            useChatStore.getState().addMessageId(messageId);
            console.log('[Chat] Added messageId:', messageId);
          }

          return response;
        },
      }),
    });
  };

  // Always use remote thread list runtime (adapter handles anonymous users)
  const runtime = unstable_useRemoteThreadListRuntime({
    runtimeHook: useChatRuntimeInner,
    adapter: threadListAdapter,
  });

  if (loading) {
    return <div className="flex h-dvh w-full items-center justify-center bg-background text-muted-foreground">Loading...</div>;
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MessageHistoryLoader />
      <TitleUpdater />
      <UrlSync chatId={chatId} />
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      <ThreadPrimitive.Root asChild>
                        <ThreadTitle />
                      </ThreadPrimitive.Root>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              {/* Spacer to push UserMenu to the right */}
              <div className="ml-auto" />
              <UserMenu />
            </header>
            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
      <LoginModal />
    </AssistantRuntimeProvider>
  );
};

const UrlSync = ({ chatId }: { chatId?: string }) => {
  const runtime = useAssistantRuntime();
  const router = useRouter();
  const currentChatId = useChatStore((s) => s.chatId);
  const { user, loading: authLoading } = useAuth();
  const [threadsLoaded, setThreadsLoaded] = useState(false);

  // Listen for thread list to be loaded
  useEffect(() => {
    if (!runtime || authLoading) return;

    const checkThreadsLoaded = () => {
      const threads = runtime.threads;
      if (threads && typeof threads.getState === 'function') {
        const state = threads.getState();
        console.log('[UrlSync] Thread list state:', state);
        if (state.threads && state.threads.length > 0) {
          console.log('[UrlSync] Thread list loaded with', state.threads.length, 'threads');
          setThreadsLoaded(true);
        }
      }
    };

    // Check immediately
    checkThreadsLoaded();

    // Also listen for changes
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = runtime.threads?.subscribe?.(checkThreadsLoaded);
    } catch (err) {
      console.log('[UrlSync] Could not subscribe to thread list changes:', err);
    }

    return () => {
      unsubscribe?.();
    };
  }, [runtime, authLoading]);

  // 1. Initial Load / Navigation: If URL has chatId, switch to it (only when threads are loaded)
  useEffect(() => {
    if (chatId && runtime && threadsLoaded) {
      console.log('[UrlSync] Attempting to switch to chat from URL:', chatId);
      
      try {
        runtime.switchToThread(chatId);
        useChatStore.getState().setChatId(chatId);
        console.log('[UrlSync] Successfully switched to chat:', chatId);
      } catch (err: any) {
        console.error('[UrlSync] Failed to switch to chat:', chatId, err);
        // If we can't switch to the thread, treat it as a new chat
        window.history.pushState(null, '', '/');
      }
    }
  }, [chatId, runtime, threadsLoaded]);

  // 2. State Change: If internal chat ID changes (e.g. new chat created), update URL
  useEffect(() => {
    // Only update if we have a user (anonymous or auth) and a valid chatId
    if (currentChatId && currentChatId !== chatId) {
      console.log('[UrlSync] Updating URL to match chat:', currentChatId);
      // Use replace to avoid building up huge history, or push for navigation
      // Using push is better for browser back button behavior
      window.history.pushState(null, '', `/c/${currentChatId}`);
    } else if (!currentChatId && chatId) {
      // If state is cleared (new chat), go to root
      console.log('[UrlSync] Clearing URL (new chat)');
      window.history.pushState(null, '', '/');
    }
  }, [currentChatId, chatId]);

  return null;
};

// Component that applies pending title updates using the runtime
const TitleUpdater = () => {
  const runtime = useAssistantRuntime();
  const pendingTitle = useChatStore((s) => s.pendingTitle);
  const chatId = useChatStore((s) => s.chatId);

  useEffect(() => {
    if (pendingTitle && chatId && runtime) {
      console.log('[TitleUpdater] Applying pending title:', pendingTitle, 'to chat:', chatId);
      try {
        // Try to find and rename the current thread
        const threadList = runtime.threads;
        if (threadList && typeof threadList.getItemById === 'function') {
          const threadItem = threadList.getItemById(chatId);
          if (threadItem && typeof threadItem.rename === 'function') {
            threadItem.rename(pendingTitle);
            console.log('[TitleUpdater] Title applied via runtime');
          }
        }
      } catch (err) {
        console.log('[TitleUpdater] Could not apply title via runtime:', err);
      }
      // Clear pending title
      useChatStore.getState().setPendingTitle(null);
    }
  }, [pendingTitle, chatId, runtime]);

  return null;  // This component doesn't render anything
};

const MessageHistoryLoader = () => {
  const runtime = useAssistantRuntime();
  const thread = useThread();
  const { user } = useAuth();

  // Track which threads we've already loaded to avoid refetching
  const loadedThreads = useRef(new Set<string>());
  const prevThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchAndLoadMessages = async () => {
      // Get thread ID from runtime state
      const currentThreadId = thread.threadId;

      // Skip if no thread, no user, already loaded, or same thread
      if (!currentThreadId || !user) {
        return;
      }

      // Skip if we already loaded this thread
      if (loadedThreads.current.has(currentThreadId)) {
        return;
      }

      // Skip if thread already has messages (it's active/current)
      if (thread.messages && thread.messages.length > 0) {
        loadedThreads.current.add(currentThreadId);
        return;
      }

      // Only fetch when thread ID actually changes to a different thread
      if (prevThreadIdRef.current === currentThreadId) {
        return;
      }

      prevThreadIdRef.current = currentThreadId;
      console.log('[History] Loading messages for thread:', currentThreadId);

      try {
        const token = await user.getIdToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-User-Anonymous': String(user.isAnonymous),
        };

        const res = await fetch(`/api/chats/${currentThreadId}/messages`, { headers });

        if (res.ok) {
          const data = await res.json();
          console.log('[History] Raw response data:', JSON.stringify(data, null, 2));
          console.log('[History] Received messages:', data.messages?.length || 0);

          if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
            // Log first message structure for debugging
            console.log('[History] First message structure:', JSON.stringify(data.messages[0], null, 2));

            // Convert backend messages to assistant-ui format
            // Backend format: each message has both 'query' (user) and 'answer' (assistant)
            // We need to split each into two separate messages
            const convertedMessages: any[] = [];

            data.messages.forEach((msg: any) => {
              const messageId = msg.MessageId || msg.message_id || msg.id || `msg-${Date.now()}`;
              const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();

              console.log('[History] Processing backend message:', { messageId, hasQuery: !!msg.query, hasAnswer: !!msg.answer });

              // Create user message from query
              // ThreadMessage format requires: id, role, createdAt, content, metadata
              if (msg.query) {
                const userMessage = {
                  id: `${messageId}-user`,
                  role: 'user' as const,
                  createdAt: timestamp,
                  content: [{ type: 'text' as const, text: msg.query }],
                  metadata: {
                    unstable_annotations: [],
                    unstable_data: [],
                    steps: [],
                    custom: {},
                  },
                };
                console.log('[History] Created user message:', { id: userMessage.id, contentLength: msg.query.length });
                convertedMessages.push(userMessage);
              }

              // Create assistant message from answer
              if (msg.answer) {
                const assistantMessage = {
                  id: `${messageId}-assistant`,
                  role: 'assistant' as const,
                  status: { type: 'complete' as const, reason: 'stop' as const },
                  createdAt: timestamp,
                  content: [{ type: 'text' as const, text: msg.answer }],
                  metadata: {
                    unstable_annotations: [],
                    unstable_data: [],
                    steps: [],
                    custom: {
                      sources: msg.sources || [],
                      hallucination: msg.hallucination_check,
                    },
                  },
                };
                console.log('[History] Created assistant message:', { id: assistantMessage.id, contentLength: msg.answer.length, hasSources: !!(msg.sources && msg.sources.length > 0) });
                convertedMessages.push(assistantMessage);
              }

              console.log('[History] Converted message pair:', messageId);
            });

            console.log('[History] Converted messages:', convertedMessages.length);

            // Validate message format before importing
            console.log('[History] Validating message format...');
            convertedMessages.forEach((msg, index) => {
              const validation = {
                id: msg.id,
                role: msg.role,
                hasValidRole: msg.role === 'user' || msg.role === 'assistant',
                hasContent: msg.content && Array.isArray(msg.content) && msg.content.length > 0,
                contentStructure: msg.content?.[0] ? {
                  hasType: !!msg.content[0].type,
                  type: msg.content[0].type,
                  hasText: !!msg.content[0].text,
                  textLength: msg.content[0].text?.length || 0
                } : null,
                hasMetadata: !!msg.metadata,
                metadataStructure: msg.metadata ? {
                  hasCustom: !!msg.metadata.custom,
                  hasUnstableAnnotations: !!msg.metadata.unstable_annotations,
                  hasUnstableData: !!msg.metadata.unstable_data,
                  hasSteps: !!msg.metadata.steps
                } : null,
                hasStatus: msg.role === 'assistant' ? !!msg.status : 'N/A',
                statusStructure: msg.status ? {
                  hasType: !!msg.status.type,
                  type: msg.status.type,
                  hasReason: !!msg.status.reason,
                  reason: msg.status.reason
                } : null
              };
              
              console.log(`[History] Message ${index} validation:`, validation);
              
              // Check for missing required fields
              if (!validation.hasValidRole || !validation.hasContent || !validation.hasMetadata) {
                console.error(`[History] Message ${index} FAILED validation:`, validation);
              }
            });

            // Debug: log what methods are available on runtime.thread
            console.log('[History] runtime.thread methods:', runtime.thread ? Object.keys(runtime.thread) : 'no thread');

            // Try to import messages into the thread
            // First try import, if it fails, try reset with initial messages
            try {
              console.log('[History] Attempting import with', convertedMessages.length, 'messages');

              // Build proper ExportedMessageRepository format
              const importRepository = {
                headId: convertedMessages.length > 0
                  ? convertedMessages[convertedMessages.length - 1].id
                  : null,
                messages: convertedMessages.map((msg, index) => ({
                  message: msg,
                  parentId: index === 0 ? null : convertedMessages[index - 1].id,
                })),
              };

              console.log('[History] Import repository format:', { 
                headId: importRepository.headId, 
                messageCount: importRepository.messages.length 
              });

              // Try reset with initial messages instead of import
              if (runtime.thread && typeof runtime.thread.reset === 'function') {
                try {
                  console.log('[History] Before reset - thread state:', {
                    messageCount: runtime.thread.getState().messages?.length || 0
                  });
                  
                  // Reset with initial messages
                  runtime.thread.reset(convertedMessages);
                  console.log('[History] Thread reset with initial messages!');
                  
                  // Check thread state IMMEDIATELY after reset
                  const immediateState = runtime.thread.getState();
                  console.log('[History] IMMEDIATE thread state after reset:', {
                    messageCount: immediateState.messages?.length || 0,
                    messageIds: immediateState.messages?.map((m: any) => m.id),
                    threadId: immediateState.threadId
                  });
                  
                  // Check thread state after a delay
                  setTimeout(() => {
                    const delayedState = runtime.thread.getState();
                    console.log('[History] DELAYED thread state after reset:', {
                      messageCount: delayedState.messages?.length || 0,
                      messageIds: delayedState.messages?.map((m: any) => m.id),
                      threadId: delayedState.threadId
                    });
                  }, 100);
                  
                } catch (resetErr: any) {
                  console.log('[History] Reset failed, trying fallback append method:', resetErr?.message);
                  
                  // Fallback: append messages one by one
                  for (const msg of convertedMessages) {
                    try {
                      runtime.thread.append(msg);
                      console.log('[History] Appended message via fallback:', msg.id);
                    } catch (appendErr: any) {
                      console.error('[History] Failed to append message via fallback:', msg.id, appendErr?.message);
                    }
                  }
                  console.log('[History] Fallback append completed');
                }
              } else {
                console.log('[History] reset method not available, using append method');
                
                // Fallback: use append method directly
                for (const msg of convertedMessages) {
                  try {
                    runtime.thread.append(msg);
                    console.log('[History] Appended message via fallback:', msg.id);
                  } catch (appendErr: any) {
                    console.error('[History] Failed to append message via fallback:', msg.id, appendErr?.message);
                  }
                }
              }
            } catch (importErr: any) {
              console.log('[History] Import failed:', importErr?.message);
              console.log('[History] Error details:', importErr);
            }

            // Also update the chat store with the thread ID
            useChatStore.getState().setChatId(currentThreadId);

            loadedThreads.current.add(currentThreadId);
          }
        } else {
          const errorText = await res.text();
          console.error('[History] Failed to fetch:', res.status, errorText);
          
          // If backend returns 501 or persistence errors, don't treat as critical error
          if (res.status === 501 || errorText.includes('Persistence not configured')) {
            console.log('[History] Backend persistence not available, treating as new chat');
            loadedThreads.current.add(currentThreadId); // Mark as loaded to prevent retry
          }
        }
      } catch (err) {
        console.error('[History] Error fetching messages:', err);
      }
    };

    fetchAndLoadMessages();
  }, [thread.threadId, thread.messages.length, runtime, user]);

  // This component doesn't render anything visible
  return null;
}

const AssistantImpl = ({ chatId }: { chatId?: string }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-dvh w-full items-center justify-center bg-background text-muted-foreground">Loading...</div>;
  }

  return <AssistantRuntimeLayer key={user?.uid || 'anonymous'} chatId={chatId} />;
};

export const Assistant = ({ chatId }: { chatId?: string }) => {
  return (
    <AuthProvider>
      <HallucinationCheckProvider>
        <AssistantImpl chatId={chatId} />
      </HallucinationCheckProvider>
    </AuthProvider>
  );
};

