"use client";

import Link from "next/link";
import { KeyRound, LogOut, SquarePlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { startInstall, useInstall } from "@/hooks/use-install";
import { useSessionUser } from "./auth-gate";

/**
 * The header's account button: shows who is signed in and leads to the
 * account page and to signing out. It takes the place of the old sign-out
 * button, so the header keeps the same number of controls on a phone. On
 * a phone or tablet that hasn't installed Streakly, it also offers adding
 * it to the Home Screen, which stays here after the one-time tip is gone.
 */
export function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const user = useSessionUser();
  const { available } = useInstall();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="tap-44 size-10 rounded-full sm:size-9"
          aria-label="Account"
        >
          <UserRound className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs text-muted-foreground">Signed in as</span>
          <span className="block truncate font-medium">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available ? (
          <DropdownMenuItem onSelect={startInstall}>
            <SquarePlus className="h-4 w-4" aria-hidden />
            Add to Home Screen
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/account">
            <KeyRound className="h-4 w-4" aria-hidden />
            Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
