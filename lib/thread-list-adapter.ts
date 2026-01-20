/**
 * Remote Thread List Adapter for assistant-ui
 * Implements the RemoteThreadListAdapter interface to sync threads with the backend
 */

import { User } from 'firebase/auth';

// Types matching the RemoteThreadListAdapter interface
export interface RemoteThreadMetadata {
    readonly status: "regular" | "archived";
    readonly remoteId: string;
    readonly externalId?: string | undefined;
    readonly title?: string | undefined;
}

export interface RemoteThreadListResponse {
    threads: RemoteThreadMetadata[];
}

export interface RemoteThreadInitializeResponse {
    remoteId: string;
    externalId: string | undefined;
}

// Backend chat format - flexible to handle various backend responses
interface BackendChat {
    id?: string;
    chat_id?: string;     // Alternative ID field
    ChatId?: string;      // PascalCase ID field from DynamoDB
    _id?: string;         // Alternative ID field
    title?: string;
    is_archived?: boolean;
    created_at?: string;
    updated_at?: string;
}

export function createRemoteThreadListAdapter(getUser: () => User | null) {

    const getAuthHeaders = async (): Promise<Record<string, string> | null> => {
        const user = getUser();
        if (!user) {
            console.log('[ThreadAdapter] User not authenticated yet, returning null');
            return null;
        }
        try {
            const token = await user.getIdToken();
            const isAnon = user.isAnonymous;
            console.log(`[ThreadAdapter] Getting headers for user: ${user.uid} (isAnon: ${isAnon})`);
            return {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-User-Anonymous': String(isAnon),
            };
        } catch (err) {
            console.error('[ThreadAdapter] Failed to get auth token:', err);
            return null;
        }
    };

    return {
        /**
         * List all threads for the current user
         */
        async list(): Promise<RemoteThreadListResponse> {
            try {
                const headers = await getAuthHeaders();
                if (!headers) {
                    console.log('[ThreadAdapter] User not authenticated, returning empty threads');
                    return { threads: [] };
                }
                
                console.log('[ThreadAdapter] Fetching chats from /api/chats');
                const res = await fetch('/api/chats?limit=50', { headers });

                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('[ThreadAdapter] List failed:', res.status, errorText);
                    
                    // If backend returns 501 or persistence errors, return empty threads
                    if (res.status === 501 || errorText.includes('Persistence not configured')) {
                        console.log('[ThreadAdapter] Backend persistence not available, returning empty threads');
                        return { threads: [] };
                    }
                    
                    return { threads: [] };
                }

                const data = await res.json();
                console.log('[ThreadAdapter] Raw chats response:', data);

                // Handle different response formats
                let chats: BackendChat[] = [];
                if (data.chats && Array.isArray(data.chats)) {
                    chats = data.chats;
                } else if (Array.isArray(data)) {
                    chats = data;
                } else if (data.data && Array.isArray(data.data)) {
                    chats = data.data;
                }

                // Transform backend format to RemoteThreadMetadata
                const threads: RemoteThreadMetadata[] = chats.map((chat) => {
                    // robust ID resolution
                    const id = chat.id || chat.chat_id || chat._id || chat.ChatId;
                    if (!id) console.warn('[ThreadAdapter] Chat missing ID:', chat);

                    return {
                        status: (chat.is_archived ? 'archived' : 'regular') as "regular" | "archived",
                        remoteId: id || 'unknown',
                        externalId: id || 'unknown',
                        title: chat.title || 'New Chat',
                    };
                }).filter(t => t.remoteId !== 'unknown'); // Filter out invalid items

                console.log('[ThreadAdapter] Loaded', threads.length, 'threads');
                return { threads };

            } catch (err) {
                console.error('[ThreadAdapter] List error:', err);
                return { threads: [] };
            }
        },

        /**
         * Rename a thread
         */
        async rename(remoteId: string, newTitle: string): Promise<void> {
            try {
                const headers = await getAuthHeaders();
                if (!headers) return;
                const res = await fetch('/api/title/rename', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ chat_id: remoteId, title: newTitle }),
                });

                if (!res.ok) {
                    console.error('[ThreadAdapter] Rename failed:', res.status);
                }
            } catch (err) {
                console.error('[ThreadAdapter] Rename error:', err);
            }
        },

        /**
         * Archive a thread
         */
        async archive(remoteId: string): Promise<void> {
            // TODO: Implement archive endpoint in backend
            console.log('[ThreadAdapter] Archive not implemented:', remoteId);
        },

        /**
         * Unarchive a thread
         */
        async unarchive(remoteId: string): Promise<void> {
            // TODO: Implement unarchive endpoint in backend
            console.log('[ThreadAdapter] Unarchive not implemented:', remoteId);
        },

        /**
         * Delete a thread
         */
        async delete(remoteId: string): Promise<void> {
            // TODO: Implement delete endpoint in backend
            console.log('[ThreadAdapter] Delete not implemented:', remoteId);
        },

        /**
         * Initialize a new thread - called when creating a new conversation
         */
        async initialize(threadId: string): Promise<RemoteThreadInitializeResponse> {
            // Don't generate a chat ID for new threads - let the backend create it on first message
            // Return empty/placeholder values to prevent unwanted chat ID generation
            console.log('[ThreadAdapter] Initialize called for threadId:', threadId, '- deferring to backend');
            return {
                remoteId: '',  // Empty to indicate no remote ID yet
                externalId: '', // Empty to indicate no external ID yet
            };
        },

        /**
         * Generate a title for a thread
         */
        async generateTitle(remoteId: string, messages: readonly any[]): Promise<any> {
            // Extract user messages for title generation
            const userMessages = messages
                .filter(m => m.role === 'user')
                .slice(0, 3)
                .map(m => {
                    if (typeof m.content === 'string') return m.content;
                    if (m.content?.[0]?.text) return m.content[0].text;
                    return '';
                });

            try {
                const headers = await getAuthHeaders();
                if (!headers) return null as any;
                const res = await fetch('/api/title/generate', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ chat_id: remoteId, queries: userMessages }),
                });

                if (res.ok) {
                    const data = await res.json();
                    console.log('[ThreadAdapter] Generated title:', data.title);
                }
            } catch (err) {
                console.error('[ThreadAdapter] Generate title error:', err);
            }

            // Return empty stream - the title update happens via the API
            // This is a simplified implementation
            return null as any;
        },

        /**
         * Fetch a specific thread's metadata
         */
        async fetch(threadId: string): Promise<RemoteThreadMetadata> {
            // Return a default metadata - the actual data comes from list()
            return {
                status: 'regular',
                remoteId: threadId,
                externalId: threadId,
                title: 'New Chat',
            };
        },
    };
}
