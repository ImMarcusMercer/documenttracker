import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Clock, HelpCircle, LifeBuoy, Loader2, MessageSquarePlus, RefreshCw, Send, ShieldCheck, Ticket, UserRoundCheck } from "lucide-react";

const categories = [
  { value: "account", label: "Account / Login" },
  { value: "document", label: "Document Issue" },
  { value: "workflow", label: "Workflow / Routing" },
  { value: "technical", label: "Technical Error" },
  { value: "security", label: "Security Concern" },
  { value: "other", label: "Other" },
];

const priorities = ["low", "normal", "high", "urgent"];
const statuses = ["open", "in_progress", "pending_user", "resolved", "closed", "archived"];

const priorityClass = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  normal: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const statusClass = {
  open: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  pending_user: "bg-purple-50 text-purple-700 border-purple-200",
  resolved: "bg-green-50 text-green-700 border-green-200",
  closed: "bg-slate-100 text-slate-700 border-slate-200",
  archived: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const titleCase = (value = "") => value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());

export default function HelpDesk() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = (user?.role || "").toUpperCase();
  const isAgent = ["ADMIN", "HELPDESK", "HELP_DESK", "DEVELOPER"].includes(role);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("10");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [form, setForm] = useState({ subject: "", description: "", category: "technical", priority: "normal" });
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const query = {
    search,
    status: status === "all" ? "" : status,
    priority: priority === "all" ? "" : priority,
    category: category === "all" ? "" : category,
    page,
    per_page: perPage,
    sort_by: sortBy,
    sort_dir: sortDir,
  };

  const { data: stats } = useQuery({
    queryKey: ["helpdesk-stats"],
    queryFn: () => base44.helpdesk.stats(),
    refetchInterval: 20000,
  });

  const { data: ticketPage = { data: [], meta: {} }, isLoading, refetch } = useQuery({
    queryKey: ["helpdesk-tickets", query],
    queryFn: () => base44.helpdesk.list(query),
    refetchInterval: isAgent ? 15000 : 30000,
  });

  const { data: selectedTicket, isFetching: isFetchingTicket, refetch: refetchSelected } = useQuery({
    queryKey: ["helpdesk-ticket", selectedTicketId],
    queryFn: () => base44.helpdesk.get(selectedTicketId),
    enabled: !!selectedTicketId,
  });

  const tickets = ticketPage.data || [];
  const meta = ticketPage.meta || {};

  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [tickets, selectedTicketId]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["helpdesk-tickets"] }),
      queryClient.invalidateQueries({ queryKey: ["helpdesk-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["helpdesk-ticket"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const createTicket = async (event) => {
    event.preventDefault();
    if (form.subject.trim().length < 5 || form.description.trim().length < 10) {
      toast.warning("Please provide a clear subject and description before submitting.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await base44.helpdesk.create(form);
      toast.success(`Ticket ${created.ticket_number} submitted. Help Desk users were notified.`);
      setForm({ subject: "", description: "", category: "technical", priority: "normal" });
      setSelectedTicketId(created.id);
      await refreshAll();
    } catch (error) {
      toast.error(error.message || "Failed to submit Help Desk ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReply = async () => {
    if (!selectedTicketId || reply.trim().length < 2) return;
    setIsSubmitting(true);
    try {
      const updated = await base44.helpdesk.reply(selectedTicketId, { message: reply, is_internal_note: internalNote });
      toast.success(internalNote ? "Internal note saved." : "Ticket reply submitted and relevant users were notified.");
      setReply("");
      setInternalNote(false);
      setSelectedTicketId(updated.id);
      await refreshAll();
      await refetchSelected();
    } catch (error) {
      toast.error(error.message || "Failed to submit reply.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateTicket = async (patch) => {
    if (!selectedTicketId) return;
    setIsSubmitting(true);
    try {
      const updated = await base44.helpdesk.update(selectedTicketId, patch);
      toast.success(`Ticket ${updated.ticket_number} updated.`);
      await refreshAll();
      await refetchSelected();
    } catch (error) {
      toast.error(error.message || "Failed to update ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const archiveTicket = async () => {
    if (!selectedTicketId || !window.confirm("Archive this Help Desk ticket? It will be hidden from normal active ticket lists.")) return;
    setIsSubmitting(true);
    try {
      const result = await base44.helpdesk.archive(selectedTicketId);
      toast.warning(`Ticket ${result.ticket_number} archived.`);
      setSelectedTicketId(null);
      await refreshAll();
    } catch (error) {
      toast.error(error.message || "Failed to archive ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryLabel = useMemo(() => Object.fromEntries(categories.map((item) => [item.value, item.label])), []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground mb-3">
            <LifeBuoy className="w-3.5 h-3.5" />
            Ticket-based Help Desk, not live chat
          </div>
          <h1 className="text-3xl font-bold">{isAgent ? "Help Desk Console" : "Need Help?"}</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Submit support tickets for account access, document routing, workflow questions, technical errors, or security concerns. Help Desk users receive notifications and respond through the ticket thread.
          </p>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Ticket} label="Total Tickets" value={stats?.total || 0} />
        <MetricCard icon={Clock} label="Open / Pending" value={stats?.open || 0} />
        <MetricCard icon={ShieldCheck} label="Urgent" value={stats?.urgent || 0} />
        <MetricCard icon={CheckCircle2} label="Resolved / Closed" value={stats?.resolved || 0} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MessageSquarePlus className="w-5 h-5" /> Submit a Ticket</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createTicket} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ticket-subject">Subject <span className="text-destructive">*</span></Label>
                  <Input id="ticket-subject" value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} placeholder="Example: Cannot access document details" required minLength={5} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {priorities.map((item) => <SelectItem key={item} value={item}>{titleCase(item)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ticket-description">Issue Details <span className="text-destructive">*</span></Label>
                  <Textarea id="ticket-description" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="Describe what happened, what page you were using, and what you expected." className="min-h-36" required minLength={10} />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Ticket
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><HelpCircle className="w-5 h-5" /> {isAgent ? "Ticket Queue" : "My Tickets"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search ticket, subject, details" className="md:col-span-2" />
                <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statuses.map((item) => <SelectItem key={item} value={item}>{titleCase(item)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={priority} onValueChange={(value) => { setPriority(value); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    {priorities.map((item) => <SelectItem key={item} value={item}>{titleCase(item)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={perPage} onValueChange={(value) => { setPerPage(value); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((item) => <SelectItem key={item} value={String(item)}>{item} / page</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-xl border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Ticket" field="ticket_number" sortBy={sortBy} sortDir={sortDir} setSortBy={setSortBy} setSortDir={setSortDir} />
                      <SortableHead label="Subject" field="subject" sortBy={sortBy} sortDir={sortDir} setSortBy={setSortBy} setSortDir={setSortDir} />
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      {isAgent && <TableHead>Requester</TableHead>}
                      <SortableHead label="Created" field="created_at" sortBy={sortBy} sortDir={sortDir} setSortBy={setSortBy} setSortDir={setSortDir} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={isAgent ? 6 : 5} className="py-8 text-center text-muted-foreground">Loading tickets...</TableCell></TableRow>
                    ) : tickets.length === 0 ? (
                      <TableRow><TableCell colSpan={isAgent ? 6 : 5} className="py-8 text-center text-muted-foreground">No tickets match the current filters.</TableCell></TableRow>
                    ) : tickets.map((ticket) => (
                      <TableRow key={ticket.id} className={`cursor-pointer ${selectedTicketId === ticket.id ? "bg-muted/60" : ""}`} onClick={() => setSelectedTicketId(ticket.id)}>
                        <TableCell className="font-mono text-xs">{ticket.ticket_number}</TableCell>
                        <TableCell>
                          <div className="font-medium line-clamp-1">{ticket.subject}</div>
                          <div className="text-xs text-muted-foreground">{categoryLabel[ticket.category] || titleCase(ticket.category)} · {ticket.messages_count || 0} message(s)</div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className={statusClass[ticket.status]}>{titleCase(ticket.status)}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className={priorityClass[ticket.priority]}>{titleCase(ticket.priority)}</Badge></TableCell>
                        {isAgent && <TableCell className="text-sm">{ticket.requester?.name || "Unknown"}</TableCell>}
                        <TableCell className="text-xs text-muted-foreground">{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>Page {meta.current_page || 1} of {meta.last_page || 1} · {meta.total || 0} ticket(s)</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={(meta.current_page || 1) <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
                  <Button type="button" variant="outline" size="sm" disabled={(meta.current_page || 1) >= (meta.last_page || 1)} onClick={() => setPage((current) => current + 1)}>Next</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <TicketDetail
            ticket={selectedTicket}
            isLoading={isFetchingTicket}
            isAgent={isAgent}
            isSubmitting={isSubmitting}
            reply={reply}
            setReply={setReply}
            internalNote={internalNote}
            setInternalNote={setInternalNote}
            submitReply={submitReply}
            updateTicket={updateTicket}
            archiveTicket={archiveTicket}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-5 h-5" /></div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableHead({ label, field, sortBy, sortDir, setSortBy, setSortDir }) {
  const active = sortBy === field;
  return (
    <TableHead>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold hover:text-primary"
        onClick={() => {
          if (active) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else {
            setSortBy(field);
            setSortDir("asc");
          }
        }}
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
    </TableHead>
  );
}

function TicketDetail({ ticket, isLoading, isAgent, isSubmitting, reply, setReply, internalNote, setInternalNote, submitReply, updateTicket, archiveTicket }) {
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("technical");
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status || "open");
      setPriority(ticket.priority || "normal");
      setCategory(ticket.category || "technical");
      setResolution(ticket.resolution || "");
    }
  }, [ticket?.id]);

  if (!ticket && !isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <LifeBuoy className="w-10 h-10 mx-auto mb-3 opacity-60" />
          Select a ticket to view the details and replies.
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !ticket) {
    return <Card><CardContent className="p-8 text-muted-foreground">Loading ticket details...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Ticket className="w-5 h-5" /> {ticket.ticket_number}</CardTitle>
            <p className="text-lg font-semibold mt-2">{ticket.subject}</p>
            <p className="text-sm text-muted-foreground mt-1">Created by {ticket.requester?.name || "Unknown"} · {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : "—"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={statusClass[ticket.status]}>{titleCase(ticket.status)}</Badge>
            <Badge variant="outline" className={priorityClass[ticket.priority]}>{titleCase(ticket.priority)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isAgent && (
          <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold"><UserRoundCheck className="w-4 h-4" /> Help Desk Controls</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((item) => <SelectItem key={item} value={item}>{titleCase(item)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{priorities.map((item) => <SelectItem key={item} value={item}>{titleCase(item)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" disabled={isSubmitting} onClick={() => updateTicket({ status, priority, category, resolution })}>Save Changes</Button>
            </div>
            <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Resolution notes shown when the ticket is resolved/closed." className="min-h-20" />
            <div className="flex justify-end">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={archiveTicket}>Archive Ticket</Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold">Ticket Thread</h3>
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {(ticket.messages || []).map((message) => (
              <div key={message.id} className={`rounded-xl border p-4 ${message.is_internal_note ? "bg-amber-50 border-amber-200" : "bg-card"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="font-medium">{message.user?.name || "System"} <span className="text-xs text-muted-foreground">({message.user?.role || "N/A"})</span></div>
                  <div className="flex items-center gap-2">
                    {message.is_internal_note && <Badge variant="outline" className="border-amber-300 text-amber-800">Internal Note</Badge>}
                    <span className="text-xs text-muted-foreground">{message.created_at ? new Date(message.created_at).toLocaleString() : "—"}</span>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.message}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-4 space-y-3">
          <Label htmlFor="ticket-reply">Add ticket reply</Label>
          <Textarea id="ticket-reply" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write an update. This is saved to the ticket thread and not sent as instant chat." className="min-h-28" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isAgent ? (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} />
                Internal note only
              </label>
            ) : <span className="text-sm text-muted-foreground">Help Desk users will be notified after you reply.</span>}
            <Button type="button" className="gap-2" disabled={isSubmitting || reply.trim().length < 2} onClick={submitReply}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit Reply
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
