import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import StatusBadge from "@/components/documents/StatusBadge";
import {
  Inbox,
  Send,
  CheckCircle2,
  RotateCcw,
  FilePlus,
  FileText,
  Clock,
  FileCheck,
  RefreshCw,
  Users,
  Activity,
  Server,
  AlertTriangle,
  Bell,
  Database,
} from "lucide-react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RECEIVING_STATUS_CARDS = [
  { status: "Pending Receipt", icon: Clock, color: "bg-slate-500" },
  { status: "Forwarded", icon: Send, color: "bg-blue-500" },
  { status: "Returned", icon: RotateCcw, color: "bg-red-500" },
  { status: "Released", icon: CheckCircle2, color: "bg-green-500" },
];

const SECTION_HANDLER_STATUS_CARDS = [
  { status: "Forwarded", icon: Send, color: "bg-blue-500" },
  { status: "Received", icon: Inbox, color: "bg-cyan-500" },
  { status: "For Signature", icon: FileCheck, color: "bg-purple-500" },
  { status: "Returned", icon: RotateCcw, color: "bg-red-500" },
];

const COMMS_STATUS_CARDS = [
  { status: "Forwarded", icon: Send, color: "bg-blue-500" },
  { status: "Received", icon: Inbox, color: "bg-cyan-500" },
  { status: "For Signature", icon: FileCheck, color: "bg-purple-500" },
  { status: "For Release", icon: Send, color: "bg-orange-500" },
];

const RECORDS_RELEASE_STATUS_CARDS = [
  { status: "For Release", icon: Send, color: "bg-orange-500" },
  { status: "Received", icon: Inbox, color: "bg-cyan-500" },
  { status: "Released", icon: CheckCircle2, color: "bg-green-500" },
  { status: "Returned", icon: RotateCcw, color: "bg-red-500" },
];

const MAYOR_STATUS_CARDS = [
  { status: "For Signature", icon: FileCheck, color: "bg-purple-500" },
  { status: "Signed", icon: FileCheck, color: "bg-indigo-500" },
  { status: "For Release", icon: Send, color: "bg-orange-500" },
  { status: "Returned", icon: RotateCcw, color: "bg-red-500" },
];

const DEFAULT_STATUS_CARDS = [
  { status: "Pending Receipt", icon: Clock, color: "bg-slate-500" },
  { status: "Forwarded", icon: Send, color: "bg-blue-500" },
  { status: "Received", icon: Inbox, color: "bg-cyan-500" },
  { status: "For Signature", icon: FileCheck, color: "bg-purple-500" },
  { status: "Signed", icon: FileCheck, color: "bg-indigo-500" },
  { status: "For Release", icon: Send, color: "bg-orange-500" },
  { status: "Released", icon: CheckCircle2, color: "bg-green-500" },
  { status: "Returned", icon: RotateCcw, color: "bg-red-500" },
];

const PIE_COLORS = ["#dc2626", "#ea580c", "#2563eb", "#0891b2", "#16a34a", "#7c3aed", "#4b5563", "#9333ea"];

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [range, setRange] = useState("month");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  useEffect(() => {
    const listener = () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-actions"] });
    };
    window.addEventListener("docutracker:data-mutated", listener);
    return () => window.removeEventListener("docutracker:data-mutated", listener);
  }, [queryClient]);

  const dashboardParams = useMemo(
    () => ({ range, ...(range === "custom" ? customRange : {}) }),
    [range, customRange]
  );

  const { data: stats, isFetching: isStatsFetching, refetch } = useQuery({
    queryKey: ["dashboard-stats", dashboardParams],
    queryFn: () => base44.dashboard.stats(dashboardParams),
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => base44.entities.Document.list("-created_date", 300),
    refetchInterval: 30000,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["dashboard-actions"],
    queryFn: () => base44.entities.DocumentAction.list("-created_date", 1000),
    refetchInterval: 30000,
  });

  const userRole = currentUser?.role?.toUpperCase();
  const isReceiving = userRole === "RECEIVING";
  const isAdmin = userRole === "ADMIN";
  const roleCardMap = {
    RECEIVING: RECEIVING_STATUS_CARDS,
    PROCUREMENT: SECTION_HANDLER_STATUS_CARDS,
    MOBILIZATION: SECTION_HANDLER_STATUS_CARDS,
    COMMS: COMMS_STATUS_CARDS,
    RECORDS: RECORDS_RELEASE_STATUS_CARDS,
    RELEASING: RECORDS_RELEASE_STATUS_CARDS,
    MAYOR: MAYOR_STATUS_CARDS,
    ADMIN: DEFAULT_STATUS_CARDS,
    DEVELOPER: DEFAULT_STATUS_CARDS,
  };
  const activeCards = roleCardMap[userRole] || DEFAULT_STATUS_CARDS;
  const canCreateDocument = isReceiving || isAdmin;

  const forwardedToMeDocIds = new Set(
    actions
      .filter((action) => action.action_type === "Forwarded" && action.to_user === currentUser?.email)
      .map((action) => action.document_id)
  );

  const dashboardDocs =
    isReceiving || isAdmin || userRole === "DEVELOPER"
      ? documents
      : documents.filter(
          (doc) =>
            doc.current_holder === currentUser?.email ||
            forwardedToMeDocIds.has(doc.id)
        );

  const getCount = (status) => dashboardDocs.filter((d) => d.status === status).length;
  const recentDocs = dashboardDocs.slice(0, 8);

  const sentFromByDocument = actions.reduce((acc, action) => {
    if (action.action_type !== "Forwarded") return acc;
    if (!acc[action.document_id]) {
      acc[action.document_id] = action.from_user_name || action.from_user || "—";
    }
    return acc;
  }, {});

  const statusChart = useMemo(() => {
    const counts = stats?.status_counts || {};
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [stats]);

  const classificationChart = useMemo(() => {
    const counts = stats?.classification_counts || {};
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [stats]);

  const transactionChart = stats?.transaction_overview || [];

  const topCards = [
    { label: "Total Users", value: stats?.user_statistics?.total_users ?? "—", helper: `${stats?.user_statistics?.active_now ?? 0} active now`, icon: Users },
    { label: "Documents", value: stats?.document_statistics?.total_documents ?? "—", helper: `${stats?.document_statistics?.released_documents ?? 0} released`, icon: FileText },
    { label: "Unread Notifications", value: stats?.performance_metrics?.unread_notifications ?? "—", helper: "Real-time inbox", icon: Bell },
    { label: "Critical Errors", value: stats?.performance_metrics?.critical_error_count ?? "—", helper: `${stats?.performance_metrics?.warning_event_count ?? 0} warnings`, icon: AlertTriangle },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Welcome{currentUser ? `, ${currentUser.full_name}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-lg mt-1">Comprehensive dashboard with live statistics, charts, quick actions, and recent activity.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {range === "custom" && (
            <>
              <Input type="date" value={customRange.start} onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))} className="w-[150px]" />
              <Input type="date" value={customRange.end} onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))} className="w-[150px]" />
            </>
          )}
          <Button variant="outline" onClick={() => refetch()} disabled={isStatsFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isStatsFetching ? "animate-spin" : ""}`} />
            Refresh AJAX
          </Button>
          {canCreateDocument && (
            <Button onClick={() => navigate("/documents/new")} className="gap-2">
              <FilePlus className="w-4 h-4" />
              New Document
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {topCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.helper}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <card.icon className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {activeCards.map((item) => (
          <Card
            key={item.status}
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary/30"
            onClick={() => navigate(`/documents?status=${item.status}`)}
          >
            <CardContent className="p-4 sm:p-5">
              <div className={`w-11 h-11 rounded-xl ${item.color} flex items-center justify-center mb-3`}>
                <item.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold">{isLoading ? "—" : getCount(item.status)}</p>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">{item.status}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Transaction Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={transactionChart} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="created" name="Created documents" stroke="#dc2626" fill="#dc2626" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="actions" name="Document actions" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} />
                  <Area type="monotone" dataKey="audit_events" name="Audit events" stroke="#16a34a" fill="#16a34a" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server className="w-5 h-5 text-primary" /> System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-xl border p-4 space-y-2">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Server uptime</span><span className="font-medium text-right">{stats?.system_health?.server_uptime || "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Database size</span><span className="font-medium">{stats?.system_health?.database_size || "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Storage usage</span><span className="font-medium">{stats?.system_health?.storage_usage_human || "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Storage threshold</span><span className="font-medium">{stats?.system_health?.storage_warning_threshold_percent ?? 85}%</span></div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Capacity usage</span>
                  <span className="font-semibold">
                    {stats?.system_health?.storage_usage_percent ?? 0}% of {stats?.system_health?.storage_capacity_limit_mb ?? "—"} MB
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${stats?.system_health?.storage_warning_active ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${Math.min(Number(stats?.system_health?.storage_usage_percent || 0), 100)}%` }}
                  />
                </div>
                {stats?.system_health?.storage_warning_active && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                    Storage warning threshold reached. Admin email alerts use configured .env recipients.
                  </p>
                )}
              </div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">API response</span><span className="font-medium">{stats?.performance_metrics?.api_response_ms ?? "—"} ms</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {stats?.quick_actions?.map((action) => (
                <Button key={action.path} variant="outline" size="sm" onClick={() => navigate(action.path)}>{action.label}</Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChart} dataKey="value" nameKey="name" outerRadius={95} label>
                    {statusChart.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classification Counts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classificationChart} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Documents" fill="#dc2626" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Recent Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentDocs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-base">No documents yet</p>
            ) : (
              <div className="rounded-xl border bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Control No.</TableHead>
                      <TableHead>Particular</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Forwarded To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentDocs.map((doc) => (
                      <TableRow key={doc.id} className="cursor-pointer" onClick={() => navigate(`/documents/${doc.id}`)}>
                        <TableCell className="font-semibold text-primary whitespace-nowrap">{doc.control_number || "—"}</TableCell>
                        <TableCell className="max-w-[260px]"><p className="truncate">{doc.particulars || "—"}</p></TableCell>
                        <TableCell><StatusBadge status={doc.status} /></TableCell>
                        <TableCell>{doc.forwarded_to || sentFromByDocument[doc.id] || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(stats?.recent_activities || []).length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No activity found for this range.</p>
              ) : (
                stats.recent_activities.map((item) => (
                  <div key={item.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{item.action_type}</p>
                      <p className="text-xs text-muted-foreground">{item.from_user_name || "—"} → {item.to_user_name || "—"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{item.created_date ? format(new Date(item.created_date), "MMM d, h:mm a") : "—"}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
