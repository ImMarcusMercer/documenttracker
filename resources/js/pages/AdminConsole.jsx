import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Archive, BarChart3, DatabaseBackup, Download, FileDown, Gauge, LockKeyhole, RefreshCw, Settings, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

const tabs = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "audit", label: "Audit Logs", icon: ShieldAlert },
  { id: "security", label: "Security Monitor", icon: ShieldCheck },
  { id: "reports", label: "Reports", icon: FileDown },
  { id: "backup", label: "Backups", icon: DatabaseBackup },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "import", label: "Import", icon: Upload },
];

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Admin Console</h1>
        <p className="text-muted-foreground mt-1">Audit logging, reports, backups, site settings, and import/export tools.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              type="button"
              variant={activeTab === tab.id ? "default" : "outline"}
              onClick={() => setActiveTab(tab.id)}
              className="gap-2"
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "audit" && <AuditTab />}
      {activeTab === "security" && <SecurityMonitorTab />}
      {activeTab === "reports" && <ReportsTab />}
      {activeTab === "backup" && <BackupTab />}
      {activeTab === "settings" && <SettingsTab />}
      {activeTab === "import" && <ImportTab />}
    </div>
  );
}

function OverviewTab() {
  const [range, setRange] = useState("month");
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["admin-dashboard-stats", range],
    queryFn: () => base44.dashboard.stats({ range }),
  });

  const statusRows = useMemo(() => {
    const counts = stats?.status_counts || {};
    return Object.entries(counts).map(([status, total]) => ({ status, total }));
  }, [stats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh without reload
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading dashboard metrics...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Total Users" value={stats?.user_statistics?.total_users || 0} />
            <MetricCard label="Active Users" value={stats?.user_statistics?.active_accounts || 0} />
            <MetricCard label="New Registrations" value={stats?.user_statistics?.new_registrations || 0} />
            <MetricCard label="Storage Usage" value={stats?.system_health?.storage_usage_human || "0 B"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily Activity</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.transaction_overview || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="created" name="Created" />
                  <Bar dataKey="actions" name="Actions" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document Status Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {statusRows.map((row) => (
                  <div key={row.status} className="rounded-lg border p-3 flex items-center justify-between">
                    <span className="font-medium">{row.status}</span>
                    <Badge variant="outline">{row.total}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function AuditTab() {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("25");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkWorking, setIsBulkWorking] = useState(false);

  const query = {
    search,
    severity: severity === "all" ? "" : severity,
    category: category === "all" ? "" : category,
    include_archived: includeArchived ? 1 : "",
    suspicious_only: suspiciousOnly ? 1 : "",
    page,
    per_page: perPage,
    sort_by: sortBy,
    sort_dir: sortDir,
  };

  const { data: pageData = { data: [], meta: {} }, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", query],
    queryFn: () => base44.audit.listPage(query),
  });

  const logs = pageData.data || [];
  const meta = pageData.meta || {};
  const selectedSet = new Set(selectedIds.map(String));
  const allVisibleSelected = logs.length > 0 && logs.every((log) => selectedSet.has(String(log.id)));

  const toggleLog = (id, checked) => {
    setSelectedIds((current) => checked ? [...new Set([...current, String(id)])] : current.filter((value) => value !== String(id)));
  };

  const toggleAllVisible = (checked) => {
    const ids = logs.map((log) => String(log.id));
    setSelectedIds((current) => checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)));
  };

  useEffect(() => {
    setSelectedIds([]);
  }, [search, severity, category, includeArchived, suspiciousOnly, page, perPage, sortBy, sortDir]);

  const archiveOldLogs = async () => {
    const result = await base44.audit.archive();
    toast.success(`Archived ${result.archived_count} old logs using ${result.days}-day setting.`);
    refetch();
  };

  const exportLogs = async (format) => {
    await base44.audit.export({ ...query, format, page: "", per_page: "" });
  };

  const emailAuditPdf = async () => {
    try {
      const result = await base44.audit.emailPdf({ ...query, page: "", per_page: "" });
      toast.success(`Audit PDF emailed to ${result.recipient || "your email"}.`);
    } catch (error) {
      toast.error(error.message || "Failed to email audit PDF.");
    }
  };

  const bulkArchiveLogs = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`Archive ${selectedIds.length} selected audit log(s)? They will be hidden from the default view but can be restored.`);
    if (!confirmed) return;
    setIsBulkWorking(true);
    try {
      const result = await base44.audit.bulkArchive(selectedIds);
      toast.warning(result.summary || `Archived ${result.archived_count || 0} logs.`);
      setSelectedIds([]);
      refetch();
    } catch (error) {
      toast.error(error.message || "Bulk audit archive failed.");
    } finally {
      setIsBulkWorking(false);
    }
  };

  const bulkRestoreLogs = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkWorking(true);
    try {
      const result = await base44.audit.bulkRestore(selectedIds);
      toast.success(result.summary || `Restored ${result.restored_count || 0} logs.`);
      setSelectedIds([]);
      refetch();
    } catch (error) {
      toast.error(error.message || "Bulk audit restore failed.");
    } finally {
      setIsBulkWorking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Audit Logging and Transaction Tracking</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Categorized authentication, transaction, error, access, and suspicious activity logs.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => exportLogs("csv")} className="gap-2"><Download className="w-4 h-4" /> CSV</Button>
            <Button variant="outline" onClick={() => exportLogs("xlsx")} className="gap-2"><Download className="w-4 h-4" /> Excel</Button>
            <Button variant="outline" onClick={() => exportLogs("pdf")} className="gap-2"><FileDown className="w-4 h-4" /> PDF</Button>
            <Button variant="outline" onClick={emailAuditPdf} className="gap-2"><FileDown className="w-4 h-4" /> Email PDF</Button>
            <Button variant="outline" onClick={archiveOldLogs} className="gap-2"><Archive className="w-4 h-4" /> Auto-Archive</Button>
            <Button variant="outline" disabled={selectedIds.length === 0 || isBulkWorking} onClick={bulkArchiveLogs} className="gap-2"><Archive className="w-4 h-4" /> Archive Selected</Button>
            <Button variant="outline" disabled={selectedIds.length === 0 || isBulkWorking} onClick={bulkRestoreLogs} className="gap-2">Restore Selected</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search user, module, action, IP, or message" className="lg:col-span-2" />
          <Select value={severity} onValueChange={(value) => { setSeverity(value); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="authentication">Authentication</SelectItem>
              <SelectItem value="transaction">Transaction</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="access">Access</SelectItem>
              <SelectItem value="sql_injection">SQL Injection</SelectItem>
              <SelectItem value="xss">XSS</SelectItem>
              <SelectItem value="dos_ddos">DoS/DDoS</SelectItem>
              <SelectItem value="network">Network</SelectItem>
              <SelectItem value="social_engineering">Social Engineering</SelectItem>
              <SelectItem value="privilege">Privilege</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between rounded-xl border p-3">
          <div className="flex flex-wrap gap-3 items-center">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={suspiciousOnly} onChange={(e) => { setSuspiciousOnly(e.target.checked); setPage(1); }} /> Suspicious only</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={(e) => { setIncludeArchived(e.target.checked); setPage(1); }} /> Include archived</label>
            <Select value={perPage} onValueChange={(value) => { setPerPage(value); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 rows</SelectItem>
                <SelectItem value="25">25 rows</SelectItem>
                <SelectItem value="50">50 rows</SelectItem>
                <SelectItem value="100">100 rows</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => { setSortBy(value); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Sort by Time</SelectItem>
                <SelectItem value="risk_score">Sort by Risk</SelectItem>
                <SelectItem value="severity">Sort by Severity</SelectItem>
                <SelectItem value="category">Sort by Category</SelectItem>
                <SelectItem value="user_email">Sort by User</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortDir} onValueChange={(value) => { setSortDir(value); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            <Button variant="outline" onClick={() => refetch()} className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <AuditMetric label="Visible Logs" value={logs.length} />
          <AuditMetric label="Total Matched" value={meta.total || 0} />
          <AuditMetric label="Suspicious Visible" value={logs.filter((log) => log.suspicious).length} />
          <AuditMetric label="Critical Visible" value={logs.filter((log) => log.severity === "critical").length} />
        </div>

        {isLoading ? <p className="text-muted-foreground">Loading logs...</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="Select all visible audit logs" /></TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Indicator</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className={rowTone(log)}>
                  <TableCell><input type="checkbox" checked={selectedSet.has(String(log.id))} onChange={(event) => toggleLog(log.id, event.target.checked)} aria-label={`Select audit log ${log.id}`} /></TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{log.created_date ? new Date(log.created_date).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant={badgeVariant(log)}>{categoryLabel(log.category)}</Badge>
                      <p className="text-xs text-muted-foreground">{log.indicator || (log.suspicious ? "Suspicious activity" : "Normal activity")}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-bold">{log.risk_score || 10}</TableCell>
                  <TableCell><Badge variant={log.severity === "critical" ? "destructive" : "outline"}>{log.severity}</Badge></TableCell>
                  <TableCell>{log.module_name}</TableCell>
                  <TableCell>{log.action_name}</TableCell>
                  <TableCell className="text-sm">{log.user_email || "system"}</TableCell>
                  <TableCell className="text-sm max-w-[280px]">{log.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <PaginationControls meta={meta} page={page} setPage={setPage} />
      </CardContent>
    </Card>
  );
}

function AuditMetric({ label, value }) {
  return (
    <div className="rounded-xl border p-4 bg-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function PaginationControls({ meta, page, setPage }) {
  const lastPage = Number(meta?.last_page || 1);
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap border rounded-xl p-3">
      <p className="text-sm text-muted-foreground">Showing {meta?.from || 0} to {meta?.to || 0} of {meta?.total || 0}. Page {page} of {lastPage}.</p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

function categoryLabel(category) {
  const labels = {
    authentication: "Authentication",
    transaction: "Transaction",
    error: "Error",
    access: "Access",
    sql_injection: "SQL Injection",
    xss: "XSS",
    dos_ddos: "DoS/DDoS",
    network: "Network",
    social_engineering: "Social Engineering",
    privilege: "Privilege",
    system: "System",
  };
  return labels[category] || category || "System";
}

function badgeVariant(log) {
  if (log.severity === "critical" || Number(log.risk_score) >= 85) return "destructive";
  return "outline";
}

function rowTone(log) {
  if (log.severity === "critical" || Number(log.risk_score) >= 85) return "bg-red-50 hover:bg-red-100";
  if (log.suspicious || log.severity === "warning" || Number(log.risk_score) >= 60) return "bg-amber-50 hover:bg-amber-100";
  return "";
}


function ReportsTab() {
  const queryClient = useQueryClient();
  const [type, setType] = useState("transaction_summary");
  const [favoriteName, setFavoriteName] = useState("");
  const { data: report, refetch, isLoading } = useQuery({
    queryKey: ["admin-report", type],
    queryFn: () => base44.reports.get({ type }),
  });
  const { data: favorites = [] } = useQuery({ queryKey: ["report-favorites"], queryFn: () => base44.reports.favorites() });

  const printReport = () => window.print();

  const emailReportPdf = async () => {
    try {
      const result = await base44.reports.emailPdf({ type });
      toast.success(`PDF report emailed to ${result.recipient || "your email"}.`);
    } catch (error) {
      toast.error(error.message || "Failed to email PDF report.");
    }
  };

  const saveFavorite = async () => {
    if (!favoriteName.trim()) {
      toast.error("Enter a favorite report name.");
      return;
    }
    await base44.reports.saveFavorite({ name: favoriteName.trim(), report_type: type, filters: { type } });
    setFavoriteName("");
    queryClient.invalidateQueries({ queryKey: ["report-favorites"] });
    toast.success("Report configuration saved.");
  };

  const applyFavorite = (favorite) => {
    setType(favorite.report_type || "transaction_summary");
    toast.success(`Loaded favorite: ${favorite.name}`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle>Reporting System</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transaction_summary">Transaction Summary</SelectItem>
                <SelectItem value="user_activity">User Activity</SelectItem>
                <SelectItem value="audit_trail">Audit Trail</SelectItem>
                <SelectItem value="system_usage">System Usage</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()}>Generate</Button>
            <Button variant="outline" onClick={() => base44.reports.export({ type, format: "csv" })}>CSV</Button>
            <Button variant="outline" onClick={() => base44.reports.export({ type, format: "excel" })}>Excel</Button>
            <Button variant="outline" onClick={() => base44.reports.export({ type, format: "pdf" })}>Download PDF</Button>
            <Button variant="outline" onClick={emailReportPdf}>Email PDF</Button>
            <Button onClick={printReport}>Print / Save PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 print:bg-white">
        <div className="border rounded-xl p-4 space-y-3 print:hidden">
          <p className="font-semibold">Favorite Report Configurations</p>
          <div className="flex gap-2 flex-wrap">
            <Input value={favoriteName} onChange={(event) => setFavoriteName(event.target.value)} placeholder="Favorite name" className="max-w-xs" />
            <Button variant="outline" onClick={saveFavorite}>Save Current Report</Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {favorites.length === 0 ? <p className="text-sm text-muted-foreground">No saved report configurations yet.</p> : favorites.map((favorite) => (
              <Button key={favorite.id} variant="secondary" size="sm" onClick={() => applyFavorite(favorite)}>{favorite.name}</Button>
            ))}
          </div>
        </div>

        {isLoading ? <p className="text-muted-foreground">Generating report...</p> : (
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-2xl font-bold">{report?.title}</h2>
              <p className="text-sm text-muted-foreground">Generated {new Date().toLocaleString()} • Page 1 of 1 • Digital signature placeholder: ____________________</p>
            </div>
            {(report?.sections || []).map((section) => (
              <div key={section.heading}>
                <h3 className="font-semibold mb-2">{section.heading}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(section.rows?.[0] || { message: "No data" }).map((key) => <TableHead key={key}>{key}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(section.rows || []).map((row, index) => (
                      <TableRow key={index}>
                        {Object.values(row).map((value, idx) => <TableCell key={idx}>{String(value ?? "")}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackupTab() {
  const queryClient = useQueryClient();
  const { data: pageData = { data: [], meta: {} }, isLoading } = useQuery({ queryKey: ["backups"], queryFn: () => base44.backups.listPage() });
  const backups = pageData.data || [];
  const meta = pageData.meta || {};
  const [isRunning, setIsRunning] = useState(false);
  const [backupType, setBackupType] = useState("manual");
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyFile, setVerifyFile] = useState(null);
  const [expectedChecksum, setExpectedChecksum] = useState("");
  const [uploadedVerification, setUploadedVerification] = useState(null);
  const [isVerifyingUpload, setIsVerifyingUpload] = useState(false);

  const runBackup = async () => {
    setIsRunning(true);
    try {
      const result = await base44.backups.run(backupType);
      toast.success(result.message || "Backup completed.");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    } catch (error) {
      toast.error(error.message || "Backup failed.");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    } finally {
      setIsRunning(false);
    }
  };

  const verifyBackup = async (backup) => {
    setVerifyingId(backup.id);
    try {
      const result = await base44.backups.verify(backup.id);
      toast.success(result.verification?.message || "Backup integrity verified.");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    } catch (error) {
      const verification = error.payload?.data?.verification;
      toast.error(verification?.message || error.message || "Backup verification failed.");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    } finally {
      setVerifyingId(null);
    }
  };

  const verifyImportedBackup = async () => {
    if (!verifyFile) {
      toast.error("Choose a ZIP backup file to verify.");
      return;
    }
    setIsVerifyingUpload(true);
    setUploadedVerification(null);
    try {
      const result = await base44.backups.verifyUpload(verifyFile, expectedChecksum.trim());
      setUploadedVerification(result);
      toast.success(result.message || "Imported backup file verified.");
    } catch (error) {
      const result = error.payload?.data;
      if (result) setUploadedVerification(result);
      toast.error(result?.message || error.message || "Imported backup verification failed.");
    } finally {
      setIsVerifyingUpload(false);
    }
  };

  const schedule = meta.schedule || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Automated Backup System</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Creates recoverable PostgreSQL SQL dumps, upload archives, and full-system ZIP packages with integrity checks and email notifications.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={backupType} onValueChange={setBackupType}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Full</SelectItem>
                  <SelectItem value="database">Database SQL Dump</SelectItem>
                  <SelectItem value="uploads">File Uploads</SelectItem>
                  <SelectItem value="full_system">Full System ZIP</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={runBackup} disabled={isRunning} className="gap-2">
                <DatabaseBackup className="w-4 h-4" /> {isRunning ? "Running..." : "Run Backup"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetricCard label="Database Schedule" value={schedule.database || "weekly monday 02:00"} />
            <MetricCard label="Uploads Schedule" value={schedule.uploads || "weekly sunday 02:30"} />
            <MetricCard label="Full System Schedule" value={schedule.full_system || "monthly first day 03:00"} />
            <MetricCard label="Retention Policy" value={meta.retention_policy || "30 days"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border p-4">
              <p className="font-semibold">Database Recovery</p>
              <p className="text-muted-foreground mt-1">Backups include <code>database/database-dump.sql</code>. Preferred method is PostgreSQL <code>pg_dump</code>; fallback exports actual table data as SQL.</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="font-semibold">Email Notification</p>
              <p className="text-muted-foreground mt-1">{meta.email_notifications ? "Enabled through configured mail settings." : "Configure BACKUP_NOTIFICATION_EMAIL and MAIL_* values in .env."}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="font-semibold">Cloud / Supabase</p>
              <p className="text-muted-foreground mt-1">{meta.cloud_disk ? `Using Laravel disk: ${meta.cloud_disk}` : "Not configured. Set BACKUP_CLOUD_DISK=supabase or enable Supabase placeholders in .env."}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Verify Imported Backup File</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-2 md:col-span-1">
              <Label>Backup ZIP file</Label>
              <Input type="file" accept=".zip,application/zip" onChange={(event) => setVerifyFile(event.target.files?.[0] || null)} />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label>Expected SHA-256 checksum (optional)</Label>
              <Input value={expectedChecksum} onChange={(event) => setExpectedChecksum(event.target.value)} placeholder="Paste checksum for stricter validation" />
            </div>
            <Button onClick={verifyImportedBackup} disabled={isVerifyingUpload} variant="outline" className="gap-2">
              <ShieldAlert className="w-4 h-4" /> {isVerifyingUpload ? "Checking..." : "Verify Imported Backup"}
            </Button>
          </div>
          {uploadedVerification && (
            <div className={`rounded-xl border p-4 text-sm ${uploadedVerification.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <p className="font-semibold">{uploadedVerification.verified ? "Verification passed" : "Verification failed"}</p>
              <p className="mt-1">{uploadedVerification.message}</p>
              <p className="font-mono text-xs break-all mt-2">SHA-256: {uploadedVerification.actual_checksum || "n/a"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Backup Runs</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Loading backups...</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>File</TableHead><TableHead>Database Dump</TableHead><TableHead>Integrity</TableHead><TableHead>Destinations</TableHead><TableHead>Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="text-xs">{backup.created_date ? new Date(backup.created_date).toLocaleString() : "—"}</TableCell>
                      <TableCell>{backup.backup_type}</TableCell>
                      <TableCell><Badge variant={backup.status === "success" ? "outline" : "destructive"}>{backup.status}</Badge></TableCell>
                      <TableCell className="max-w-xs">
                        <div className="font-medium break-all">{backup.file_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{backup.file_size_human || "0 B"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {backup.database_dump?.enabled ? (
                          <div>
                            <Badge variant="outline">{backup.database_dump.method}</Badge>
                            <p className="text-muted-foreground mt-1">{backup.database_dump.status}</p>
                          </div>
                        ) : "Not required"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div>{backup.integrity_verified ? `verified ${backup.checksum?.slice(0, 12) || ""}...` : "not verified"}</div>
                        <div className="text-muted-foreground mt-1">{backup.verification?.checked_at ? new Date(backup.verification.checked_at).toLocaleString() : "not checked"}</div>
                      </TableCell>
                      <TableCell className="text-xs min-w-40">
                        {Object.entries(backup.destination_status || {}).filter(([name]) => !["verification", "database_dump"].includes(name)).map(([name, meta]) => (
                          <div key={name} className="mb-1"><span className="font-medium">{name.replaceAll("_", " ")}:</span> {meta.status}</div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" disabled={verifyingId === backup.id} onClick={() => verifyBackup(backup)}>{verifyingId === backup.id ? "Checking..." : "Verify"}</Button>
                          {backup.status === "success" && <Button variant="outline" size="sm" onClick={() => base44.backups.download(backup.id, backup.file_name)}>Download</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getSettingValue(settings, group, key, fallback = "") {
  const raw = settings?.[group]?.[key]?.value;
  if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "value")) {
    return raw.value;
  }
  return raw ?? fallback;
}

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => base44.settings.list() });
  const [groupName, setGroupName] = useState("backup");
  const [keyName, setKeyName] = useState("retention_days");
  const [value, setValue] = useState("30");
  const [description, setDescription] = useState("Configurable setting updated from Admin Console.");
  const [securityForm, setSecurityForm] = useState({
    session_timeout_minutes: "120",
    session_timeout_warning_minutes: "5",
    failed_login_warning_threshold: "3",
    failed_login_lockout_threshold: "5",
    failed_login_lockout_minutes: "30",
    mfa_code_ttl_minutes: "10",
    mfa_enforcement: "false",
    single_session_per_user: "false",
    remember_me_days: "30",
  });
  const [auditForm, setAuditForm] = useState({
    archive_after_days: "90",
    default_page_size: "25",
    max_simulation_events_per_run: "100",
  });
  const [systemForm, setSystemForm] = useState({
    storage_capacity_limit_mb: "1024",
    storage_warning_threshold_percent: "85",
  });
  const [backupForm, setBackupForm] = useState({
    retention_days: "30",
    database_schedule: "weekly monday 02:00",
    uploads_schedule: "weekly sunday 02:30",
    full_system_schedule: "monthly first day 03:00",
  });
  const [brandingForm, setBrandingForm] = useState({
    site_name: "DocTracker",
    logo_url: "",
    favicon_url: "",
    theme_color: "#15803d",
    secondary_color: "#f8fafc",
  });
  const [emailForm, setEmailForm] = useState({
    smtp_mailer: "log",
    smtp_host: "127.0.0.1",
    smtp_port: "2525",
    smtp_username: "",
    from_address: "docutracker@example.com",
    from_name: "DocTracker",
    subject_prefix: "[DocTracker]",
    footer: "This is an automated DocTracker notification.",
  });
  const [notificationForm, setNotificationForm] = useState({
    in_app: "true",
    popup: "true",
    email: "true",
    sms: "false",
    realtime_enabled: "true",
    popup_duration_seconds: "5",
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    enabled: "false",
    message: "DocTracker is temporarily under maintenance. Please try again later.",
  });
  const [apiForm, setApiForm] = useState({
    rate_limit_per_minute: "100",
    api_keys_enabled: "false",
    public_docs_enabled: "false",
  });

  useEffect(() => {
    if (!settings?.security) return;
    setSecurityForm({
      session_timeout_minutes: String(getSettingValue(settings, "security", "session_timeout_minutes", 120)),
      session_timeout_warning_minutes: String(getSettingValue(settings, "security", "session_timeout_warning_minutes", 5)),
      failed_login_warning_threshold: String(getSettingValue(settings, "security", "failed_login_warning_threshold", 3)),
      failed_login_lockout_threshold: String(getSettingValue(settings, "security", "failed_login_lockout_threshold", 5)),
      failed_login_lockout_minutes: String(getSettingValue(settings, "security", "failed_login_lockout_minutes", 30)),
      mfa_code_ttl_minutes: String(getSettingValue(settings, "security", "mfa_code_ttl_minutes", 10)),
      mfa_enforcement: String(getSettingValue(settings, "security", "mfa_enforcement", false)),
      single_session_per_user: String(getSettingValue(settings, "security", "single_session_per_user", false)),
      remember_me_days: String(getSettingValue(settings, "security", "remember_me_days", 30)),
    });
    setAuditForm({
      archive_after_days: String(getSettingValue(settings, "audit", "archive_after_days", 90)),
      default_page_size: String(getSettingValue(settings, "audit", "default_page_size", 25)),
      max_simulation_events_per_run: String(getSettingValue(settings, "developer", "max_simulation_events_per_run", 100)),
    });
    setSystemForm({
      storage_capacity_limit_mb: String(getSettingValue(settings, "system", "storage_capacity_limit_mb", 1024)),
      storage_warning_threshold_percent: String(getSettingValue(settings, "system", "storage_warning_threshold_percent", 85)),
    });
    const schedule = getSettingValue(settings, "backup", "schedule", {}) || {};
    setBackupForm({
      retention_days: String(getSettingValue(settings, "backup", "retention_days", 30)),
      database_schedule: String(schedule.database || "weekly monday 02:00"),
      uploads_schedule: String(schedule.uploads || "weekly sunday 02:30"),
      full_system_schedule: String(schedule.full_system || "monthly first day 03:00"),
    });
    const defaultChannels = getSettingValue(settings, "notifications", "default_channels", {}) || {};
    const emailTemplate = getSettingValue(settings, "email", "notification_template", {}) || {};
    setBrandingForm({
      site_name: String(getSettingValue(settings, "branding", "site_name", "DocTracker")),
      logo_url: String(getSettingValue(settings, "branding", "logo_url", "")),
      favicon_url: String(getSettingValue(settings, "branding", "favicon_url", "")),
      theme_color: String(getSettingValue(settings, "branding", "theme_color", "#15803d")),
      secondary_color: String(getSettingValue(settings, "branding", "secondary_color", "#f8fafc")),
    });
    setEmailForm({
      smtp_mailer: String(getSettingValue(settings, "email", "smtp_mailer", "log")),
      smtp_host: String(getSettingValue(settings, "email", "smtp_host", "127.0.0.1")),
      smtp_port: String(getSettingValue(settings, "email", "smtp_port", 2525)),
      smtp_username: String(getSettingValue(settings, "email", "smtp_username", "")),
      from_address: String(getSettingValue(settings, "email", "from_address", "docutracker@example.com")),
      from_name: String(getSettingValue(settings, "email", "from_name", "DocTracker")),
      subject_prefix: String(emailTemplate.subject_prefix || "[DocTracker]"),
      footer: String(emailTemplate.footer || "This is an automated DocTracker notification."),
    });
    setNotificationForm({
      in_app: String(defaultChannels.in_app ?? true),
      popup: String(defaultChannels.popup ?? true),
      email: String(defaultChannels.email ?? true),
      sms: String(defaultChannels.sms ?? false),
      realtime_enabled: String(getSettingValue(settings, "notifications", "realtime_enabled", true)),
      popup_duration_seconds: String(getSettingValue(settings, "notifications", "popup_duration_seconds", 5)),
    });
    setMaintenanceForm({
      enabled: String(getSettingValue(settings, "maintenance", "enabled", false)),
      message: String(getSettingValue(settings, "maintenance", "message", "DocTracker is temporarily under maintenance. Please try again later.")),
    });
    setApiForm({
      rate_limit_per_minute: String(getSettingValue(settings, "api", "rate_limit_per_minute", 100)),
      api_keys_enabled: String(getSettingValue(settings, "api", "api_keys_enabled", false)),
      public_docs_enabled: String(getSettingValue(settings, "api", "public_docs_enabled", false)),
    });
  }, [settings]);

  const updateSetting = async ({ group_name, key_name, value: settingValue, type = "string", description: settingDescription }) => {
    await base44.settings.update({
      group_name,
      key_name,
      value: settingValue,
      type,
      description: settingDescription,
    });
  };

  const saveSetting = async () => {
    if (!groupName.trim() || !keyName.trim()) {
      toast.error("Group and key are required.");
      return;
    }
    let parsedValue = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }
    await updateSetting({
      group_name: groupName.trim(),
      key_name: keyName.trim(),
      value: parsedValue,
      type: typeof parsedValue === "object" ? "json" : "string",
      description,
    });
    toast.success("Setting updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveSecuritySettings = async () => {
    const numericFields = [
      "session_timeout_minutes",
      "session_timeout_warning_minutes",
      "failed_login_warning_threshold",
      "failed_login_lockout_threshold",
      "failed_login_lockout_minutes",
      "mfa_code_ttl_minutes",
      "remember_me_days",
    ];

    for (const field of numericFields) {
      const number = Number(securityForm[field]);
      if (!Number.isFinite(number) || number < 1) {
        toast.error(`${field.replaceAll("_", " ")} must be a positive number.`);
        return;
      }
    }

    if (Number(securityForm.failed_login_lockout_threshold) <= Number(securityForm.failed_login_warning_threshold)) {
      toast.error("Lockout threshold must be greater than warning threshold.");
      return;
    }

    const descriptions = {
      session_timeout_minutes: "Inactivity timeout before automatic logout.",
      session_timeout_warning_minutes: "Client-side warning countdown before session expiration.",
      failed_login_warning_threshold: "Failed login attempts before warning popup/audit severity.",
      failed_login_lockout_threshold: "Failed login attempts before temporary account lock.",
      failed_login_lockout_minutes: "Temporary account lock duration in minutes.",
      mfa_code_ttl_minutes: "Email OTP expiration time in minutes.",
      mfa_enforcement: "Require email OTP/MFA for all users.",
      single_session_per_user: "Force one active session per user when enabled.",
      remember_me_days: "Remember-me policy display for persistent sessions.",
    };

    for (const field of numericFields) {
      await updateSetting({
        group_name: "security",
        key_name: field,
        value: Number(securityForm[field]),
        type: "integer",
        description: descriptions[field],
      });
    }

    for (const field of ["mfa_enforcement", "single_session_per_user"]) {
      await updateSetting({
        group_name: "security",
        key_name: field,
        value: securityForm[field] === "true",
        type: "boolean",
        description: descriptions[field],
      });
    }

    toast.success("Security and session settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const updateSecurityField = (key, nextValue) => {
    setSecurityForm((prev) => ({ ...prev, [key]: nextValue }));
  };

  const saveAuditSettings = async () => {
    const archiveDays = Number(auditForm.archive_after_days);
    const pageSize = Number(auditForm.default_page_size);
    const maxEvents = Number(auditForm.max_simulation_events_per_run);
    if (![archiveDays, pageSize, maxEvents].every((value) => Number.isFinite(value) && value > 0)) {
      toast.error("Audit and developer settings must be positive numbers.");
      return;
    }
    await updateSetting({ group_name: "audit", key_name: "archive_after_days", value: archiveDays, type: "integer", description: "Auto-archive audit logs older than this number of days." });
    await updateSetting({ group_name: "audit", key_name: "default_page_size", value: pageSize, type: "integer", description: "Default audit log pagination size." });
    await updateSetting({ group_name: "developer", key_name: "max_simulation_events_per_run", value: maxEvents, type: "integer", description: "Maximum safe log-only simulation records per run." });
    toast.success("Audit retention, pagination, and simulation settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveSystemWarningSettings = async () => {
    const capacity = Number(systemForm.storage_capacity_limit_mb);
    const threshold = Number(systemForm.storage_warning_threshold_percent);
    if (!Number.isFinite(capacity) || capacity < 1 || !Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
      toast.error("Storage capacity must be positive and threshold must be between 1 and 100.");
      return;
    }
    await updateSetting({ group_name: "system", key_name: "storage_capacity_limit_mb", value: capacity, type: "integer", description: "Configured storage capacity in MB for dashboard warning calculations." });
    await updateSetting({ group_name: "system", key_name: "storage_warning_threshold_percent", value: threshold, type: "integer", description: "Email admins when storage usage reaches this configured percentage." });
    toast.success("Storage warning settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveBackupSettings = async () => {
    const retention = Number(backupForm.retention_days);
    if (!Number.isFinite(retention) || retention < 1) {
      toast.error("Backup retention days must be a positive number.");
      return;
    }

    await updateSetting({
      group_name: "backup",
      key_name: "retention_days",
      value: retention,
      type: "integer",
      description: "Backup retention policy in days. This is displayed on the backup page and used by cleanup.",
    });

    await updateSetting({
      group_name: "backup",
      key_name: "schedule",
      value: {
        database: backupForm.database_schedule,
        uploads: backupForm.uploads_schedule,
        full_system: backupForm.full_system_schedule,
      },
      type: "json",
      description: "Backup schedule display used for the automated backup requirement. Laravel scheduler commands must match these values on production.",
    });

    toast.success("Backup schedule and retention settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  };

  const saveBrandingSettings = async () => {
    if (!brandingForm.site_name.trim()) {
      toast.error("Site name is required.");
      return;
    }
    for (const [key, value] of Object.entries(brandingForm)) {
      await updateSetting({ group_name: "branding", key_name: key, value, type: "string", description: `Branding setting: ${key.replaceAll("_", " ")}.` });
    }
    toast.success("Branding settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveEmailSettings = async () => {
    if (!emailForm.from_address.includes("@")) {
      toast.error("From address must be a valid email-like value.");
      return;
    }
    const simpleFields = ["smtp_mailer", "smtp_host", "smtp_username", "from_address", "from_name"];
    for (const key of simpleFields) {
      await updateSetting({ group_name: "email", key_name: key, value: emailForm[key], type: "string", description: `Email setting display value for ${key.replaceAll("_", " ")}. Runtime secrets remain in .env.` });
    }
    await updateSetting({ group_name: "email", key_name: "smtp_port", value: Number(emailForm.smtp_port || 2525), type: "integer", description: "SMTP port display value. Runtime value remains in .env." });
    await updateSetting({ group_name: "email", key_name: "notification_template", value: { subject_prefix: emailForm.subject_prefix, footer: emailForm.footer }, type: "json", description: "Default email notification template content." });
    toast.success("Email settings metadata updated. Keep actual SMTP secrets in .env.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveNotificationSettings = async () => {
    const seconds = Number(notificationForm.popup_duration_seconds);
    if (!Number.isFinite(seconds) || seconds < 1) {
      toast.error("Popup duration must be a positive number.");
      return;
    }
    await updateSetting({ group_name: "notifications", key_name: "default_channels", value: { in_app: notificationForm.in_app === "true", popup: notificationForm.popup === "true", email: notificationForm.email === "true", sms: notificationForm.sms === "true" }, type: "json", description: "Default notification preference channels for new users." });
    await updateSetting({ group_name: "notifications", key_name: "realtime_enabled", value: notificationForm.realtime_enabled === "true", type: "boolean", description: "Enable Server-Sent Events for real-time notification updates." });
    await updateSetting({ group_name: "notifications", key_name: "popup_duration_seconds", value: seconds, type: "integer", description: "Bottom-left popup duration for in-app notifications." });
    toast.success("Notification settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveMaintenanceSettings = async () => {
    await updateSetting({ group_name: "maintenance", key_name: "enabled", value: maintenanceForm.enabled === "true", type: "boolean", description: "Maintenance mode toggle." });
    await updateSetting({ group_name: "maintenance", key_name: "message", value: maintenanceForm.message, type: "string", description: "Custom maintenance-mode message." });
    toast.success("Maintenance settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveApiSettings = async () => {
    const rateLimit = Number(apiForm.rate_limit_per_minute);
    if (!Number.isFinite(rateLimit) || rateLimit < 1) {
      toast.error("Rate limit must be a positive number.");
      return;
    }
    await updateSetting({ group_name: "api", key_name: "rate_limit_per_minute", value: rateLimit, type: "integer", description: "API rate limit per IP per minute." });
    await updateSetting({ group_name: "api", key_name: "api_keys_enabled", value: apiForm.api_keys_enabled === "true", type: "boolean", description: "Reserved API key toggle placeholder." });
    await updateSetting({ group_name: "api", key_name: "public_docs_enabled", value: apiForm.public_docs_enabled === "true", type: "boolean", description: "Reserved public API documentation toggle." });
    toast.success("API settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Site Settings and Content Management</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Security, Session, OTP, and Lockout Settings</p>
            <p className="text-sm text-muted-foreground">These values are used by login, email OTP/MFA, remember-me behavior, failed-login warnings, temporary lockout, and inactivity timeout handling.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Session timeout minutes</Label><Input type="number" min="1" value={securityForm.session_timeout_minutes} onChange={(event) => updateSecurityField("session_timeout_minutes", event.target.value)} /></div>
            <div className="space-y-2"><Label>Timeout warning minutes</Label><Input type="number" min="1" value={securityForm.session_timeout_warning_minutes} onChange={(event) => updateSecurityField("session_timeout_warning_minutes", event.target.value)} /></div>
            <div className="space-y-2"><Label>Remember me days</Label><Input type="number" min="1" value={securityForm.remember_me_days} onChange={(event) => updateSecurityField("remember_me_days", event.target.value)} /></div>
            <div className="space-y-2"><Label>Failed-login warning threshold</Label><Input type="number" min="1" value={securityForm.failed_login_warning_threshold} onChange={(event) => updateSecurityField("failed_login_warning_threshold", event.target.value)} /></div>
            <div className="space-y-2"><Label>Failed-login lockout threshold</Label><Input type="number" min="2" value={securityForm.failed_login_lockout_threshold} onChange={(event) => updateSecurityField("failed_login_lockout_threshold", event.target.value)} /></div>
            <div className="space-y-2"><Label>Lockout minutes</Label><Input type="number" min="1" value={securityForm.failed_login_lockout_minutes} onChange={(event) => updateSecurityField("failed_login_lockout_minutes", event.target.value)} /></div>
            <div className="space-y-2"><Label>Email OTP code TTL minutes</Label><Input type="number" min="1" value={securityForm.mfa_code_ttl_minutes} onChange={(event) => updateSecurityField("mfa_code_ttl_minutes", event.target.value)} /></div>
            <div className="space-y-2"><Label>Require MFA for all users</Label><Select value={securityForm.mfa_enforcement} onValueChange={(next) => updateSecurityField("mfa_enforcement", next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">No</SelectItem><SelectItem value="true">Yes</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Single active session per user</Label><Select value={securityForm.single_session_per_user} onValueChange={(next) => updateSecurityField("single_session_per_user", next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">No</SelectItem><SelectItem value="true">Yes</SelectItem></SelectContent></Select></div>
          </div>
          <Button onClick={saveSecuritySettings}>Save Security Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Warning and Alert System Settings</p>
            <p className="text-sm text-muted-foreground">Controls the storage-capacity warning shown in dashboard metrics and emailed to configured admin/security alert addresses.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Storage capacity limit (MB)</Label><Input type="number" min="1" value={systemForm.storage_capacity_limit_mb} onChange={(event) => setSystemForm((prev) => ({ ...prev, storage_capacity_limit_mb: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Storage warning threshold (%)</Label><Input type="number" min="1" max="100" value={systemForm.storage_warning_threshold_percent} onChange={(event) => setSystemForm((prev) => ({ ...prev, storage_warning_threshold_percent: event.target.value }))} /></div>
          </div>
          <Button onClick={saveSystemWarningSettings} variant="outline">Save Warning Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Automated Backup Settings</p>
            <p className="text-sm text-muted-foreground">Controls the displayed backup schedule and the retention window used when old backup files are cleaned up.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2"><Label>Retention days</Label><Input type="number" min="1" value={backupForm.retention_days} onChange={(event) => setBackupForm((prev) => ({ ...prev, retention_days: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Database schedule</Label><Input value={backupForm.database_schedule} onChange={(event) => setBackupForm((prev) => ({ ...prev, database_schedule: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Uploads schedule</Label><Input value={backupForm.uploads_schedule} onChange={(event) => setBackupForm((prev) => ({ ...prev, uploads_schedule: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Full-system schedule</Label><Input value={backupForm.full_system_schedule} onChange={(event) => setBackupForm((prev) => ({ ...prev, full_system_schedule: event.target.value }))} /></div>
          </div>
          <Button onClick={saveBackupSettings} variant="outline">Save Backup Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Audit Logging, Pagination, and Developer Simulation Settings</p>
            <p className="text-sm text-muted-foreground">Controls the auto-archive window, default page size, and the maximum number of safe simulation log records a developer can generate per run.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Archive logs older than days</Label><Input type="number" min="1" value={auditForm.archive_after_days} onChange={(event) => setAuditForm((prev) => ({ ...prev, archive_after_days: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Default audit page size</Label><Input type="number" min="10" value={auditForm.default_page_size} onChange={(event) => setAuditForm((prev) => ({ ...prev, default_page_size: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Max simulation events/run</Label><Input type="number" min="1" max="250" value={auditForm.max_simulation_events_per_run} onChange={(event) => setAuditForm((prev) => ({ ...prev, max_simulation_events_per_run: event.target.value }))} /></div>
          </div>
          <Button onClick={saveAuditSettings} variant="outline">Save Audit Settings</Button>
        </div>
        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Branding Settings</p>
            <p className="text-sm text-muted-foreground">Controls site name, logo URL, favicon URL, and theme colors shown in the UI and PDFs.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-2"><Label>Site name</Label><Input value={brandingForm.site_name} onChange={(event) => setBrandingForm((prev) => ({ ...prev, site_name: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Logo URL/path</Label><Input value={brandingForm.logo_url} onChange={(event) => setBrandingForm((prev) => ({ ...prev, logo_url: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Favicon URL/path</Label><Input value={brandingForm.favicon_url} onChange={(event) => setBrandingForm((prev) => ({ ...prev, favicon_url: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Theme color</Label><Input type="color" value={brandingForm.theme_color} onChange={(event) => setBrandingForm((prev) => ({ ...prev, theme_color: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Secondary color</Label><Input type="color" value={brandingForm.secondary_color} onChange={(event) => setBrandingForm((prev) => ({ ...prev, secondary_color: event.target.value }))} /></div>
          </div>
          <Button onClick={saveBrandingSettings} variant="outline">Save Branding Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Email and Notification Template Settings</p>
            <p className="text-sm text-muted-foreground">For safety, actual SMTP secrets still belong in .env. These values document and control user-facing template text.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2"><Label>Mailer</Label><Input value={emailForm.smtp_mailer} onChange={(event) => setEmailForm((prev) => ({ ...prev, smtp_mailer: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Host</Label><Input value={emailForm.smtp_host} onChange={(event) => setEmailForm((prev) => ({ ...prev, smtp_host: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Port</Label><Input type="number" value={emailForm.smtp_port} onChange={(event) => setEmailForm((prev) => ({ ...prev, smtp_port: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Username placeholder</Label><Input value={emailForm.smtp_username} onChange={(event) => setEmailForm((prev) => ({ ...prev, smtp_username: event.target.value }))} /></div>
            <div className="space-y-2"><Label>From address</Label><Input value={emailForm.from_address} onChange={(event) => setEmailForm((prev) => ({ ...prev, from_address: event.target.value }))} /></div>
            <div className="space-y-2"><Label>From name</Label><Input value={emailForm.from_name} onChange={(event) => setEmailForm((prev) => ({ ...prev, from_name: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Subject prefix</Label><Input value={emailForm.subject_prefix} onChange={(event) => setEmailForm((prev) => ({ ...prev, subject_prefix: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Email footer</Label><Input value={emailForm.footer} onChange={(event) => setEmailForm((prev) => ({ ...prev, footer: event.target.value }))} /></div>
          </div>
          <Button onClick={saveEmailSettings} variant="outline">Save Email Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Default Notification Preferences</p>
            <p className="text-sm text-muted-foreground">Controls default channels for new users and real-time popup behavior.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {["in_app", "popup", "email", "sms", "realtime_enabled"].map((key) => <div key={key} className="space-y-2"><Label>{key.replaceAll("_", " ")}</Label><Select value={notificationForm[key]} onValueChange={(next) => setNotificationForm((prev) => ({ ...prev, [key]: next }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Enabled</SelectItem><SelectItem value="false">Disabled</SelectItem></SelectContent></Select></div>)}
            <div className="space-y-2"><Label>Popup seconds</Label><Input type="number" min="1" value={notificationForm.popup_duration_seconds} onChange={(event) => setNotificationForm((prev) => ({ ...prev, popup_duration_seconds: event.target.value }))} /></div>
          </div>
          <Button onClick={saveNotificationSettings} variant="outline">Save Notification Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">Maintenance Mode</p>
            <p className="text-sm text-muted-foreground">Stores the maintenance toggle and custom message for deployment/demo control.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Maintenance mode</Label><Select value={maintenanceForm.enabled} onValueChange={(next) => setMaintenanceForm((prev) => ({ ...prev, enabled: next }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">Disabled</SelectItem><SelectItem value="true">Enabled</SelectItem></SelectContent></Select></div>
            <div className="space-y-2 md:col-span-2"><Label>Message</Label><Input value={maintenanceForm.message} onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, message: event.target.value }))} /></div>
          </div>
          <Button onClick={saveMaintenanceSettings} variant="outline">Save Maintenance Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-semibold">API Settings</p>
            <p className="text-sm text-muted-foreground">Rate-limit and API-key placeholders for future integrations and documentation.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Rate limit/minute</Label><Input type="number" min="1" value={apiForm.rate_limit_per_minute} onChange={(event) => setApiForm((prev) => ({ ...prev, rate_limit_per_minute: event.target.value }))} /></div>
            <div className="space-y-2"><Label>API keys</Label><Select value={apiForm.api_keys_enabled} onValueChange={(next) => setApiForm((prev) => ({ ...prev, api_keys_enabled: next }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">Disabled</SelectItem><SelectItem value="true">Enabled</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Public API docs</Label><Select value={apiForm.public_docs_enabled} onValueChange={(next) => setApiForm((prev) => ({ ...prev, public_docs_enabled: next }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">Disabled</SelectItem><SelectItem value="true">Enabled</SelectItem></SelectContent></Select></div>
          </div>
          <Button onClick={saveApiSettings} variant="outline">Save API Settings</Button>
        </div>

        <div className="border rounded-xl p-4 space-y-3">
          <p className="font-semibold">Advanced Manual Setting Update</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2"><Label>Group</Label><Input value={groupName} onChange={(event) => setGroupName(event.target.value)} /></div>
            <div className="space-y-2"><Label>Key</Label><Input value={keyName} onChange={(event) => setKeyName(event.target.value)} /></div>
            <div className="space-y-2"><Label>Value</Label><Input value={value} onChange={(event) => setValue(event.target.value)} placeholder='30 or {"enabled":true}' /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} /></div>
          </div>
          <Button onClick={saveSetting} variant="outline">Save Setting</Button>
        </div>

        {isLoading ? <p className="text-muted-foreground">Loading settings...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(settings).map(([group, values]) => (
              <div key={group} className="border rounded-xl p-4 space-y-3">
                <h3 className="font-bold capitalize">{group}</h3>
                {Object.entries(values).map(([key, meta]) => (
                  <div key={key} className="text-sm border-t pt-2">
                    <p className="font-medium">{key.replaceAll("_", " ")}</p>
                    <p className="text-muted-foreground">{meta.description}</p>
                    <code className="text-xs break-all">{JSON.stringify(meta.value)}</code>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportTab() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [lastCommit, setLastCommit] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Idle");
  const [duplicateStrategy, setDuplicateStrategy] = useState("skip");

  const setWorkingStage = (label, value) => {
    setStage(label);
    setProgress(value);
  };

  const resetImportState = () => {
    setPreview(null);
    setLastCommit(null);
    setProgress(0);
    setStage("Idle");
  };

  const previewImport = async () => {
    if (!file) {
      toast.error("Choose a CSV or Excel file first.");
      return;
    }
    setIsWorking(true);
    setLastCommit(null);
    try {
      setWorkingStage("Uploading spreadsheet", 20);
      await new Promise((resolve) => setTimeout(resolve, 120));
      setWorkingStage("Reading rows", 45);
      const result = await base44.importExport.preview(file);
      setWorkingStage("Validating duplicates and field rules", 80);
      setPreview(result);
      setWorkingStage("Preview complete", 100);
      toast.success(`Preview complete: ${result.success_count} valid, ${result.failed_count} failed, ${result.duplicate_count || 0} duplicates.`);
    } catch (error) {
      setWorkingStage("Import preview failed", 100);
      toast.error(error.message || "Import preview failed.");
    } finally {
      setIsWorking(false);
    }
  };

  const emailDocumentsPdf = async () => {
    try {
      const result = await base44.importExport.emailPdf({});
      toast.success(`Document PDF emailed to ${result.recipient || "your email"}.`);
    } catch (error) {
      toast.error(error.message || "Failed to email document PDF.");
    }
  };

  const commitImport = async () => {
    if (!preview || (preview.valid_rows || []).length === 0) {
      toast.error("There are no valid rows to import.");
      return;
    }
    setIsWorking(true);
    try {
      setWorkingStage("Creating document records", 35);
      const result = await base44.importExport.commit(preview.valid_rows || [], duplicateStrategy);
      setWorkingStage("Refreshing document lists", 90);
      setLastCommit(result);
      setPreview(null);
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setWorkingStage("Import committed", 100);
      toast.success(`Imported ${result.created_count} documents. Skipped ${result.skipped_count || 0}.`);
    } catch (error) {
      setWorkingStage("Import commit failed", 100);
      toast.error(error.message || "Import commit failed.");
    } finally {
      setIsWorking(false);
    }
  };

  const failedRows = preview?.failed_rows || lastCommit?.failed_rows || [];
  const hasFailedRows = failedRows.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Bulk Document Import</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Upload CSV or Excel files, preview validation errors, detect duplicates, then commit only the valid rows.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => base44.importExport.template("csv")} className="gap-2">
                <Download className="w-4 h-4" /> CSV Template
              </Button>
              <Button variant="outline" onClick={() => base44.importExport.template("excel")} className="gap-2">
                <Download className="w-4 h-4" /> Excel Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
            <div className="border rounded-xl p-4 space-y-4 bg-background">
              <div className="space-y-2">
                <Label>CSV / Excel File</Label>
                <Input
                  type="file"
                  accept=".csv,.txt,.xls,.xlsx,.xml,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    resetImportState();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Required columns: classification, section, particulars, received_date. Optional: control_number, source_office, requestor, amount, status, remarks.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Duplicate Handling</Label>
                <Select value={duplicateStrategy} onValueChange={setDuplicateStrategy}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip invalid/duplicate rows and import valid rows</SelectItem>
                    <SelectItem value="fail">Stop import if any invalid/duplicate row exists</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={previewImport} disabled={isWorking || !file} className="gap-2">
                  <Upload className="w-4 h-4" /> Validate Import
                </Button>
                {preview && (
                  <Button variant="outline" onClick={resetImportState} disabled={isWorking}>
                    Clear Preview
                  </Button>
                )}
              </div>
            </div>

            <div className="border rounded-xl p-4 space-y-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Import Progress</p>
                  <p className="text-sm text-muted-foreground">{stage}</p>
                </div>
                <Badge variant="outline">{progress}%</Badge>
              </div>
              <Progress value={progress} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <SummaryBox label="Total Rows" value={preview?.total_rows ?? lastCommit?.requested_count ?? 0} />
                <SummaryBox label="Valid / Created" value={preview?.success_count ?? lastCommit?.created_count ?? 0} />
                <SummaryBox label="Failed / Skipped" value={preview?.failed_count ?? lastCommit?.skipped_count ?? 0} />
                <SummaryBox label="Duplicates" value={preview?.duplicate_count ?? lastCommit?.duplicate_count ?? 0} />
              </div>
            </div>
          </div>

          {preview && (
            <div className="border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold">Import Preview</p>
                  <p className="text-sm text-muted-foreground">
                    {preview.success_count} valid rows, {preview.failed_count} failed rows, {preview.duplicate_count || 0} duplicates out of {preview.total_rows} total rows.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {preview.failed_count > 0 && (
                    <Button variant="outline" onClick={() => base44.importExport.errorReport(preview.failed_rows)} className="gap-2">
                      <AlertTriangle className="w-4 h-4" /> Download Error Report
                    </Button>
                  )}
                  <Button onClick={commitImport} disabled={isWorking || (preview.valid_rows || []).length === 0}>
                    Commit Valid Rows
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PreviewPanel title="Valid Rows Sample" rows={preview.valid_rows || []} variant="success" />
                <PreviewPanel title="Failed / Duplicate Rows" rows={preview.failed_rows || []} variant="warning" />
              </div>
            </div>
          )}

          {lastCommit && (
            <div className="border rounded-xl p-4 space-y-3 bg-green-50 text-green-950">
              <p className="font-semibold">Import Commit Summary</p>
              <p className="text-sm">
                Requested {lastCommit.requested_count} rows. Created {lastCommit.created_count}. Skipped {lastCommit.skipped_count}. Duplicates detected {lastCommit.duplicate_count || 0}.
              </p>
              {hasFailedRows && (
                <Button variant="outline" onClick={() => base44.importExport.errorReport(failedRows)} className="gap-2">
                  <AlertTriangle className="w-4 h-4" /> Download Skipped Rows Report
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document Export</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Export the current document dataset for analysis, backups, reports, official printing, or API integration.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <Button variant="outline" onClick={() => base44.importExport.exportDocuments({ format: "csv" })} className="gap-2">
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => base44.importExport.exportDocuments({ format: "excel" })} className="gap-2">
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button variant="outline" onClick={() => base44.importExport.exportDocuments({ format: "pdf" })} className="gap-2">
              <Download className="w-4 h-4" /> PDF
            </Button>
            <Button variant="outline" onClick={emailDocumentsPdf} className="gap-2">
              <Download className="w-4 h-4" /> Email PDF
            </Button>
            <Button variant="outline" onClick={() => base44.importExport.exportDocuments({ format: "json" })} className="gap-2">
              <Download className="w-4 h-4" /> JSON
            </Button>
            <Button variant="outline" onClick={() => base44.importExport.exportDocuments({ format: "xml" })} className="gap-2">
              <Download className="w-4 h-4" /> XML
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


function SecurityMonitorTab() {
  const [minutes, setMinutes] = useState("60");
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["security-monitor", minutes],
    queryFn: () => base44.securityMonitor.live({ minutes }),
    refetchInterval: 10000,
  });

  const summary = data?.security_summary || {};
  const performance = data?.performance || {};
  const controls = data?.security_controls || [];
  const categoryRows = data?.category_counts || [];
  const severityRows = data?.severity_counts || [];
  const recentEvents = data?.recent_events || [];
  const buckets = performance?.buckets || [];

  const severityBadge = (severity) => {
    const value = String(severity || "info").toLowerCase();
    if (value === "critical") return "destructive";
    if (value === "warning" || value === "error") return "secondary";
    return "outline";
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="dt-skeleton h-28" />)}
        </div>
        <div className="dt-skeleton h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Live Security & Performance Monitor
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Admin demo page for security headers, attack-simulation logs, failed-login warnings, response timing, and API health.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={minutes} onValueChange={setMinutes}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">Last 15 min</SelectItem>
                  <SelectItem value="30">Last 30 min</SelectItem>
                  <SelectItem value="60">Last 60 min</SelectItem>
                  <SelectItem value="180">Last 3 hours</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => refetch()} className="gap-2" disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh AJAX
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SecurityMetricCard label="Suspicious Events" value={summary.suspicious_events ?? 0} helper={`${summary.simulated_attack_events ?? 0} simulation records`} icon={ShieldAlert} />
        <SecurityMetricCard label="Critical Events" value={summary.critical_events ?? 0} helper={`${summary.warning_events ?? 0} warnings`} icon={AlertTriangle} />
        <SecurityMetricCard label="Avg Risk Score" value={summary.average_risk_score ?? 0} helper="Audit risk classifier" icon={Gauge} />
        <SecurityMetricCard label="API Error Rate" value={`${performance.error_rate_percent ?? 0}%`} helper={`${performance.requests ?? 0} requests in window`} icon={LockKeyhole} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Attack / Security Categories</CardTitle>
            <p className="text-sm text-muted-foreground">Updates automatically when the Developer Console creates safe simulation logs.</p>
          </CardHeader>
          <CardContent className="h-80">
            {categoryRows.length === 0 ? (
              <div className="dt-empty">No suspicious events in the selected time window.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={80} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" name="Events" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Performance Trend</CardTitle>
            <p className="text-sm text-muted-foreground">Response timing is captured server-wide and surfaced through AJAX.</p>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="requests" name="Requests" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="avg_ms" name="Avg ms" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Security Control Checklist</CardTitle>
            <p className="text-sm text-muted-foreground">Covers the required security/performance controls from the project criteria.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {controls.map((control) => (
              <div key={control.name} className="rounded-xl border p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{control.name}</p>
                  <p className="text-sm text-muted-foreground">{control.detail}</p>
                </div>
                <Badge variant={control.status === "enabled" ? "outline" : "secondary"} className="w-fit capitalize">
                  {control.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Severity Summary</CardTitle>
            <p className="text-sm text-muted-foreground">Performance: {performance.average_response_ms ?? 0} ms average, {performance.max_response_ms ?? 0} ms max.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(severityRows.length ? severityRows : [{ severity: "info", total: 0 }]).map((row) => (
                <div key={row.severity} className="rounded-xl border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.severity}</p>
                  <p className="text-2xl font-bold">{row.total}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border p-4">
              <p className="font-semibold">Top API Paths</p>
              <div className="mt-3 space-y-2">
                {(performance.top_paths || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No API traffic recorded yet.</p>
                ) : performance.top_paths.map((row) => (
                  <div key={row.path} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{row.path}</span>
                    <Badge variant="outline">{row.requests}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Security Events</CardTitle>
          <p className="text-sm text-muted-foreground">Use this for the live demo after running SQLi, XSS, brute-force, privilege, or DDoS simulations.</p>
        </CardHeader>
        <CardContent>
          <div className="dt-responsive-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No security events in this window.</TableCell></TableRow>
                ) : recentEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs">{event.time ? new Date(event.time).toLocaleString() : "—"}</TableCell>
                    <TableCell><Badge variant={severityBadge(event.severity)}>{event.category}</Badge></TableCell>
                    <TableCell>{event.risk_score}</TableCell>
                    <TableCell className="text-xs">{event.source}</TableCell>
                    <TableCell className="text-sm">{event.action}</TableCell>
                    <TableCell className="min-w-72 text-sm text-muted-foreground">{event.message || event.indicator || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityMetricCard({ label, value, helper, icon: Icon }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{helper}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryBox({ label, value }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function PreviewPanel({ title, rows, variant }) {
  const isWarning = variant === "warning";
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className={`px-4 py-3 border-b ${isWarning ? "bg-amber-50" : "bg-green-50"}`}>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">Showing up to 8 rows.</p>
      </div>
      <div className="max-h-80 overflow-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No rows to show.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 8).map((row, index) => (
                <TableRow key={`${row.row_number || index}-${row.particulars || index}`}>
                  <TableCell>{row.row_number || index + 2}</TableCell>
                  <TableCell className="min-w-72">
                    <div className="font-medium line-clamp-2">{row.particulars || "Untitled"}</div>
                    <div className="text-xs text-muted-foreground">{row.classification || "No classification"} • {row.section || "No section"}</div>
                  </TableCell>
                  <TableCell className="min-w-72">
                    {isWarning ? (
                      <div className="space-y-1">
                        {(row.errors || []).map((error) => (
                          <Badge key={error} variant="destructive" className="mr-1 mb-1 whitespace-normal">{error}</Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="outline">Valid</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
