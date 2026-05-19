import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus,
  Users,
  Loader2,
  ShieldCheck,
  Download,
  LogOut,
  UserX,
  Upload,
  UserCheck,
  Search,
  ArrowUpDown,
  RefreshCw,
  Pencil,
  Activity,
  Shield,
  Save,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import FieldError from "@/components/form/FieldError";
import RequiredLabel from "@/components/form/RequiredLabel";
import { firstError, validateEmail, validateRequired, validateStrongPassword } from "@/lib/formValidation";

const FALLBACK_ROLES = [
  { value: "RECEIVING", label: "Receiving Office" },
  { value: "PROCUREMENT", label: "Procurement Section" },
  { value: "MOBILIZATION", label: "Mobilization Section" },
  { value: "MAYOR", label: "Mayor / OIC" },
  { value: "RELEASING", label: "Releasing Section" },
  { value: "COMMS", label: "Communications (COMMS)" },
  { value: "RECORDS", label: "Records Section" },
  { value: "ADMIN", label: "Admin" },
  { value: "DEVELOPER", label: "Developer" },
];

const defaultColumns = {
  full_name: true,
  email: true,
  role: true,
  status: true,
  section: true,
  last_seen: true,
  joined: true,
  actions: true,
};

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "", status: "active", mfaEnabled: false });
  const [editForm, setEditForm] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [touched, setTouched] = useState({});
  const [submitErrors, setSubmitErrors] = useState({});
  const [isInviting, setIsInviting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("25");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkRole, setBulkRole] = useState("");
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleDraft, setRoleDraft] = useState({ display_name: "", description: "", permission_ids: [] });
  const [customRole, setCustomRole] = useState({ name: "", display_name: "", description: "", permission_ids: [] });
  const [activityUserId, setActivityUserId] = useState("");
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      return { ...defaultColumns, ...(JSON.parse(localStorage.getItem("docutracker.user.columns") || "{}")) };
    } catch {
      return defaultColumns;
    }
  });

  useEffect(() => {
    base44.auth.me().then((user) => {
      setCurrentUser(user);
      setIsCheckingAccess(false);
    }).catch(() => setIsCheckingAccess(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("docutracker.user.columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const isAdmin = currentUser?.role?.toUpperCase() === "ADMIN";
  const query = useMemo(() => ({
    search,
    role: roleFilter === "all" ? "" : roleFilter,
    status: statusFilter === "all" ? "" : statusFilter,
    page,
    per_page: pageSize,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [search, roleFilter, statusFilter, page, pageSize, sortBy, sortDir]);

  const { data: pageData = { data: [], meta: {} }, isLoading, refetch } = useQuery({
    queryKey: ["users-list-page", query],
    queryFn: () => base44.users.listPage(query),
    enabled: !isCheckingAccess && isAdmin,
  });

  const { data: rolesData = { roles: [], permissions: [] } } = useQuery({
    queryKey: ["roles-permissions"],
    queryFn: () => base44.roles.list(),
    enabled: !isCheckingAccess && isAdmin,
  });

  const { data: analytics } = useQuery({
    queryKey: ["users-analytics"],
    queryFn: () => base44.users.analytics(),
    enabled: !isCheckingAccess && isAdmin,
  });

  const { data: activityData, isLoading: isActivityLoading, refetch: refetchActivity } = useQuery({
    queryKey: ["user-activity", activityUserId],
    queryFn: () => base44.users.activity(activityUserId),
    enabled: Boolean(activityUserId) && isAdmin,
  });

  const users = pageData.data || [];
  const meta = pageData.meta || {};
  const totalPages = Number(meta.last_page || 1);
  const selectedSet = new Set(selectedIds.map(String));
  const roleRecords = rolesData?.roles || [];
  const permissions = rolesData?.permissions || [];
  const roleOptions = roleRecords.length
    ? roleRecords.map((role) => ({ value: role.name, label: role.display_name || role.name }))
    : FALLBACK_ROLES;

  useEffect(() => {
    setSelectedIds([]);
  }, [search, roleFilter, statusFilter, page, pageSize, sortBy, sortDir]);

  useEffect(() => {
    const selectedRole = roleRecords.find((role) => String(role.id) === String(selectedRoleId));
    if (selectedRole) {
      setRoleDraft({
        display_name: selectedRole.display_name || "",
        description: selectedRole.description || "",
        permission_ids: selectedRole.permission_ids || [],
      });
    }
  }, [selectedRoleId, roleRecords]);

  const errors = useMemo(() => ({
    fullName: validateRequired(form.fullName, "Full name"),
    email: validateEmail(form.email, { required: true, label: "Email address" }),
    password: validateStrongPassword(form.password, { required: true }),
    role: validateRequired(form.role, "Role"),
  }), [form]);

  const editErrors = useMemo(() => {
    if (!editForm) return {};
    return {
      fullName: validateRequired(editForm.fullName, "Full name"),
      email: validateEmail(editForm.email, { required: true, label: "Email address" }),
      password: editForm.password ? validateStrongPassword(editForm.password, { required: false }) : "",
      role: validateRequired(editForm.role, "Role"),
    };
  }, [editForm]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitErrors((current) => ({ ...current, [key]: undefined }));
  };
  const markTouched = (key) => setTouched((current) => ({ ...current, [key]: true }));
  const showError = (key) => {
    if (submitErrors[key]) {
      return submitErrors[key];
    }

    return touched[key] ? errors[key] : "";
  };

  if (isCheckingAccess) {
    return <div className="p-4 sm:p-6 lg:p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <ShieldCheck className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-xl font-semibold">Access Restricted</p>
        <p className="text-base mt-2">Only Admin users can manage users.</p>
      </div>
    );
  }

  const handleInvite = async (e) => {
    e.preventDefault();
    setSubmitErrors({});
    setTouched({ fullName: true, email: true, password: true, role: true });
    const error = firstError(errors);
    if (error) {
      toast.error(error);
      return;
    }

    setIsInviting(true);
    try {
      await base44.users.inviteUser({
        full_name: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        section: mapRoleToSection(form.role),
        status: form.status,
        mfa_enabled: form.mfaEnabled,
      });
      queryClient.invalidateQueries({ queryKey: ["users-list-page"] });
      queryClient.invalidateQueries({ queryKey: ["users-analytics"] });
      toast.success(`User created: ${form.email}`);
      setForm({ fullName: "", email: "", password: "", role: "", status: "active", mfaEnabled: false });
      setTouched({});
    } catch (error) {
      const nextErrors = error.payload?.errors || {};
      if (Object.keys(nextErrors).length > 0) {
        setTouched({ fullName: true, email: true, password: true, role: true });
        setSubmitErrors({
          fullName: nextErrors.full_name?.[0],
          email: nextErrors.email?.[0],
          password: nextErrors.password?.[0],
          role: nextErrors.role?.[0],
        });
      }
      toast.error(error.message || "Failed to create user.");
    } finally {
      setIsInviting(false);
    }
  };

  const startEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      fullName: user.full_name || "",
      email: user.email || "",
      password: "",
      role: user.role?.toUpperCase() || "",
      section: user.section || mapRoleToSection(user.role),
      status: user.status || (user.is_active ? "active" : "inactive"),
      mfaEnabled: Boolean(user.mfa_enabled),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveEdit = async () => {
    if (!editingUser || !editForm) return;
    const error = firstError(editErrors);
    if (error) {
      toast.error(error);
      return;
    }
    setIsSavingEdit(true);
    try {
      const payload = {
        full_name: editForm.fullName,
        email: editForm.email,
        role: editForm.role,
        section: editForm.section || mapRoleToSection(editForm.role),
        status: editForm.status,
        mfa_enabled: editForm.mfaEnabled,
      };
      if (editForm.password) payload.password = editForm.password;
      await base44.users.update(editingUser.id, payload);
      toast.success("User account updated.");
      setEditingUser(null);
      setEditForm(null);
      queryClient.invalidateQueries({ queryKey: ["users-list-page"] });
      queryClient.invalidateQueries({ queryKey: ["users-analytics"] });
    } catch (error) {
      toast.error(error.message || "Failed to update user.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handlePreviewUserImport = async () => {
    if (!importFile) {
      toast.error("Choose a CSV file first.");
      return;
    }
    setIsImporting(true);
    try {
      const result = await base44.users.previewImport(importFile);
      setImportPreview(result);
      toast.success(`Preview complete: ${result.success_count} valid, ${result.failed_count} failed.`);
    } catch (error) {
      toast.error(error.message || "User import preview failed.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleCommitUserImport = async () => {
    setIsImporting(true);
    try {
      const result = await base44.users.commitImport(importPreview?.valid_rows || []);
      toast.success(`Imported ${result.created_count} users.`);
      setImportPreview(null);
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ["users-list-page"] });
      queryClient.invalidateQueries({ queryKey: ["users-analytics"] });
    } catch (error) {
      toast.error(error.message || "User import failed.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSort = (column) => {
    const serverColumn = column === "full_name" ? "name" : column === "joined" ? "created_at" : column === "last_seen" ? "last_seen_at" : column;
    if (sortBy === serverColumn) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortBy(serverColumn);
      setSortDir("asc");
    }
    setPage(1);
  };

  const toggleAllVisible = (checked) => {
    const ids = users.filter((user) => user.email !== currentUser?.email).map((user) => String(user.id));
    setSelectedIds((current) => checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)));
  };

  const toggleUser = (id, checked) => {
    setSelectedIds((current) => checked ? [...new Set([...current, String(id)])] : current.filter((value) => value !== String(id)));
  };

  const applyBulkAction = async () => {
    if (!selectedIds.length || (!bulkStatus && !bulkRole)) return;
    setIsBulkWorking(true);
    try {
      const result = await base44.users.bulkUpdate(selectedIds, { status: bulkStatus || undefined, role: bulkRole || undefined });
      toast.success(`Updated ${result.updated_count || 0} user account(s).`);
      setBulkStatus("");
      setBulkRole("");
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["users-list-page"] });
    } catch (error) {
      toast.error(error.message || "Bulk user action failed.");
    } finally {
      setIsBulkWorking(false);
    }
  };

  const saveRolePermissions = async () => {
    if (!selectedRoleId) {
      toast.error("Select a role first.");
      return;
    }
    try {
      await base44.roles.update(selectedRoleId, roleDraft);
      toast.success("Role permissions updated.");
      queryClient.invalidateQueries({ queryKey: ["roles-permissions"] });
    } catch (error) {
      toast.error(error.message || "Failed to update role permissions.");
    }
  };

  const createCustomRole = async () => {
    if (!customRole.name.trim()) {
      toast.error("Role name is required.");
      return;
    }
    try {
      const role = await base44.roles.create(customRole);
      toast.success(`Custom role created: ${role.display_name || role.name}`);
      setCustomRole({ name: "", display_name: "", description: "", permission_ids: [] });
      setSelectedRoleId(role.id);
      queryClient.invalidateQueries({ queryKey: ["roles-permissions"] });
    } catch (error) {
      toast.error(error.message || "Failed to create custom role.");
    }
  };

  const updatePermissionList = (source, setter, permissionId, checked) => {
    setter((current) => ({
      ...current,
      permission_ids: checked
        ? [...new Set([...(current.permission_ids || []), permissionId])]
        : (current.permission_ids || []).filter((id) => Number(id) !== Number(permissionId)),
    }));
  };

  const exportParams = { ...query, page: "", per_page: "" };
  const emailUsersPdf = async () => {
    try {
      const result = await base44.users.emailPdf(exportParams);
      toast.success(`User PDF emailed to ${result.recipient || "your email"}.`);
    } catch (error) {
      toast.error(error.message || "Failed to email user PDF.");
    }
  };

  const SortHead = ({ column, children }) => (
    <TableHead className="font-bold text-sm text-foreground">
      <button type="button" onClick={() => handleSort(column)} className="inline-flex items-center gap-1 hover:text-primary">
        {children}<ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </TableHead>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3"><Users className="w-8 h-8 text-primary" /> Advanced User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin-only user lifecycle, roles/permissions, impersonation, force logout, login history, bulk import/export, and activity analytics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Users" value={analytics?.total || 0} />
        <MetricCard label="Active Users" value={analytics?.active || 0} />
        <MetricCard label="Suspended" value={analytics?.suspended || 0} />
        <MetricCard label="Roles" value={roleRecords.length || FALLBACK_ROLES.length} />
      </div>

      {editForm && (
        <Card className="border-2 border-primary/30">
          <CardHeader><CardTitle className="text-xl flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" /> Edit User Account</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="space-y-2"><RequiredLabel required>Full Name</RequiredLabel><Input value={editForm.fullName} onChange={(e) => setEditForm((p) => ({ ...p, fullName: e.target.value }))} /><FieldError message={editErrors.fullName} /></div>
              <div className="space-y-2"><RequiredLabel required>Email</RequiredLabel><Input type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} /><FieldError message={editErrors.email} /></div>
              <div className="space-y-2"><Label>New Password (optional)</Label><PasswordInput value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))} placeholder="Leave blank to keep current" /><FieldError message={editErrors.password} /></div>
              <div className="space-y-2"><RequiredLabel required>Role</RequiredLabel><Select value={editForm.role} onValueChange={(value) => setEditForm((p) => ({ ...p, role: value, section: p.section || mapRoleToSection(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Section</Label><Input value={editForm.section} onChange={(e) => setEditForm((p) => ({ ...p, section: e.target.value.toUpperCase() }))} /></div>
              <div className="space-y-2"><Label>Status</Label><Select value={editForm.status} onValueChange={(value) => setEditForm((p) => ({ ...p, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select></div>
              <label className="flex items-center gap-2 h-10 px-3 rounded-md border text-sm self-end"><input type="checkbox" checked={editForm.mfaEnabled} onChange={(e) => setEditForm((p) => ({ ...p, mfaEnabled: e.target.checked }))} /> MFA enabled</label>
            </div>
            <div className="flex gap-2 flex-wrap"><Button onClick={saveEdit} disabled={isSavingEdit} className="gap-2">{isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save User</Button><Button variant="outline" onClick={() => { setEditingUser(null); setEditForm(null); }}>Cancel</Button></div>
          </CardContent>
        </Card>
      )}

      <Card className="border-2 border-primary/20">
        <CardHeader><CardTitle className="text-xl flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> Create User Account</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 items-start" noValidate>
            <div className="space-y-2 xl:col-span-2"><RequiredLabel htmlFor="fullName" required>Full Name</RequiredLabel><Input id="fullName" value={form.fullName} onChange={(e) => updateForm("fullName", e.target.value)} onBlur={() => markTouched("fullName")} aria-invalid={Boolean(showError("fullName"))} aria-describedby="fullName-error" placeholder="Juan Dela Cruz" className="h-12" /><FieldError id="fullName-error" message={showError("fullName")} /></div>
            <div className="space-y-2 xl:col-span-2"><RequiredLabel htmlFor="email" required>Email Address</RequiredLabel><Input id="email" type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} onBlur={() => markTouched("email")} aria-invalid={Boolean(showError("email"))} aria-describedby="email-error" placeholder="user@example.com" className="h-12" /><FieldError id="email-error" message={showError("email")} /></div>
            <div className="space-y-2 xl:col-span-2"><RequiredLabel htmlFor="password" required>Temporary Password</RequiredLabel><PasswordInput id="password" value={form.password} onChange={(e) => updateForm("password", e.target.value)} onBlur={() => markTouched("password")} aria-invalid={Boolean(showError("password"))} aria-describedby="password-error" placeholder="Min 8, mixed case, number, symbol" className="h-12" /><FieldError id="password-error" message={showError("password")} /></div>
            <div className="space-y-2 xl:col-span-2"><RequiredLabel required>Role</RequiredLabel><Select value={form.role} onValueChange={(value) => { updateForm("role", value); markTouched("role"); }}><SelectTrigger className="h-12"><SelectValue placeholder="Select role..." /></SelectTrigger><SelectContent>{roleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><FieldError id="role-error" message={showError("role")} /></div>
            <div className="space-y-2"><Label className="text-base font-semibold">Status</Label><Select value={form.status} onValueChange={(value) => updateForm("status", value)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select></div>
            <label className="flex items-center gap-2 h-12 px-3 rounded-md border text-sm self-end"><input type="checkbox" checked={form.mfaEnabled} onChange={(event) => updateForm("mfaEnabled", event.target.checked)} /> MFA</label>
            <Button type="submit" disabled={isInviting} className="h-12 px-8 text-base font-semibold bg-primary hover:bg-primary/90 self-end">{isInviting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <UserPlus className="w-5 h-5 mr-2" />} Create User</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Role and Permission Assignment</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 rounded-xl border p-4">
              <div><p className="font-semibold">Modify Existing Role</p><p className="text-sm text-muted-foreground">Controls module permissions for assigned users.</p></div>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}><SelectTrigger><SelectValue placeholder="Select role to configure" /></SelectTrigger><SelectContent>{roleRecords.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.display_name || role.name} ({role.users_count || 0})</SelectItem>)}</SelectContent></Select>
              {selectedRoleId && <>
                <Input value={roleDraft.display_name} onChange={(e) => setRoleDraft((p) => ({ ...p, display_name: e.target.value }))} placeholder="Display name" />
                <Input value={roleDraft.description} onChange={(e) => setRoleDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
                <PermissionChecklist permissions={permissions} selected={roleDraft.permission_ids || []} onChange={(id, checked) => updatePermissionList(roleDraft, setRoleDraft, id, checked)} />
                <Button onClick={saveRolePermissions} className="gap-2"><Save className="w-4 h-4" /> Save Role Permissions</Button>
              </>}
            </div>
            <div className="space-y-4 rounded-xl border p-4">
              <div><p className="font-semibold">Create Custom Role</p><p className="text-sm text-muted-foreground">Optional role for specialized access such as auditor, manager, or guest.</p></div>
              <Input value={customRole.name} onChange={(e) => setCustomRole((p) => ({ ...p, name: e.target.value }))} placeholder="Role code, e.g. AUDITOR" />
              <Input value={customRole.display_name} onChange={(e) => setCustomRole((p) => ({ ...p, display_name: e.target.value }))} placeholder="Display name" />
              <Input value={customRole.description} onChange={(e) => setCustomRole((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
              <PermissionChecklist permissions={permissions} selected={customRole.permission_ids || []} onChange={(id, checked) => updatePermissionList(customRole, setCustomRole, id, checked)} />
              <Button variant="outline" onClick={createCustomRole} className="gap-2"><Settings2 className="w-4 h-4" /> Create Custom Role</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-xl flex items-center gap-2"><Upload className="w-5 h-5 text-primary" /> Bulk User Import / Export</CardTitle>
            <div className="flex gap-2 flex-wrap"><Button variant="outline" onClick={() => base44.users.importTemplate()} className="gap-2"><Download className="w-4 h-4" /> Template</Button><Button variant="outline" onClick={() => base44.users.export("csv", exportParams)} className="gap-2"><Download className="w-4 h-4" /> CSV</Button><Button variant="outline" onClick={() => base44.users.export("pdf", exportParams)} className="gap-2"><Download className="w-4 h-4" /> PDF</Button><Button variant="outline" onClick={emailUsersPdf} className="gap-2"><Download className="w-4 h-4" /> Email PDF</Button></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end"><div className="space-y-2 flex-1 min-w-[240px]"><Label>CSV File</Label><Input type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] || null)} /></div><Button type="button" onClick={handlePreviewUserImport} disabled={isImporting} className="gap-2">{isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Validate Users</Button></div>
          {importPreview && <div className="rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap"><div><p className="font-semibold">Import Preview</p><p className="text-sm text-muted-foreground">{importPreview.success_count} valid rows, {importPreview.failed_count} failed rows out of {importPreview.total_rows}.</p></div><Button type="button" onClick={handleCommitUserImport} disabled={isImporting || importPreview.failed_count > 0}>Commit User Import</Button></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> User Login History, Device Info, and Activity Analytics</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end"><div className="space-y-2 min-w-[260px]"><Label>Select User</Label><Select value={activityUserId} onValueChange={setActivityUserId}><SelectTrigger><SelectValue placeholder="Choose user" /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={String(user.id)}>{user.full_name} — {user.email}</SelectItem>)}</SelectContent></Select></div><Button variant="outline" disabled={!activityUserId || isActivityLoading} onClick={() => refetchActivity()}>Refresh Activity</Button></div>
          {isActivityLoading && <p className="text-muted-foreground">Loading user activity...</p>}
          {activityData && <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-xl border p-4 space-y-2"><p className="font-semibold">Summary</p><p className="text-sm">Active sessions: <b>{activityData.summary?.active_sessions || 0}</b></p><p className="text-sm">Total audit events: <b>{activityData.summary?.total_audit_events || 0}</b></p><p className="text-xs text-muted-foreground">Last seen: {activityData.summary?.last_seen_at ? new Date(activityData.summary.last_seen_at).toLocaleString() : "—"}</p></div>
            <div className="rounded-xl border p-4 space-y-2"><p className="font-semibold">Active Device Sessions</p>{(activityData.device_sessions || []).slice(0, 5).map((session) => <div key={session.id} className="text-sm border-t pt-2"><b>{session.device}</b><p className="text-xs text-muted-foreground">{session.ip_address || "no IP"} • {session.last_activity}</p></div>)}{!activityData.device_sessions?.length && <p className="text-sm text-muted-foreground">No active session rows found.</p>}</div>
            <div className="rounded-xl border p-4 space-y-2"><p className="font-semibold">Most Used Features</p>{(activityData.feature_usage || []).slice(0, 8).map((row) => <div key={`${row.module}-${row.action}`} className="flex justify-between text-sm border-t pt-2"><span>{row.module} / {row.action}</span><Badge variant="outline">{row.total}</Badge></div>)}{!activityData.feature_usage?.length && <p className="text-sm text-muted-foreground">No feature activity found yet.</p>}</div>
            <div className="xl:col-span-3 rounded-xl border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Severity</TableHead><TableHead>IP / Device</TableHead><TableHead>Message</TableHead></TableRow></TableHeader><TableBody>{(activityData.login_history || []).map((log) => <TableRow key={log.id}><TableCell className="text-xs">{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</TableCell><TableCell>{log.action}</TableCell><TableCell><Badge variant={log.severity === "critical" ? "destructive" : "outline"}>{log.severity}</Badge></TableCell><TableCell className="text-xs">{log.ip_address || "—"}<br />{log.device}</TableCell><TableCell>{log.message || "—"}</TableCell></TableRow>)}</TableBody></Table></div>
          </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Registered Users</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap gap-3 items-center"><div className="relative flex-1 min-w-[240px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search users..." className="pl-9" /></div><Select value={roleFilter} onValueChange={(value) => { setRoleFilter(value); setPage(1); }}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Roles</SelectItem>{roleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select><Select value={pageSize} onValueChange={(value) => { setPageSize(value); setPage(1); }}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} rows</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => refetch()} className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button></div>
            <div className="flex flex-wrap gap-2 items-center justify-between"><div className="flex gap-2 flex-wrap items-center"><span className="text-sm text-muted-foreground">{selectedIds.length} selected</span><Select value={bulkStatus || "none"} onValueChange={(value) => setBulkStatus(value === "none" ? "" : value)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Bulk status...</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select><Select value={bulkRole || "none"} onValueChange={(value) => setBulkRole(value === "none" ? "" : value)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Bulk role...</SelectItem>{roleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={selectedIds.length === 0 || (!bulkStatus && !bulkRole) || isBulkWorking} onClick={applyBulkAction}>Apply Bulk Action</Button></div><div className="flex gap-2 flex-wrap"><Button variant="outline" onClick={() => base44.users.export("csv", exportParams)} className="gap-2"><Download className="w-4 h-4" /> Current CSV</Button><Button variant="outline" onClick={() => base44.users.export("pdf", exportParams)} className="gap-2"><Download className="w-4 h-4" /> Current PDF</Button></div></div>
            <div className="flex flex-wrap gap-2 items-center"><span className="font-semibold text-sm">Columns:</span>{Object.keys(defaultColumns).map((key) => <label key={key} className="flex items-center gap-1 text-sm rounded-md border px-2 py-1 capitalize"><input type="checkbox" checked={visibleColumns[key]} onChange={() => setVisibleColumns((current) => ({ ...current, [key]: !current[key] }))} />{key.replaceAll("_", " ")}</label>)}</div>
          </div>

          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : (
            <div className="rounded-xl border overflow-x-auto"><Table><TableHeader><TableRow className="bg-primary/5 hover:bg-primary/5"><TableHead className="w-10"><input type="checkbox" checked={users.length > 0 && users.filter((u) => u.email !== currentUser?.email).every((u) => selectedSet.has(String(u.id)))} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="Select all visible users" /></TableHead>{visibleColumns.full_name && <SortHead column="full_name">NAME</SortHead>}{visibleColumns.email && <SortHead column="email">EMAIL</SortHead>}{visibleColumns.role && <SortHead column="role">ROLE</SortHead>}{visibleColumns.status && <SortHead column="status">STATUS</SortHead>}{visibleColumns.section && <SortHead column="section">SECTION</SortHead>}{visibleColumns.last_seen && <SortHead column="last_seen">LAST SEEN</SortHead>}{visibleColumns.joined && <SortHead column="joined">JOINED</SortHead>}{visibleColumns.actions && <TableHead className="font-bold text-sm text-foreground">ACTIONS</TableHead>}</TableRow></TableHeader><TableBody>{users.map((user) => (
              <TableRow key={user.id} className="text-base"><TableCell><input type="checkbox" disabled={user.email === currentUser?.email} checked={selectedSet.has(String(user.id))} onChange={(event) => toggleUser(user.id, event.target.checked)} aria-label={`Select ${user.email}`} /></TableCell>{visibleColumns.full_name && <TableCell className="font-semibold">{user.full_name || "-"}</TableCell>}{visibleColumns.email && <TableCell className="text-muted-foreground">{user.email}</TableCell>}{visibleColumns.role && <TableCell>{user.email === currentUser?.email ? <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{user.role?.toUpperCase()}</span> : <Select value={user.role?.toUpperCase() || ""} onValueChange={(value) => base44.users.update(user.id, { role: value, section: mapRoleToSection(value) }).then(() => { queryClient.invalidateQueries({ queryKey: ["users-list-page"] }); toast.success("Role updated successfully."); }).catch((error) => toast.error(error.message || "Failed to update role."))}><SelectTrigger className="w-52 h-9 text-sm"><SelectValue placeholder="Set role..." /></SelectTrigger><SelectContent>{roleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>}</TableCell>}{visibleColumns.status && <TableCell><Select value={user.status || (user.is_active ? "active" : "inactive")} onValueChange={(value) => base44.users.update(user.id, { status: value }).then(() => { queryClient.invalidateQueries({ queryKey: ["users-list-page"] }); toast.success("User status updated."); }).catch((error) => toast.error(error.message || "Failed to update status."))}><SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select></TableCell>}{visibleColumns.section && <TableCell>{user.section || "—"}</TableCell>}{visibleColumns.last_seen && <TableCell className="text-muted-foreground text-sm">{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : "—"}</TableCell>}{visibleColumns.joined && <TableCell className="text-muted-foreground text-sm">{user.created_date ? new Date(user.created_date).toLocaleDateString() : "-"}</TableCell>}{visibleColumns.actions && <TableCell>{user.email !== currentUser?.email && <div className="flex gap-1"><Button variant="ghost" size="sm" title="Edit user" onClick={() => startEdit(user)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="sm" title="View activity" onClick={() => setActivityUserId(String(user.id))}><Activity className="w-4 h-4" /></Button><Button variant="ghost" size="sm" title="Impersonate user" onClick={() => base44.users.impersonate(user.id).then(() => { toast.success("Impersonation started."); window.location.href = "/"; })}><UserCheck className="w-4 h-4" /></Button><Button variant="ghost" size="sm" title="Force logout" onClick={() => base44.users.forceLogout(user.id).then(() => toast.success("User sessions cleared."))}><LogOut className="w-4 h-4" /></Button><Button variant="ghost" size="sm" title="Deactivate" onClick={() => base44.users.deactivate(user.id).then(() => { queryClient.invalidateQueries({ queryKey: ["users-list-page"] }); toast.warning("User account deactivated."); }).catch((error) => toast.error(error.message || "Failed to deactivate user."))}><UserX className="w-4 h-4" /></Button></div>}</TableCell>}</TableRow>
            ))}</TableBody></Table></div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap border rounded-xl p-3 bg-card"><p className="text-sm text-muted-foreground">Showing {meta.from || 0} to {meta.to || 0} of {meta.total || 0}. Page {meta.current_page || page} of {totalPages}.</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></CardContent></Card>;
}

function PermissionChecklist({ permissions = [], selected = [], onChange }) {
  const grouped = permissions.reduce((carry, permission) => {
    const key = permission.module_name || "system";
    carry[key] = carry[key] || [];
    carry[key].push(permission);
    return carry;
  }, {});
  const selectedSet = new Set((selected || []).map(Number));

  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border p-3 space-y-3 bg-muted/20">
      {Object.entries(grouped).map(([module, items]) => (
        <div key={module} className="space-y-2">
          <p className="text-sm font-bold capitalize">{module.replaceAll("_", " ")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((permission) => (
              <label key={permission.id} className="flex items-start gap-2 rounded-md bg-background border px-2 py-2 text-sm">
                <input type="checkbox" checked={selectedSet.has(Number(permission.id))} onChange={(event) => onChange(Number(permission.id), event.target.checked)} />
                <span><b>{permission.action_name}</b><br /><span className="text-xs text-muted-foreground">{permission.description}</span></span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {!permissions.length && <p className="text-sm text-muted-foreground">No permissions found. Run database seeding first.</p>}
    </div>
  );
}

function mapRoleToSection(role) {
  if (role === "COMMS" || role === "RECORDS") return "COMMS";
  if (role === "PROCUREMENT" || role === "RELEASING") return "PROCUREMENT";
  if (role === "MOBILIZATION") return "MOBILIZATION";
  if (role === "DEVELOPER") return "TECHNICAL";
  return "GENERAL";
}
