"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A password input with a show/hide toggle. `aside` sits at the end of the
 * label row (the sign-in form puts "Forgot password?" there), and `hint`
 * sits under the input, linked to it for screen readers.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  errorId,
  hint,
  aside,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  /** The id of the error message that describes this field when it is invalid. */
  errorId?: string;
  hint?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const [shown, setShown] = React.useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [invalid ? errorId : null, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="h-11 pr-11"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The message box at the top of an auth form. "error" is an alert that
 * screen readers announce at once; "success" is a polite status.
 */
export function FormMessage({
  id,
  tone,
  children,
}: {
  id?: string;
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
          : "flex items-start gap-2 rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300"
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
