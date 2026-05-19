import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Bug, Code2, Database, Play, RefreshCw, ServerCog, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const tabs = [
  { id: "overview", label: "Overview", icon: Code2 },
  { id: "simulator", label: "Attack Simulator", icon: ShieldAlert },
  { id: "history", label: "Simulation History", icon: Bug },
  { id: "diagnostics", label: "Diagnostics", icon: ServerCog },
  { id: "settings", label: "Developer Settings", icon: Code2 },
];

const categoryLabels = {
  sql_injection: "SQL Injection",
  xss: "XSS",
  authentication: "Authentication",
  dos_ddos: "DoS/DDoS",
  network: "Network",
  social_engineering: "Social Engineering",
  privilege: "Privilege",
};

export default function DeveloperConsole() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Code2 className="w-8 h-8 text-primary" /> Developer Console
        </h1>
        <p className="text-muted-foreground mt-1">
          Technical diagnostics and safe log-only attack simulations for audit logging demos.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          These tools only create categorized audit-log records. They do not generate real traffic, scan ports,
          send phishing, brute-force accounts, exploit SQL/XSS, or contact external targets.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button key={tab.id} variant={activeTab === tab.id ? "default" : "outline"} onClick={() => setActiveTab(tab.id)} className="gap-2">
              <Icon className="w-4 h-4" /> {tab.label}
            </Button>
          );
        })}
      </div>

      {activeTab === "overview" && <Overview />}
      {activeTab === "simulator" && <Simulator />}
      {activeTab === "history" && <History />}
      {activeTab === "diagnostics" && <Diagnostics />}
      {activeTab === "settings" && <DeveloperSettings />}
    </div>
  );
}

function Overview() {
  const { data } = useQuery({ queryKey: ["developer-simulations"], queryFn: () => base44.developer.simulations() });
  const attacks = data?.attacks || [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Simulation Mode</p>
          <p className="text-2xl font-bold mt-1">Safe / Log-only</p>
          <p className="text-sm text-muted-foreground mt-2">Maximum records per run: {data?.limits?.max_events_per_run || 100}</p>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle>Available Demonstrations</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {attacks.map((attack) => (
            <div key={attack.key} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{attack.label}</p>
                <Badge variant={attack.severity === "critical" ? "destructive" : "outline"}>{attack.severity}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{categoryLabels[attack.category] || attack.category}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Simulator() {
  const queryClient = useQueryClient();
  const [attackType, setAttackType] = useState("sql_injection");
  const [eventCount, setEventCount] = useState("10");
  const [targetLabel, setTargetLabel] = useState("DocTracker demo environment");
  const [isRunning, setIsRunning] = useState(false);
  const { data } = useQuery({ queryKey: ["developer-simulations"], queryFn: () => base44.developer.simulations() });
  const attacks = data?.attacks || [];

  const run = async () => {
    const count = Number(eventCount);
    if (!Number.isFinite(count) || count < 1) {
      toast.error("Enter a valid event count.");
      return;
    }
    setIsRunning(true);
    try {
      const result = await base44.developer.runSimulation({ attack_type: attackType, event_count: count, target_label: targetLabel });
      toast.warning(`${result.events_created} categorized audit log entries created for ${result.attack_type}.`);
      queryClient.invalidateQueries({ queryKey: ["developer-history"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    } catch (error) {
      toast.error(error.message || "Simulation failed.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Safe Attack Simulation Runner</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2 md:col-span-2">
            <Label>Simulation Type</Label>
            <Select value={attackType} onValueChange={setAttackType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {attacks.map((attack) => <SelectItem key={attack.key} value={attack.key}>{attack.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Log Events to Create</Label>
            <Input type="number" min="1" max={data?.limits?.max_events_per_run || 100} value={eventCount} onChange={(e) => setEventCount(e.target.value)} />
          </div>
          <Button onClick={run} disabled={isRunning} className="gap-2">
            <Play className="w-4 h-4" /> {isRunning ? "Running..." : "Run Simulation"}
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Target Label for Demo Reports</Label>
          <Input value={targetLabel} onChange={(e) => setTargetLabel(e.target.value)} placeholder="DocTracker demo environment" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {attacks.map((attack) => (
            <button key={attack.key} type="button" onClick={() => setAttackType(attack.key)} className={`text-left rounded-xl border p-4 hover:border-primary ${attackType === attack.key ? "border-primary bg-primary/5" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{attack.label}</p>
                <Badge variant={attack.severity === "critical" ? "destructive" : "outline"}>{attack.severity}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{attack.description}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function History() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("25");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const query = { page, per_page: perPage, category: category === "all" ? "" : category, search };
  const { data: pageData = { data: [], meta: {} }, isLoading, refetch } = useQuery({
    queryKey: ["developer-history", query],
    queryFn: () => base44.developer.history(query),
  });
  const rows = pageData.data || [];
  const meta = pageData.meta || {};

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between gap-3 flex-wrap">
          <CardTitle>Simulation History</CardTitle>
          <Button variant="outline" onClick={() => refetch()} className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search simulation logs" className="max-w-sm" />
          <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(categoryLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={perPage} onValueChange={(value) => { setPerPage(value); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="25">25 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
              <SelectItem value="100">100 rows</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading ? <p className="text-muted-foreground">Loading simulation history...</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Batch</TableHead><TableHead>Category</TableHead><TableHead>Risk</TableHead><TableHead>Severity</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className={row.severity === "critical" ? "bg-red-50" : "bg-amber-50"}>
                  <TableCell className="text-xs">{row.created_date ? new Date(row.created_date).toLocaleString() : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.batch || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{categoryLabels[row.category] || row.category}</Badge></TableCell>
                  <TableCell className="font-semibold">{row.risk_score}</TableCell>
                  <TableCell><Badge variant={row.severity === "critical" ? "destructive" : "outline"}>{row.severity}</Badge></TableCell>
                  <TableCell className="text-sm">{row.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PaginationBar meta={meta} page={page} setPage={setPage} />
      </CardContent>
    </Card>
  );
}

function Diagnostics() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["developer-diagnostics"], queryFn: () => base44.developer.diagnostics() });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5 text-primary" /> Runtime Diagnostics</CardTitle>
          <Button variant="outline" onClick={() => refetch()} className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading diagnostics...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(data || {}).map(([key, value]) => (
              <div key={key} className="rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">{key.replaceAll("_", " ")}</p>
                <p className="font-mono text-sm break-all mt-1">{String(value)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getSettingValue(settings, group, key, fallback = "") {
  const raw = settings?.[group]?.[key]?.value;
  if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "value")) {
    return raw.value;
  }
  return raw ?? fallback;
}

function DeveloperSettings() {
  const queryClient = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => base44.settings.list() });
  const [form, setForm] = useState({ max_simulation_events_per_run: "100", safe_simulation_mode: "true" });

  useEffect(() => {
    setForm({
      max_simulation_events_per_run: String(getSettingValue(settings, "developer", "max_simulation_events_per_run", 100)),
      safe_simulation_mode: String(getSettingValue(settings, "developer", "safe_simulation_mode", true)),
    });
  }, [settings]);

  const save = async () => {
    const maxEvents = Number(form.max_simulation_events_per_run);
    if (!Number.isFinite(maxEvents) || maxEvents < 1 || maxEvents > 250) {
      toast.error("Max simulation events must be between 1 and 250.");
      return;
    }

    await base44.settings.update({
      group_name: "developer",
      key_name: "max_simulation_events_per_run",
      value: maxEvents,
      type: "integer",
      description: "Maximum safe log-only simulation records per run.",
    });
    await base44.settings.update({
      group_name: "developer",
      key_name: "safe_simulation_mode",
      value: form.safe_simulation_mode === "true",
      type: "boolean",
      description: "Developer attack demonstrations write logs only and do not perform real attacks.",
    });

    toast.success("Developer settings updated.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["developer-simulations"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Developer Site Settings</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border p-4 bg-muted/30">
          <p className="font-semibold">Editable developer settings</p>
          <p className="text-sm text-muted-foreground mt-1">Developer users can view technical settings but can only update the developer setting group. Admin-only security, backup, and system settings remain protected.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Max simulation events per run</Label>
            <Input type="number" min="1" max="250" value={form.max_simulation_events_per_run} onChange={(event) => setForm((prev) => ({ ...prev, max_simulation_events_per_run: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Safe simulation mode</Label>
            <Select value={form.safe_simulation_mode} onValueChange={(value) => setForm((prev) => ({ ...prev, safe_simulation_mode: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled display only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={save}>Save Developer Settings</Button>

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

function PaginationBar({ meta, page, setPage }) {
  const lastPage = Number(meta?.last_page || 1);
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap border rounded-xl p-3">
      <p className="text-sm text-muted-foreground">
        Showing {meta?.from || 0} to {meta?.to || 0} of {meta?.total || 0} records. Page {page} of {lastPage}.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
