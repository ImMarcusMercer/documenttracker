import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ProgressTracker from "@/components/documents/ProgressTracker";
import StatusBadge from "@/components/documents/StatusBadge";
import ActionPanel from "@/components/documents/ActionPanel";
import {
  ArrowLeft,
  Send,
  FileText,
  ExternalLink,
  FileUp,
  Clock,
  Building2,
  User,
  DollarSign,
  Hash,
  Tag,
  Shield,
  Trash2,
  ArchiveRestore,
  Printer,
  FileDown,
  Mail,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ActionWarningModal from "@/components/ActionWarningModal";

export default function DocumentDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const docId = window.location.pathname.split("/documents/")[1];
  const [currentUser, setCurrentUser] = useState(null);
  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  const { data: document, isLoading, error: documentError } = useQuery({
    queryKey: ["document", docId],
    queryFn: async () => {
      const docs = await base44.entities.Document.filter({ id: docId });
      return docs[0];
    },
    enabled: !!docId,
  });

  const {
    data: actions = [],
    error: actionsError,
  } = useQuery({
    queryKey: ["document-actions", docId],
    queryFn: () =>
      base44.entities.DocumentAction.filter({ document_id: docId }, "-created_date", 100),
    enabled: !!docId && !!document,
  });

  const { data: linkedDoc } = useQuery({
    queryKey: ["linked-doc", document?.linked_document_id],
    queryFn: async () => {
      if (!document?.linked_document_id) return null;
      const docs = await base44.entities.Document.filter({ id: document.linked_document_id });
      return docs[0];
    },
    enabled: !!document?.linked_document_id,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["document", docId] });
    queryClient.invalidateQueries({ queryKey: ["document-actions", docId] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const archiveDocument = async (password) => {
    setIsDeleting(true);
    try {
      await base44.entities.Document.delete(docId, password);
      toast.warning("Document moved to archive.");
      setDeleteWarningOpen(false);
      navigate("/documents");
    } catch (error) {
      toast.error(error.message || "Document archive failed.");
    } finally {
      setIsDeleting(false);
    }
  };

  const downloadDocumentPdf = async () => {
    try {
      await base44.importExport.exportDocuments({ format: "pdf", id: docId });
      toast.success("Document PDF generated.");
    } catch (error) {
      toast.error(error.message || "Failed to download document PDF.");
    }
  };

  const emailDocumentPdf = async () => {
    try {
      const result = await base44.importExport.emailPdf({ id: docId });
      toast.success(`Document PDF emailed to ${result.recipient || "your email"}.`);
    } catch (error) {
      toast.error(error.message || "Failed to email document PDF.");
    }
  };

  const restoreDocument = async () => {
    setIsRestoring(true);
    try {
      await base44.entities.Document.restore(docId);
      toast.success("Document restored from archive.");
      refresh();
    } catch (error) {
      toast.error(error.message || "Document restore failed.");
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (actionsError?.status === 403) {
    return <DocumentAccessRestricted navigate={navigate} />;
  }

  if (documentError?.status === 403) {
    return <DocumentAccessRestricted navigate={navigate} />;
  }

  if (documentError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertTitle>Unable to load document</AlertTitle>
          <AlertDescription>
            {documentError.message || "Something went wrong while loading this document."}
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" onClick={() => navigate("/documents")}>
            Back to Documents
          </Button>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["document", docId] })}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 text-center">
        <p className="text-xl text-muted-foreground">Document not found</p>
        <Button variant="outline" onClick={() => navigate("/documents")} className="mt-4">
          Back to Documents
        </Button>
      </div>
    );
  }

  // v2.0 visibility rule: all authenticated active users can view document details and attachments.
  // Action buttons remain permission-controlled by the backend and ActionPanel.
  const canOpenFile = document?.can_open_file !== false;

  const actionLogColors = {
    Created: "bg-blue-100 text-blue-700",
    Received: "bg-green-100 text-green-700",
    Forwarded: "bg-amber-100 text-amber-700",
    Returned: "bg-red-100 text-red-700",
    Signed: "bg-purple-100 text-purple-700",
    Released: "bg-teal-100 text-teal-700",
    "Memo Uploaded": "bg-indigo-100 text-indigo-700",
    "Trip Ticket Uploaded": "bg-sky-100 text-sky-700",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Back */}
      <Button variant="ghost" onClick={() => navigate("/documents")} className="text-base gap-2 -ml-2">
        <ArrowLeft className="w-5 h-5" />
        Back to Documents
      </Button>

      {/* Progress Tracker */}
      <Card className="border-2 border-primary/20">
        <CardContent className="p-6">
          <ProgressTracker status={document.status} document={document} />
        </CardContent>
      </Card>

      {/* Document Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                {document.deleted_at && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Archived</Badge>
                )}
                <Badge
                  variant="outline"
                  className="text-base px-3 py-1 font-bold text-primary border-primary"
                >
                  <Hash className="w-4 h-4 mr-1" />
                  {document.control_number}
                </Badge>
                <StatusBadge status={document.status} />
                {document.section && (
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    {document.section}
                  </Badge>
                )}
              </div>
              <CardTitle className="text-2xl mt-2">{document.particulars}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{document.classification}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" onClick={() => window.print()} className="gap-2">
                <Printer className="w-4 h-4" /> Print
              </Button>
              <Button variant="outline" onClick={downloadDocumentPdf} className="gap-2">
                <FileDown className="w-4 h-4" /> PDF
              </Button>
              <Button variant="outline" onClick={emailDocumentPdf} className="gap-2">
                <Mail className="w-4 h-4" /> Email PDF
              </Button>
              {document.can_delete && !document.deleted_at && (
                <Button variant="destructive" onClick={() => setDeleteWarningOpen(true)} className="gap-2">
                  <Trash2 className="w-4 h-4" /> Archive
                </Button>
              )}
              {document.can_restore && document.deleted_at && (
                <Button variant="outline" onClick={restoreDocument} disabled={isRestoring} className="gap-2">
                  <ArchiveRestore className="w-4 h-4" /> Restore
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DetailItem icon={Building2} label="Source Office" value={document.source_office} />
            <DetailItem icon={User} label="Requestor" value={document.requestor} />
            <DetailItem
              icon={DollarSign}
              label="Amount"
              value={
                document.amount
                  ? `₱${document.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                  : null
              }
            />
            <DetailItem
              icon={Clock}
              label="Date Received"
              value={
                document.received_date
                  ? format(new Date(document.received_date), "MMMM d, yyyy")
                  : null
              }
            />
            <DetailItem icon={User} label="Current Holder" value={document.current_holder_name} />
            <DetailItem icon={Send} label="Forwarded To" value={document.forwarded_to} />
            {document.released_date && (
              <DetailItem
                icon={Clock}
                label="Date Released"
                value={format(new Date(document.released_date), "MMMM d, yyyy")}
              />
            )}
          </div>

          {document.remarks && (
            <div className="mt-6 p-4 bg-accent/50 rounded-xl">
              <p className="text-sm font-semibold text-muted-foreground mb-1">Remarks</p>
              <p className="text-base">{document.remarks}</p>
            </div>
          )}

          {document.status === "Returned" && document.return_reason && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
              <p className="text-sm font-semibold text-red-600 mb-1">Reason for Return</p>
              <p className="text-base text-red-800">{document.return_reason}</p>
            </div>
          )}

          {/* File Links */}
          <div className="flex flex-wrap gap-3 mt-6">
            {document.file_url && (
              canOpenFile ? (
                <a href={document.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="h-12 text-base gap-2">
                    <FileText className="w-5 h-5" />
                    View Document
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              ) : (
                <Button variant="outline" className="h-12 text-base gap-2" disabled title="You do not have permission to open this file.">
                  <FileText className="w-5 h-5" />
                  View Document
                </Button>
              )
            )}
            {document.memo_file_url && (
              canOpenFile ? (
                <a href={document.memo_file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="h-12 text-base gap-2">
                    <FileUp className="w-5 h-5" />
                    View Memorandum
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              ) : (
                <Button variant="outline" className="h-12 text-base gap-2" disabled title="You do not have permission to open this file.">
                  <FileUp className="w-5 h-5" />
                  View Memorandum
                </Button>
              )
            )}
            {document.trip_ticket_file_url && (
              canOpenFile ? (
                <a href={document.trip_ticket_file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="h-12 text-base gap-2">
                    <FileUp className="w-5 h-5" />
                    View Trip Ticket
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              ) : (
                <Button variant="outline" className="h-12 text-base gap-2" disabled title="You do not have permission to open this file.">
                  <FileUp className="w-5 h-5" />
                  View Trip Ticket
                </Button>
              )
            )}
            {linkedDoc && (
              <Button
                variant="outline"
                className="h-12 text-base gap-2"
                onClick={() => navigate(`/documents/${linkedDoc.id}`)}
              >
                <FileText className="w-5 h-5" />
                View Linked Doc ({linkedDoc.control_number})
              </Button>
            )}
          </div>

          {document.ocr_status && (
            <div className="mt-6 rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">OCR / Data Extraction</p>
                  <p className="text-base">Status: <span className="font-semibold">{document.ocr_status}</span></p>
                </div>
                <Badge variant="outline">Confidence: {document.ocr_confidence || 0}%</Badge>
              </div>

              {document.extracted_fields && Object.keys(document.extracted_fields).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.entries(document.extracted_fields).map(([key, field]) => (
                    <div key={key} className="rounded-md border bg-background p-2 text-sm">
                      <p className="font-medium capitalize">{key.replaceAll("_", " ")}</p>
                      <p className="text-muted-foreground break-words">{field?.value || "N/A"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Panel — role-aware */}
      {!document.deleted_at && (
        <ActionPanel
          document={document}
          currentUser={currentUser}
          onActionDone={refresh}
        />
      )}

      <ActionWarningModal
        open={deleteWarningOpen}
        title="Archive this document?"
        description="This record will be soft-deleted, moved to the archive, and kept restorable for administrators."
        impactItems={[
          `Document ${document.control_number} will be archived.`,
          "The document file, memorandum, trip ticket, and action history will remain stored.",
          "A warning audit log will record who performed the action and when.",
          "Password re-entry is required before continuing.",
        ]}
        requirePassword
        confirmLabel="Archive Document"
        isWorking={isDeleting}
        onCancel={() => setDeleteWarningOpen(false)}
        onConfirm={archiveDocument}
      />

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No activity recorded yet</p>
          ) : (
            <div className="space-y-4">
              {actions.map((action) => (
                <div key={action.id} className="flex gap-4 items-start">
                  <div
                    className={`px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0 mt-1 ${
                      actionLogColors[action.action_type] || "bg-muted text-muted-foreground"
                    }`}
                  >
                    {action.action_type}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base">
                      {action.new_status ? `→ ${action.new_status}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      By{" "}
                      <span className="font-medium">
                        {action.from_user_name || action.from_user}
                      </span>
                      {action.to_user_name ? (
                        <>
                          {" "}→{" "}
                          <span className="font-medium">{action.to_user_name}</span>
                        </>
                      ) : null}
                    </p>
                    {action.notes && (
                      <p className="text-sm mt-1 text-muted-foreground">{action.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {action.created_date
                        ? format(new Date(action.created_date), "MMM d, yyyy h:mm a")
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-base font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function DocumentAccessRestricted({ navigate }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Access restricted</AlertTitle>
        <AlertDescription>
          You are signed in, but you do not have permission to view this document. If you need access,
          contact the section handling the document or an administrator.
        </AlertDescription>
      </Alert>
      <div className="mt-4 flex gap-3">
        <Button variant="outline" onClick={() => navigate("/documents")}>
          Back to Documents
        </Button>
        <Button onClick={() => navigate("/")}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
