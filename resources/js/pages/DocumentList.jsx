import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DocumentTable from "@/components/documents/DocumentTable";
import { Search, FilePlus, Filter, FileDown, Trash2, Columns3, ArchiveRestore, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ActionWarningModal from "@/components/ActionWarningModal";

const defaultColumns = {
  control_number: true,
  received_date: true,
  particulars: true,
  source_office: true,
  amount: true,
  status: true,
  current_holder: true,
};

const statusOptions = [
  "Pending Receipt",
  "Forwarded",
  "Received",
  "For Signature",
  "Signed",
  "For Release",
  "Released",
  "Returned",
];

export default function DocumentList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const urlParams = new URLSearchParams(window.location.search);
  const [searchTerm, setSearchTerm] = useState("");
  const [columnSearch, setColumnSearch] = useState({ control_number: "", source_office: "", requestor: "" });
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "all");
  const [classFilter, setClassFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_date");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedIds, setSelectedIds] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [isBulkStatusUpdating, setIsBulkStatusUpdating] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      return { ...defaultColumns, ...(JSON.parse(localStorage.getItem("docutracker.document.columns") || "{}")) };
    } catch {
      return defaultColumns;
    }
  });

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    localStorage.setItem("docutracker.document.columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const userRole = currentUser?.role?.toUpperCase();
  const isAdmin = userRole === "ADMIN";
  const canCreateDocument = userRole === "RECEIVING";

  const query = useMemo(() => ({
    search: searchTerm,
    control_number: columnSearch.control_number,
    source_office: columnSearch.source_office,
    requestor: columnSearch.requestor,
    status: statusFilter === "all" ? "" : statusFilter,
    classification: classFilter === "all" ? "" : classFilter,
    date_from: dateFrom,
    date_to: dateTo,
    with_deleted: includeArchived ? 1 : "",
    page,
    per_page: pageSize,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [searchTerm, columnSearch, statusFilter, classFilter, dateFrom, dateTo, includeArchived, page, pageSize, sortBy, sortDir]);

  const { data: pageData = { data: [], meta: {} }, isLoading, refetch } = useQuery({
    queryKey: ["documents-page", query],
    queryFn: () => base44.entities.Document.listPage(query),
  });

  const documents = pageData.data || [];
  const meta = pageData.meta || {};
  const totalPages = Number(meta.last_page || 1);

  const selectedSet = new Set(selectedIds.map(String));
  const selectedDocuments = documents.filter((doc) => selectedSet.has(String(doc.id)));
  const selectedDeletable = selectedDocuments.filter((doc) => doc.can_delete && !doc.deleted_at);
  const selectedRestorable = selectedDocuments.filter((doc) => doc.can_restore && doc.deleted_at);

  useEffect(() => {
    setSelectedIds([]);
  }, [searchTerm, columnSearch, statusFilter, classFilter, dateFrom, dateTo, includeArchived, page, pageSize, sortBy, sortDir]);

  const setFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const updateColumnSearch = (key, value) => {
    setColumnSearch((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleSelect = (id, checked) => {
    setSelectedIds((current) => checked ? [...new Set([...current, String(id)])] : current.filter((value) => value !== String(id)));
  };

  const handleSelectAll = (checked, docs) => {
    const ids = docs.filter((doc) => doc.can_delete || doc.can_restore).map((doc) => String(doc.id));
    setSelectedIds((current) => checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)));
  };

  const confirmBulkDelete = async (password) => {
    setIsBulkDeleting(true);
    try {
      const result = await base44.entities.Document.bulkDelete(selectedDeletable.map((doc) => doc.id), password);
      toast.warning(`Archived ${result.deleted_count || 0} document(s). ${result.skipped_count || 0} skipped.`);
      setSelectedIds([]);
      setWarningOpen(false);
      queryClient.invalidateQueries({ queryKey: ["documents-page"] });
    } catch (error) {
      toast.error(error.message || "Bulk archive failed.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const bulkRestore = async () => {
    setIsRestoring(true);
    try {
      await Promise.all(selectedRestorable.map((doc) => base44.entities.Document.restore(doc.id)));
      toast.success(`Restored ${selectedRestorable.length} document(s) from archive.`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["documents-page"] });
    } catch (error) {
      toast.error(error.message || "Bulk restore failed.");
    } finally {
      setIsRestoring(false);
    }
  };

  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedIds.length === 0) return;
    setIsBulkStatusUpdating(true);
    try {
      const result = await base44.entities.Document.bulkStatus(selectedIds, bulkStatus);
      toast.success(`Updated ${result.updated_count || 0} document(s). ${result.skipped_count || 0} skipped.`);
      setBulkStatus("");
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["documents-page"] });
    } catch (error) {
      toast.error(error.message || "Bulk status update failed.");
    } finally {
      setIsBulkStatusUpdating(false);
    }
  };

  const exportCurrentView = (format = "csv") => {
    base44.importExport.exportDocuments({ ...query, page: "", per_page: "", format });
  };

  const resetFilters = () => {
    setSearchTerm("");
    setColumnSearch({ control_number: "", source_office: "", requestor: "" });
    setStatusFilter("all");
    setClassFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">All Documents</h1>
          <p className="text-sm text-muted-foreground">Search, filter, sort, export, archive, and update document records.</p>
        </div>
        {canCreateDocument && (
          <Button onClick={() => navigate("/documents/new")} size="lg" className="h-12 px-6 text-base font-semibold bg-primary hover:bg-primary/90">
            <FilePlus className="w-5 h-5 mr-2" /> New Document
          </Button>
        )}
      </div>

      <div className="space-y-3 bg-card p-4 rounded-xl border">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold text-base">Data Controls</span>
          </div>
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={(e) => setFilter(setSearchTerm)(e.target.value)} placeholder="Global search..." className="pl-10 h-11" />
          </div>
          <Select value={statusFilter} onValueChange={setFilter(setStatusFilter)}>
            <SelectTrigger className="w-[180px] h-11"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Status</SelectItem>{statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={setFilter(setClassFilter)}>
            <SelectTrigger className="w-[200px] h-11"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Commu Letter">Commu Letter</SelectItem>
              <SelectItem value="Purchase Request">Purchase Request</SelectItem>
              <SelectItem value="Request Letter">Request Letter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pageSize} onValueChange={setFilter(setPageSize)}>
            <SelectTrigger className="w-[140px] h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} rows</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" className="h-11 gap-2" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /> Refresh</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Input value={columnSearch.control_number} onChange={(e) => updateColumnSearch("control_number", e.target.value)} placeholder="Column: Control no." />
          <Input value={columnSearch.source_office} onChange={(e) => updateColumnSearch("source_office", e.target.value)} placeholder="Column: Source office" />
          <Input value={columnSearch.requestor} onChange={(e) => updateColumnSearch("requestor", e.target.value)} placeholder="Column: Requestor" />
          <Input type="date" value={dateFrom} onChange={(e) => setFilter(setDateFrom)(e.target.value)} aria-label="Date from" />
          <Input type="date" value={dateTo} onChange={(e) => setFilter(setDateTo)(e.target.value)} aria-label="Date to" />
        </div>

        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => exportCurrentView("csv")}><FileDown className="w-4 h-4" /> CSV</Button>
            <Button variant="outline" className="gap-2" onClick={() => exportCurrentView("excel")}><FileDown className="w-4 h-4" /> Excel</Button>
            <Button variant="outline" className="gap-2" onClick={() => exportCurrentView("pdf")}><FileDown className="w-4 h-4" /> PDF</Button>
            <Button variant="ghost" onClick={resetFilters}>Reset Filters</Button>
          </div>
          {isAdmin && (
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); setSelectedIds([]); setPage(1); }} /> Show archive
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between bg-card p-4 rounded-xl border">
        <div className="flex items-center gap-2 flex-wrap">
          <Columns3 className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold">Columns:</span>
          {Object.keys(defaultColumns).map((key) => (
            <label key={key} className="flex items-center gap-1 text-sm rounded-md border px-2 py-1 capitalize">
              <input type="checkbox" checked={visibleColumns[key]} onChange={() => setVisibleColumns((current) => ({ ...current, [key]: !current[key] }))} />
              {key.replaceAll("_", " ")}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
          <Select value={bulkStatus || "none"} onValueChange={(value) => setBulkStatus(value === "none" ? "" : value)}>
            <SelectTrigger className="w-48 h-10"><SelectValue placeholder="Bulk status" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Bulk status...</SelectItem>{statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" disabled={!bulkStatus || selectedIds.length === 0 || isBulkStatusUpdating} onClick={applyBulkStatus}>Update Status</Button>
          <Button variant="outline" disabled={selectedDeletable.length === 0} onClick={() => setWarningOpen(true)} className="gap-2"><Trash2 className="w-4 h-4" /> Archive</Button>
          {isAdmin && <Button variant="outline" disabled={selectedRestorable.length === 0 || isRestoring} onClick={bulkRestore} className="gap-2"><ArchiveRestore className="w-4 h-4" /> Restore</Button>}
        </div>
      </div>

      <p className="text-muted-foreground text-base">
        Showing <span className="font-semibold text-foreground">{documents.length}</span> of <span className="font-semibold text-foreground">{meta.total || 0}</span> documents. Page <span className="font-semibold text-foreground">{meta.current_page || page}</span> of <span className="font-semibold text-foreground">{totalPages}</span>.
      </p>

      <DocumentTable
        documents={documents}
        isLoading={isLoading}
        visibleColumns={visibleColumns}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onSort={handleSort}
        sortBy={sortBy}
        sortDir={sortDir}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap border rounded-xl p-3 bg-card">
        <p className="text-sm text-muted-foreground">Records {meta.from || 0} to {meta.to || 0} of {meta.total || 0}</p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>

      <ActionWarningModal
        open={warningOpen}
        title="Archive selected documents?"
        description="This is a soft delete. The selected records will move to the archive and can be restored by an administrator."
        impactItems={[
          `${selectedDeletable.length} document(s) will be archived.`,
          "Attached files and tracking history will remain stored.",
          "A warning audit log will record the bulk operation and password confirmation.",
          "Archived documents are hidden from normal views unless the archive filter is enabled.",
        ]}
        requirePassword
        confirmLabel="Archive Documents"
        isWorking={isBulkDeleting}
        onCancel={() => setWarningOpen(false)}
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
