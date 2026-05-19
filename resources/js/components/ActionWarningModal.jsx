import { useState } from "react";
import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export default function ActionWarningModal({
  open,
  title = "Confirm sensitive action",
  description = "Review the impact summary before continuing.",
  impactItems = [],
  requirePassword = false,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  destructive = true,
  isWorking = false,
  onCancel,
  onConfirm,
}) {
  const [password, setPassword] = useState("");

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm?.(requirePassword ? password : undefined);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div className="flex gap-3">
            <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${destructive ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
              {destructive ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close warning modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {impactItems.length > 0 && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-semibold">Impact summary</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {impactItems.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-2">
                    <span className="text-foreground">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {requirePassword && (
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Re-enter your password</Label>
              <PasswordInput
                id="confirm-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Required before archiving records"
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t p-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isWorking}>{cancelLabel}</Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isWorking || (requirePassword && !password)}
            className="gap-2"
          >
            {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
