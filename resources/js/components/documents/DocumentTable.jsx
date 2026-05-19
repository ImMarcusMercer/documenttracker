import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import StatusBadge from "./StatusBadge";
import { format } from "date-fns";
import { Archive, FileText, ArrowUpDown } from "lucide-react";

const defaultColumns = {
  control_number: true,
  received_date: true,
  particulars: true,
  source_office: true,
  amount: true,
  status: true,
  current_holder: true,
};

const columnLabels = {
  control_number: "CONTROL NO.",
  received_date: "DATE",
  particulars: "PARTICULARS",
  source_office: "OFFICE",
  amount: "AMOUNT",
  status: "STATUS",
  current_holder: "HOLDER",
};

export default function DocumentTable({
  documents,
  isLoading,
  visibleColumns = defaultColumns,
  selectedIds = [],
  onSelect,
  onSelectAll,
  onSort,
  sortBy,
  sortDir,
}) {
  const navigate = useNavigate();
  const selectedSet = new Set(selectedIds.map(String));
  const selectionEnabled = Boolean(onSelect);
  const selectableDocuments = documents?.filter((doc) => doc.can_delete || doc.can_restore) || [];
  const allVisibleSelected = selectableDocuments.length > 0 && selectableDocuments.every((doc) => selectedSet.has(String(doc.id)));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" aria-live="polite">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <FileText className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">No documents found</p>
        <p className="text-sm">Change your filters or create a new document.</p>
      </div>
    );
  }

  const openDocument = (event, id) => {
    if (event.target.closest("input,button,a")) return;
    navigate(`/documents/${id}`);
  };

  const SortableHead = ({ column, children }) => (
    <TableHead className="font-bold text-sm text-foreground">
      <button
        type="button"
        onClick={() => onSort?.(column)}
        className="inline-flex items-center gap-1 hover:text-primary"
        aria-label={`Sort by ${children}`}
      >
        {children}
        <ArrowUpDown className={`h-3.5 w-3.5 ${sortBy === column ? "text-primary" : "text-muted-foreground"}`} />
        {sortBy === column && <span className="sr-only">{sortDir === "asc" ? "ascending" : "descending"}</span>}
      </button>
    </TableHead>
  );

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-primary/5 hover:bg-primary/5">
            {selectionEnabled && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => onSelectAll?.(event.target.checked, documents)}
                  aria-label="Select all visible documents"
                />
              </TableHead>
            )}
            {visibleColumns.control_number && <SortableHead column="control_number">{columnLabels.control_number}</SortableHead>}
            {visibleColumns.received_date && <SortableHead column="received_date">{columnLabels.received_date}</SortableHead>}
            {visibleColumns.particulars && <SortableHead column="particulars">{columnLabels.particulars}</SortableHead>}
            {visibleColumns.source_office && <SortableHead column="source_office">{columnLabels.source_office}</SortableHead>}
            {visibleColumns.amount && <SortableHead column="amount">{columnLabels.amount}</SortableHead>}
            {visibleColumns.status && <SortableHead column="status">{columnLabels.status}</SortableHead>}
            {visibleColumns.current_holder && <SortableHead column="current_holder">{columnLabels.current_holder}</SortableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow
              key={doc.id}
              className="cursor-pointer hover:bg-accent transition-colors text-base"
              onClick={(event) => openDocument(event, doc.id)}
            >
              {selectionEnabled && (
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(String(doc.id))}
                    disabled={!doc.can_delete && !doc.can_restore}
                    onChange={(event) => onSelect?.(String(doc.id), event.target.checked)}
                    aria-label={`Select document ${doc.control_number}`}
                  />
                </TableCell>
              )}
              {visibleColumns.control_number && (
                <TableCell className="font-semibold text-primary">
                  <div className="flex items-center gap-2">
                    <span>{doc.control_number}</span>
                    {doc.deleted_at && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        <Archive className="h-3 w-3" /> Archived
                      </span>
                    )}
                  </div>
                </TableCell>
              )}
              {visibleColumns.received_date && (
                <TableCell>{doc.received_date ? format(new Date(doc.received_date), "MM/dd/yyyy") : "—"}</TableCell>
              )}
              {visibleColumns.particulars && (
                <TableCell className="max-w-[300px]">
                  <p className="truncate font-medium">{doc.particulars}</p>
                  <p className="text-xs text-muted-foreground">{doc.classification}</p>
                </TableCell>
              )}
              {visibleColumns.source_office && <TableCell>{doc.source_office || "—"}</TableCell>}
              {visibleColumns.amount && (
                <TableCell>{doc.amount ? `₱${Number(doc.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—"}</TableCell>
              )}
              {visibleColumns.status && (
                <TableCell><StatusBadge status={doc.status} /></TableCell>
              )}
              {visibleColumns.current_holder && <TableCell className="text-sm">{doc.current_holder_name || "—"}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
