import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, RefreshCw, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const severityClass = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-red-50 text-red-700 border-red-200",
  error: "bg-red-50 text-red-700 border-red-200",
};

export default function Notifications() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ search: "", type: "all", severity: "all", is_read: "all", per_page: "10", page: 1, sort: "created_at", direction: "desc" });

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  useEffect(() => {
    const listener = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
    window.addEventListener("docutracker:data-mutated", listener);
    return () => window.removeEventListener("docutracker:data-mutated", listener);
  }, [queryClient]);

  const queryParams = useMemo(() => ({
    search: filters.search,
    type: filters.type === "all" ? "" : filters.type,
    severity: filters.severity === "all" ? "" : filters.severity,
    is_read: filters.is_read === "all" ? "" : filters.is_read,
    per_page: filters.per_page,
    page: filters.page,
    sort: filters.sort,
    direction: filters.direction,
  }), [filters]);

  const { data: notificationPage = { data: [], meta: {} }, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["notifications", currentUser?.email, queryParams],
    queryFn: () => base44.entities.Notification.listPage(queryParams),
    enabled: !!currentUser?.email,
    refetchInterval: 15000,
  });

  const notifications = notificationPage.data || [];
  const meta = notificationPage.meta || {};
  const unreadCount = meta.unread_count ?? notifications.filter((item) => !item.is_read).length;

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: key === "page" ? value : 1 }));
  };

  const markAsRead = async (notificationId) => {
    await base44.entities.Notification.update(notificationId, { is_read: true, read_at: new Date().toISOString() });
    toast.success("Notification marked as read.");
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
  };

  const markAllAsRead = async () => {
    await base44.entities.Notification.markAllRead();
    toast.success("All notifications marked as read.");
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
  };

  const deleteNotification = async (notificationId) => {
    await base44.entities.Notification.delete(notificationId);
    toast.warning("Notification deleted.");
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Bell className="w-8 h-8 text-primary" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1">Real-time in-app notifications with type filters, unread badge, mark-read actions, and user preferences.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={markAllAsRead} disabled={unreadCount === 0} className="gap-2">
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Inbox ({meta.total ?? notifications.length})</CardTitle>
            <Badge variant="outline">{unreadCount} unread</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
            <div className="relative xl:col-span-2">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search notifications..." value={filters.search} onChange={(event) => setFilter("search", event.target.value)} />
            </div>
            <Select value={filters.type} onValueChange={(value) => setFilter("type", value)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="reminder">Reminder</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.severity} onValueChange={(value) => setFilter("severity", value)}>
              <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severity</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.is_read} onValueChange={(value) => setFilter("is_read", value)}>
              <SelectTrigger><SelectValue placeholder="Read status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="false">Unread</SelectItem>
                <SelectItem value="true">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.per_page} onValueChange={(value) => setFilter("per_page", value)}>
              <SelectTrigger><SelectValue placeholder="Page size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10/page</SelectItem>
                <SelectItem value="25">25/page</SelectItem>
                <SelectItem value="50">50/page</SelectItem>
                <SelectItem value="100">100/page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No notifications found</p>
              <p className="text-sm text-muted-foreground">Adjust the filters or wait for a new document/system event.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-xl p-4 cursor-pointer transition ${item.is_read ? "bg-card" : "bg-primary/5 border-primary/30 shadow-sm"}`}
                  onClick={() => item.document_id && navigate(`/documents/${item.document_id}`)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-sm truncate">{item.title}</p>
                        <Badge variant="outline" className={severityClass[item.severity] || severityClass.info}>{item.severity || "info"}</Badge>
                        <Badge variant="secondary">{item.type || "system"}</Badge>
                        {!item.is_read && <Badge>Unread</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 break-words">{item.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {item.control_number ? `${item.control_number} • ` : ""}
                        {item.created_date ? format(new Date(item.created_date), "MMM d, yyyy h:mm a") : ""}
                        {item.emailed_at ? " • emailed" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {!item.is_read && (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); markAsRead(item.id); }}>
                          Mark read
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteNotification(item.id); }} aria-label="Delete notification">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 text-sm text-muted-foreground">
            <p>Page {meta.current_page ?? filters.page} of {meta.last_page ?? 1} • {meta.total ?? notifications.length} total</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={(meta.current_page ?? filters.page) <= 1} onClick={() => setFilter("page", Math.max(1, Number(filters.page) - 1))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={(meta.current_page ?? filters.page) >= (meta.last_page ?? 1)} onClick={() => setFilter("page", Number(filters.page) + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
