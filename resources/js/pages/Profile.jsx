import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Camera, Loader2, Mail, Save, ShieldCheck, UserCircle } from "lucide-react";
import FieldError from "@/components/form/FieldError";
import RequiredLabel from "@/components/form/RequiredLabel";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { firstError, validateFile, validatePhone, validateRequired } from "@/lib/formValidation";

export default function Profile() {
  const queryClient = useQueryClient();
  const { checkUserAuth } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    address: "",
    mfa_enabled: false,
  });
  const [avatar, setAvatar] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    in_app_enabled: true,
    popup_enabled: true,
    email_enabled: true,
    sms_enabled: false,
    system_enabled: true,
    warning_enabled: true,
    critical_enabled: true,
    reminder_enabled: true,
  });

  const [touched, setTouched] = useState({});
  const [hasSaved, setHasSaved] = useState(false);

  const validationErrors = useMemo(() => ({
    full_name: validateRequired(form.full_name, "Full name"),
    phone: validatePhone(form.phone),
    avatar: validateFile(avatar, { allowed: ["jpg", "jpeg", "png", "webp"], maxMb: 2, imageOnly: true }),
  }), [form, avatar]);

  const markTouched = (key) => setTouched((current) => ({ ...current, [key]: true }));
  const showError = (key) => touched[key] ? validationErrors[key] : "";

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => base44.profile.get(),
  });

  const { data: preferences, isLoading: isLoadingPreferences } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => base44.entities.Notification.preferences(),
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name || "",
      phone: profile.phone || "",
      address: profile.address || "",
      mfa_enabled: Boolean(profile.mfa_enabled),
    });
  }, [profile]);

  useEffect(() => {
    if (!preferences) return;
    setNotificationPreferences({
      in_app_enabled: preferences.in_app_enabled ?? true,
      popup_enabled: preferences.popup_enabled ?? true,
      email_enabled: preferences.email_enabled ?? true,
      sms_enabled: preferences.sms_enabled ?? false,
      system_enabled: preferences.system_enabled ?? true,
      warning_enabled: preferences.warning_enabled ?? true,
      critical_enabled: preferences.critical_enabled ?? true,
      reminder_enabled: preferences.reminder_enabled ?? true,
    });
  }, [preferences]);

  const avatarPreview = useMemo(() => {
    if (avatar) return URL.createObjectURL(avatar);
    return profile?.avatar_url || "";
  }, [avatar, profile?.avatar_url]);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatar) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview, avatar]);

  const initials = useMemo(() => {
    const name = form.full_name || profile?.email || "User";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [form.full_name, profile?.email]);

  const isDirty = Boolean(profile && (
    form.full_name !== (profile.full_name || "") ||
    form.phone !== (profile.phone || "") ||
    form.address !== (profile.address || "") ||
    Boolean(avatar) ||
    Boolean(form.mfa_enabled) !== Boolean(profile.mfa_enabled)
  ));

  useEffect(() => {
    if (isDirty) {
      setHasSaved(false);
    }
  }, [isDirty]);

  useUnsavedChanges(isDirty && !hasSaved);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateNotificationPreference = (key, value) => {
    setNotificationPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setTouched({ full_name: true, phone: true, avatar: true });
    const error = firstError(validationErrors);
    if (error) {
      toast.error(error);
      return;
    }
    setIsSaving(true);

    try {
      const updated = await base44.profile.update({
        full_name: form.full_name,
        phone: form.phone,
        address: form.address,
        mfa_enabled: form.mfa_enabled,
        avatar,
      });
      setHasSaved(true);
      toast.success("Profile updated successfully.");
      setAvatar(null);
      queryClient.setQueryData(["profile"], updated);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      await checkUserAuth();
    } catch (error) {
      toast.error(error.message || "Profile update failed.");
    } finally {
      setIsSaving(false);
    }
  };


  const saveNotificationPreferences = async () => {
    setIsSavingPreferences(true);
    try {
      const updated = await base44.entities.Notification.updatePreferences({
        ...notificationPreferences,
        channels: {
          in_app: notificationPreferences.in_app_enabled,
          popup: notificationPreferences.popup_enabled,
          email: notificationPreferences.email_enabled,
          sms: notificationPreferences.sms_enabled,
        },
      });
      setNotificationPreferences({
        in_app_enabled: updated.in_app_enabled ?? true,
        popup_enabled: updated.popup_enabled ?? true,
        email_enabled: updated.email_enabled ?? true,
        sms_enabled: updated.sms_enabled ?? false,
        system_enabled: updated.system_enabled ?? true,
        warning_enabled: updated.warning_enabled ?? true,
        critical_enabled: updated.critical_enabled ?? true,
        reminder_enabled: updated.reminder_enabled ?? true,
      });
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Notification preferences saved.");
    } catch (error) {
      toast.error(error.message || "Could not save notification preferences.");
    } finally {
      setIsSavingPreferences(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <Card>
          <CardContent className="p-4 sm:p-6 lg:p-8 text-muted-foreground">Loading profile...</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <UserCircle className="w-8 h-8 text-primary" />
          My Profile
        </h1>
        <p className="text-muted-foreground mt-1">
          Update your identity details, contact information, avatar, and email OTP preference.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center text-center gap-3">
              <Avatar className="w-28 h-28 border shadow-sm">
                <AvatarImage src={avatarPreview} alt={form.full_name || "Profile avatar"} />
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-lg">{profile?.full_name}</p>
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> {profile?.email}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge variant="outline">{profile?.role_name || profile?.role}</Badge>
                <Badge variant="outline">{profile?.section}</Badge>
                <Badge>{profile?.status}</Badge>
              </div>
            </div>

            <div className="text-sm space-y-2 border rounded-xl p-4">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Last login</span><span className="text-right">{profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString() : "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Last active</span><span className="text-right">{profile?.last_seen_at ? new Date(profile.last_seen_at).toLocaleString() : "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Created</span><span className="text-right">{profile?.created_date ? new Date(profile.created_date).toLocaleDateString() : "—"}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="profile_full_name" required>Full Name</RequiredLabel>
                  <Input
                    id="profile_full_name"
                    value={form.full_name}
                    onChange={(event) => updateField("full_name", event.target.value)}
                    onBlur={() => markTouched("full_name")}
                    aria-invalid={Boolean(showError("full_name"))}
                    aria-describedby="profile_full_name-error"
                    placeholder="Enter your full name"
                    required
                  />
                  <FieldError id="profile_full_name-error" message={showError("full_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_phone">Phone</Label>
                  <Input
                    id="profile_phone"
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                    onBlur={() => markTouched("phone")}
                    aria-invalid={Boolean(showError("phone"))}
                    aria-describedby="profile_phone-error"
                    placeholder="Optional contact number"
                    inputMode="tel"
                  />
                  <FieldError id="profile_phone-error" message={showError("phone")} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  value={form.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  placeholder="Optional office or mailing address"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Avatar Upload</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => { setAvatar(event.target.files?.[0] || null); markTouched("avatar"); }}
                    onBlur={() => markTouched("avatar")}
                    aria-invalid={Boolean(showError("avatar"))}
                    aria-describedby="profile_avatar-error"
                  />
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Accepted: JPG, PNG, WEBP. Maximum 2 MB. Minimum 64×64 pixels.</p>
                <FieldError id="profile_avatar-error" message={showError("avatar")} />
              </div>

              <div className="rounded-xl border p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Email OTP / MFA
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, DocTracker sends a 6-digit email code before completing login.
                  </p>
                </div>
                <Switch
                  checked={form.mfa_enabled}
                  onCheckedChange={(checked) => updateField("mfa_enabled", checked)}
                />
              </div>

              <div className="rounded-xl border p-4 space-y-4">
                <div className="space-y-1">
                  <Label className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    Notification Preferences
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Choose which real-time in-app popups, email alerts, and notification categories you want to receive.
                  </p>
                </div>
                {isLoadingPreferences ? (
                  <p className="text-sm text-muted-foreground">Loading notification preferences...</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ["in_app_enabled", "In-app inbox"],
                      ["popup_enabled", "Bottom-left popups"],
                      ["email_enabled", "Email alerts"],
                      ["sms_enabled", "SMS placeholder"],
                      ["system_enabled", "System notifications"],
                      ["warning_enabled", "Warning alerts"],
                      ["critical_enabled", "Critical alerts"],
                      ["reminder_enabled", "Reminder notifications"],
                    ].map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                        <span className="text-sm font-medium">{label}</span>
                        <Switch
                          checked={Boolean(notificationPreferences[key])}
                          onCheckedChange={(checked) => updateNotificationPreference(key, checked)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <Button type="button" variant="outline" onClick={saveNotificationPreferences} disabled={isSavingPreferences} className="gap-2">
                  <Save className="w-4 h-4" />
                  {isSavingPreferences ? "Saving preferences..." : "Save Notification Preferences"}
                </Button>
              </div>

              <Button type="submit" disabled={isSaving} className="gap-2">
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
