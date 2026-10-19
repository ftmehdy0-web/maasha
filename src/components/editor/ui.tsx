"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
  shortcut?: string;
};

/** Square icon button; `label` is both the accessible name and the tooltip. */
export function IconButton({ label, children, active, shortcut, className = "", ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-fg/90 transition-colors hover:bg-raised disabled:pointer-events-none disabled:opacity-35 ${
        active ? "bg-raised text-accent-strong" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };

export function Button({ variant = "ghost", className = "", ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    ghost: "bg-raised text-fg hover:bg-line",
    danger: "bg-danger/90 text-white hover:bg-danger",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
      {...rest}
    />
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "h-8 w-full rounded-md border border-line bg-panel-2 px-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent";
