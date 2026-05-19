import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Building2, CircleAlert, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const notifyAuthError = (error, fallback = "Unable to sign in.") => {
  const message = error.payload?.message || error.message || fallback;
  const severity = error.payload?.severity;

  if (severity === "critical" || error.status === 423) {
    toast.error(message);
    return;
  }

  if (severity === "warning") {
    toast.warning(message);
    return;
  }

  toast.error(message);
};

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (searchParams.get("reset") === "success") {
      toast.success("Password reset successful. Sign in using your new password.");
    }
  }, [searchParams]);

  const handleSuccess = () => {
    toast.success("Signed in successfully.");
    navigate("/");
    window.location.reload();
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setIsSubmitting(true);

    try {
      const response = await base44.auth.login(email, password, remember);
      if (response?.mfa_required) {
        setMfaRequired(true);
        toast.info(response.message || "Verification code sent to your email.");
        return;
      }
      handleSuccess();
    } catch (error) {
      const nextErrors = error.payload?.errors || {};
      setErrors(nextErrors);
      const message =
        error.payload?.message ||
        nextErrors.email?.[0] ||
        nextErrors.password?.[0] ||
        error.message ||
        "Unable to sign in.";
      setFormError(message);
      notifyAuthError(error, "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyMfa = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setIsSubmitting(true);

    try {
      await base44.auth.verifyMfa(email, mfaCode, remember);
      handleSuccess();
    } catch (error) {
      const nextErrors = error.payload?.errors || {};
      setErrors(nextErrors);
      const message = nextErrors.code?.[0] || error.message || "Invalid verification code.";
      setFormError(message);
      toast.warning(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <CardTitle className="text-2xl">Sign in to DocTracker</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Secure document routing, tracking, reporting, and audit monitoring portal.
          </p>
        </CardHeader>

        <CardContent>
          {!mfaRequired ? (
            <form className="space-y-5" onSubmit={handleSignIn}>
              {searchParams.get("reset") === "success" && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>Password reset successful. Sign in using your new password.</AlertDescription>
                </Alert>
              )}

              {formError && (
                <Alert variant="destructive">
                  <CircleAlert className="h-4 w-4" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email || formError) {
                      setErrors((prev) => ({ ...prev, email: undefined }));
                      setFormError("");
                    }
                  }}
                  placeholder="Enter your email address"
                  className={`h-12 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  aria-invalid={Boolean(errors.email)}
                  autoComplete="email"
                  required
                />
                {errors.email?.[0] && (
                  <p className="text-sm text-destructive">{errors.email[0]}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <PasswordInput
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password || formError) {
                      setErrors((prev) => ({ ...prev, password: undefined }));
                      setFormError("");
                    }
                  }}
                  placeholder="Enter your password"
                  className={`h-12 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="current-password"
                  required
                />
                {errors.password?.[0] && (
                  <p className="text-sm text-destructive">{errors.password[0]}</p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    className="h-4 w-4 rounded border"
                  />
                  Remember this device
                </label>
                <Link to="/forgot-password" className="text-primary font-medium hover:underline">Forgot password?</Link>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full h-12">
                {isSubmitting ? "Signing in..." : "Sign In"}
              </Button>

              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px bg-border flex-1" />
                  Optional social login placeholders
                  <div className="h-px bg-border flex-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button type="button" variant="outline" disabled className="gap-2">
                    <LockKeyhole className="w-4 h-4" /> Google
                  </Button>
                  <Button type="button" variant="outline" disabled className="gap-2">
                    <LockKeyhole className="w-4 h-4" /> GitHub
                  </Button>
                  <Button type="button" variant="outline" disabled className="gap-2">
                    <LockKeyhole className="w-4 h-4" /> Facebook
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Social sign-in/register buttons are UI placeholders only and are not connected to OAuth yet.
                </p>
              </div>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleVerifyMfa}>
              {formError && (
                <Alert variant="destructive">
                  <CircleAlert className="h-4 w-4" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  Enter the 6-digit verification code sent to your email address.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Verification Code</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className={`h-12 text-center text-lg tracking-[0.35em] ${errors.code ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  aria-invalid={Boolean(errors.code)}
                  autoComplete="one-time-code"
                />
                {errors.code?.[0] && <p className="text-sm text-destructive">{errors.code[0]}</p>}
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setMfaRequired(false)}>
                  Back
                </Button>
                <Button type="submit" disabled={isSubmitting || mfaCode.length !== 6} className="h-12 flex-1">
                  {isSubmitting ? "Verifying..." : "Verify"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
