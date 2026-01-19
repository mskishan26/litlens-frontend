import { create } from 'zustand';

interface ChatState {
    chatId: string | null;
    messageIds: string[];
    userQueries: string[];
    titleGenerated: boolean;
    pendingTitle: string | null;  // Title waiting to be applied to the thread

    setChatId: (id: string) => void;
    addMessageId: (id: string) => void;
    addUserQuery: (query: string) => void;
    setTitleGenerated: (val: boolean) => void;
    setPendingTitle: (title: string | null) => void;
    reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
    chatId: null,
    messageIds: [],
    userQueries: [],
    titleGenerated: false,
    pendingTitle: null,

    setChatId: (id) => set({ chatId: id }),
    addMessageId: (id) => set((s) => ({
        messageIds: s.messageIds.includes(id) ? s.messageIds : [...s.messageIds, id]
    })),
    addUserQuery: (query) => set((s) => ({
        userQueries: [...s.userQueries.slice(-2), query]
    })),
    setTitleGenerated: (val) => set({ titleGenerated: val }),
    setPendingTitle: (title) => set({ pendingTitle: title }),
    reset: () => set({
        chatId: null,
        messageIds: [],
        userQueries: [],
        titleGenerated: false,
        pendingTitle: null
    }),
}));
