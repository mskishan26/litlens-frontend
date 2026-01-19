"use client";

import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, LogOut } from "lucide-react";

export const UserMenu = () => {
    const {
        user,
        isAnonymous,
        loading,
        queryCount,
        dailyLimit,
        signOut,
        setShowLoginModal,
    } = useAuth();

    if (loading) {
        return (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        );
    }

    if (isAnonymous) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                    {queryCount}/{dailyLimit} queries
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLoginModal(true)}
                >
                    Sign In
                </Button>
            </div>
        );
    }

    const userEmail = user?.email || "";
    const userPhoto = user?.photoURL || "";
    const initials = userEmail
        .split("@")[0]
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
                {queryCount}/{dailyLimit} queries
            </span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={userPhoto} alt={userEmail} />
                            <AvatarFallback>
                                {initials || <User className="h-4 w-4" />}
                            </AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">{userEmail}</p>
                            <p className="text-xs leading-none text-muted-foreground">
                                {queryCount} of {dailyLimit} queries used today
                            </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
