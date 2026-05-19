import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bell, Database, FilePlus, FileText, RefreshCw, Server, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function DashboardSummaryBar({ className }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [range, setRange] = useState("today");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["global-dashboard-summary", range],
    queryFn: () => base44.dashboard.stats({ range }),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    const listener = () => {
      queryClient.invalidateQueries({ queryKey: ["global-dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    };

    window.addEventListener("docutracker:data-mutated", listener);
    return () => window.removeEventListener("docutracker:data-mutated", listener);
  }, [queryClient]);

  const cards = useMemo(() => {
    const users = data?.user_statistics || {};
    const docs = data?.document_statistics || {};
    const health = data?.system_health || {};
    const perf = data?.performance_metrics || {};

    return [
      {
        label: "Users active now",
        value: users.active_now ?? "—",
        helper: `${users.total_users ?? "—"} total users`,
        icon: Users,
      },
      {
        label: "Documents",
        value: docs.total_documents ?? "—",
        helper: `${docs.pending_documents ?? 0} pending`,
        icon: FileText,
      },
      {
        label: "Unread alerts",
        value: perf.unread_notifications ?? "—",
        helper: `${perf.warning_event_count ?? 0} warnings`,
        icon: Bell,
      },
      {
        label: "Storage / DB",
        value: health.storage_usage_human ?? "—",
        helper: health.database_size ? `DB ${health.database_size}` : "Database size",
        icon: Database,
      },
    ];
  }, [data]);

  return (
    <div className={cn("px-4 pt-4 lg:px-6", className)}>
      <Card className="border-primary/10 shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="hidden sm:flex h-10 w-10 rounded-xl bg-primary/10 text-primary items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base">Live System Snapshot</p>
                <p className="text-xs text-muted-foreground truncate">
                  AJAX refreshed across modules. Last generated: {data?.generated_at ? new Date(data.generated_at).toLocaleTimeString() : "loading"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1 xl:max-w-3xl">
              {cards.map((item) => (
                <div key={item.label} className="rounded-xl border bg-background px-3 py-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{item.label}</span>
                  </div>
                  <p className="text-lg font-bold mt-1 truncate">{item.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.helper}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => navigate("/documents/new")} className="gap-2">
                <FilePlus className="w-4 h-4" />
                New
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate("/documents")} className="gap-2">
                <Activity className="w-4 h-4" />
                Records
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
