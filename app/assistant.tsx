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

const AssistantRuntimeLayer = () => {
  const { user, isAnonymous, loading } = useAuth();

  const { enableHallucinationCheck } = useHallucinationCheck();
  const enableHallucinationCheckRef = useRef(enableHallucinationCheck);

  // Chat store for tracking IDs and queries
  const {
    chatId,
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
    console.log('[Title] Effect check - queries:', userQueries.length, 'chatId:', chatId, 'isAnon:', isAnonymous, 'titleGen:', titleGenerated, 'hasUser:', !!user);

    if (userQueries.length >= 2 && !isAnonymous && chatId && !titleGenerated && user) {
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
              chat_id: chatId,
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
            console.log('[Title] Auto-generated title for chat:', chatId);
          } else {
            console.error('[Title] Generate failed:', await res.text());
          }
        } catch (err) {
          console.error('[Title] Failed to generate title:', err);
        }
      };
      generateTitle();
    }
  }, [userQueries.length, chatId, isAnonymous, titleGenerated, user, userQueries, setTitleGenerated]);

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

          // Pass existing conversation ID to maintain continuity
          const currentChatId = useChatStore.getState().chatId;
          if (currentChatId) {
            url.searchParams.set("conv_id", currentChatId);
            console.log('[Chat] Using existing chatId:', currentChatId);
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

          if (conversationId) {
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
  const threadId = useAssistantState((s: any) => s.threadId);
  const threads = useAssistantState((s: any) => s.threads);
  console.log('[History] Loader Selectors - ThreadId:', threadId, 'Threads:', threads?.length);

  useEffect(() => {
    console.log('!!! LOADER MOUNTED !!!');
    return () => console.log('!!! LOADER UNMOUNTED !!!');
  }, []);

  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  // Use a map to track verification status of threads to avoid refetching
  const loadedThreads = useRef(new Set<string>());

  useEffect(() => {
    const fetchMessages = async () => {
      console.log('[History] Effect triggered. threadId:', threadId, 'isLoading:', isLoading, 'hasUser:', !!user, 'alreadyLoaded:', loadedThreads.current.has(threadId));
      if (!threadId || loadedThreads.current.has(threadId) || isLoading || !user) {
        console.log('[History] Skipping fetch due to conditions');
        return;
      }

      // Check if thread already has messages
      // @ts-ignore
      const threadMessages = runtime.threads?.getItemById(threadId)?.messages;
      if (threadMessages && threadMessages.length > 0) {
        loadedThreads.current.add(threadId);
        return;
      }

      console.log('[History] Fetching messages for thread:', threadId);
      setIsLoading(true);

      try {
        const token = await user.getIdToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        headers['X-User-Anonymous'] = String(user.isAnonymous);

        const res = await fetch(`/api/chats/${threadId}/messages`, { headers });

        if (res.ok) {
          const data = await res.json();
          console.log('[History] Raw messages data:', data);

          if (data.messages && Array.isArray(data.messages)) {
            // Convert messages
            const convertedMessages = data.messages.map((msg: any) => {
              const role = msg.role || (msg.sender === 'user' ? 'user' : 'assistant');
              // Handle different content formats
              let content = msg.content || msg.text || '';
              if (typeof content === 'object') {
                content = JSON.stringify(content);
              }

              return {
                id: msg.id || msg.message_id || Math.random().toString(36).substring(7),
                role,
                content: [{ type: 'text', text: content }],
                metadata: {
                  sources: msg.sources,
                  hallucination: msg.hallucination_check,
                  timestamp: msg.timestamp || msg.created_at
                }
              };
            });

            // Append messages to runtime
            const thread = runtime.threads?.getItemById(threadId);
            if (thread) {
              for (const m of convertedMessages) {
                // @ts-ignore
                if (typeof thread.append === 'function') {
                  // @ts-ignore
                  thread.append(m);
                }
              }
            }

            loadedThreads.current.add(threadId);
          }
        } else {
          console.error('[History] Failed to fetch:', await res.text());
        }
      } catch (err) {
        console.error('[History] Error fetching messages:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [threadId, runtime, user]);

  return <div style={{ position: 'fixed', bottom: 10, right: 10, background: 'red', color: 'white', padding: '10px', zIndex: 9999, pointerEvents: 'none' }}>
    Active Thread: {threadId || 'None'} <br />
    Threads: {Array.isArray(threads) ? threads.length : 'Not Array'} <br />
    Loading: {String(isLoading)}
  </div>;
}

const AssistantImpl = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-dvh w-full items-center justify-center bg-background text-muted-foreground">Loading...</div>;
  }

  return <AssistantRuntimeLayer key={user?.uid || 'anonymous'} />;
};

export const Assistant = () => {
  return (
    <AuthProvider>
      <HallucinationCheckProvider>
        <AssistantImpl />
      </HallucinationCheckProvider>
    </AuthProvider>
  );
};

