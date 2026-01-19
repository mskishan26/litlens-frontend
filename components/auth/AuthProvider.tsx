"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import {
    getFirebaseAuth,
    googleProvider,
    signInAnonymously,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    firebaseSignOut,
    linkWithCredential,
    EmailAuthProvider,
    type User,
} from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

// Query limits from env (with defaults)
const ANON_QUERY_LIMIT = parseInt(
    process.env.NEXT_PUBLIC_ANON_QUERY_LIMIT || "10",
    10
);
const AUTH_QUERY_LIMIT = parseInt(
    process.env.NEXT_PUBLIC_AUTH_QUERY_LIMIT || "50",
    10
);

interface AuthContextType {
    user: User | null;
    isAnonymous: boolean;
    loading: boolean;
    queryCount: number;
    dailyLimit: number;
    canQuery: () => boolean;
    incrementQueryCount: () => void;
    signInWithGoogle: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    showLoginModal: boolean;
    setShowLoginModal: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Get today's date string for localStorage key
const getTodayKey = () => {
    return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
};

// localStorage helpers
const getQueryCount = (userId: string): number => {
    if (typeof window === "undefined") return 0;
    const key = `queries_${userId}_${getTodayKey()}`;
    const stored = localStorage.getItem(key);
    return stored ? parseInt(stored, 10) : 0;
};

const setQueryCount = (userId: string, count: number): void => {
    if (typeof window === "undefined") return;
    const key = `queries_${userId}_${getTodayKey()}`;
    localStorage.setItem(key, count.toString());
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [queryCount, setQueryCountState] = useState(0);
    const [showLoginModal, setShowLoginModal] = useState(false);

    const isAnonymous = user?.isAnonymous ?? true;
    const dailyLimit = isAnonymous ? ANON_QUERY_LIMIT : AUTH_QUERY_LIMIT;

    // Load query count when user changes
    useEffect(() => {
        if (user) {
            const count = getQueryCount(user.uid);
            setQueryCountState(count);
        }
    }, [user]);

    // Listen to auth state
    useEffect(() => {
        const auth = getFirebaseAuth();
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
            } else {
                // No user, sign in anonymously
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Anonymous sign-in failed:", error);
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const canQuery = useCallback(() => {
        return queryCount < dailyLimit;
    }, [queryCount, dailyLimit]);

    const incrementQueryCount = useCallback(() => {
        if (!user) return;
        const newCount = queryCount + 1;
        setQueryCountState(newCount);
        setQueryCount(user.uid, newCount);

        // Check if limit reached after increment
        if (newCount >= dailyLimit) {
            setShowLoginModal(true);
        }
    }, [user, queryCount, dailyLimit]);

    const signInWithGoogle = useCallback(async () => {
        try {
            const auth = getFirebaseAuth();
            if (user?.isAnonymous) {
                // Link anonymous account with Google
                await signInWithPopup(auth, googleProvider);
            } else {
                await signInWithPopup(auth, googleProvider);
            }
            setShowLoginModal(false);
        } catch (error) {
            console.error("Google sign-in failed:", error);
            throw error;
        }
    }, [user]);

    const signInWithEmail = useCallback(
        async (email: string, password: string) => {
            try {
                const auth = getFirebaseAuth();
                await signInWithEmailAndPassword(auth, email, password);
                setShowLoginModal(false);
            } catch (error) {
                console.error("Email sign-in failed:", error);
                throw error;
            }
        },
        []
    );

    const signUpWithEmail = useCallback(
        async (email: string, password: string) => {
            try {
                if (user?.isAnonymous) {
                    // Link anonymous account with email/password
                    const credential = EmailAuthProvider.credential(email, password);
                    await linkWithCredential(user, credential);
                } else {
                    const auth = getFirebaseAuth();
                    await createUserWithEmailAndPassword(auth, email, password);
                }
                setShowLoginModal(false);
            } catch (error) {
                console.error("Email sign-up failed:", error);
                throw error;
            }
        },
        [user]
    );

    const signOut = useCallback(async () => {
        try {
            const auth = getFirebaseAuth();
            await firebaseSignOut(auth);
            // Will trigger onAuthStateChanged → anonymous sign-in
        } catch (error) {
            console.error("Sign-out failed:", error);
            throw error;
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                isAnonymous,
                loading,
                queryCount,
                dailyLimit,
                canQuery,
                incrementQueryCount,
                signInWithGoogle,
                signInWithEmail,
                signUpWithEmail,
                signOut,
                showLoginModal,
                setShowLoginModal,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
