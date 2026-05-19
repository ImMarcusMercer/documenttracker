import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckSquare,
  Send,
  FileUp,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

// Action descriptions per step
const ACTION_DESCRIPTIONS = {
  mark_received: "Confirm you have physically received this document.",
  forward: "Select who to forward this document to next.",
  return: "Describe why you are returning this document.",
  sign: "Confirm you have reviewed and signed this document.",
  release: "Confirm you are releasing this document.",
  upload_memo: "Upload or update the memorandum linked to this communication letter.",
  upload_trip_ticket: "Upload or update the trip ticket linked to this request letter.",
};

export default function ActionPanel({ document, currentUser, onActionDone }) {
  const [activeAction, setActiveAction] = useState(null); // null | 'mark_received' | 'forward' | 'return' | 'sign' | 'release' | 'upload_memo' | 'upload_trip_ticket'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [forwardNotes, setForwardNotes] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [memoFile, setMemoFile] = useState(null);
  const [tripTicketFile, setTripTicketFile] = useState(null);

  const userRole = currentUser?.role?.toUpperCase();
  const userSection = currentUser?.section?.toUpperCase();
  const docSection = document?.section?.toUpperCase();
  const isHolder = document.current_holder === currentUser?.email;
  const isCommuLetter = document.classification === "Commu Letter";
  const isRequestLetter = document.classification === "Request Letter";
  const isAdmin = userRole === "ADMIN";
  const canActInSection = canRoleHandleSection(userRole, userSection, docSection);
  const isMobilizationClassificationMismatch = userRole === "MOBILIZATION" && !isRequestLetter;

  // Load users to forward to
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => base44.entities.User.list(),
    enabled: activeAction === "forward",
  });

  const forwardableUsers = getForwardableUsers(allUsers, currentUser, document);

  // Determine available actions
  const availableActions = getAvailableActions(document, userRole, isHolder, isCommuLetter);

  if (isAdmin) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card p-6">
        <p className="text-muted-foreground text-base font-medium">
          Admin accounts cannot take actions on documents. You can view and audit all records.
        </p>
      </div>
    );
  }

  if (!canActInSection) {
    return (
      <div className="rounded-2xl border-2 border-border bg-muted/40 p-6">
        <p className="text-muted-foreground text-base font-medium">
          Your role is scoped to <span className="font-bold text-foreground">{userSection || "your section"}</span>. 
          You cannot take actions on <span className="font-bold text-foreground">{docSection || "this"}</span> documents.
        </p>
      </div>
    );
  }

  if (isMobilizationClassificationMismatch) {
    return (
      <div className="rounded-2xl border-2 border-border bg-muted/40 p-6">
        <p className="text-muted-foreground text-base font-medium">
          Mobilization handles <span className="font-bold text-foreground">Request Letter</span> documents only.
        </p>
      </div>
    );
  }

  if (!isHolder) {
    return (
      <div className="rounded-2xl border-2 border-border bg-muted/40 p-6">
        <p className="text-muted-foreground text-base font-medium">
          This document is currently held by <span className="font-bold text-foreground">{document.current_holder_name || "someone else"}</span>. 
          Only they can take action on it.
        </p>
      </div>
    );
  }

  if (availableActions.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-border bg-muted/40 p-6">
        <p className="text-muted-foreground text-base">No actions available for this document's current status.</p>
      </div>
    );
  }

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      if (activeAction === "mark_received") {
        await doMarkReceived();
      } else if (activeAction === "forward") {
        await doForward();
      } else if (activeAction === "return") {
        await doReturn();
      } else if (activeAction === "sign") {
        await doSign();
      } else if (activeAction === "release") {
        await doRelease();
      } else if (activeAction === "upload_memo") {
        await doUploadMemo();
      } else if (activeAction === "upload_trip_ticket") {
        await doUploadTripTicket();
      }
      setActiveAction(null);
      setReturnReason("");
      setForwardNotes("");
      setSelectedUser("");
      setMemoFile(null);
      setTripTicketFile(null);
      if (onActionDone) onActionDone();
      toast.success("Action completed successfully.");
    } catch (error) {
      toast.error(error.message || "Failed to complete action.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const doMarkReceived = async () => {
    await base44.entities.Document.update(document.id, {
      physical_received: true,
      status: "Received",
    });
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Received",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: "Document physically received and confirmed.",
      new_status: "Received",
    });
    await notifyPreviousSenderStatusChange("Received");
  };

  const doForward = async () => {
    const toUser = allUsers.find((u) => u.id === selectedUser);
    if (!toUser) return;
    const newStatus = getForwardStatus(userRole, document, toUser);
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Forwarded",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      to_user: toUser.email,
      to_user_name: toUser.full_name,
      notes: forwardNotes || `Forwarded to ${toUser.full_name}`,
      new_status: newStatus,
    });
    await base44.entities.Document.update(document.id, {
      status: newStatus,
      current_holder: toUser.email,
      current_holder_name: toUser.full_name,
      current_holder_role: toUser.role?.toUpperCase(),
      forwarded_to: toUser.full_name,
      physical_received: false, // reset for next holder
    });
    await createNotification({
      recipientEmail: toUser.email,
      recipientName: toUser.full_name,
      document,
      type: "FORWARDED",
      title: "Document forwarded to you",
      message: `${document.control_number || "Document"} was forwarded by ${currentUser.full_name}.`,
    });
  };

  const doReturn = async () => {
    const users = await base44.entities.User.list();
    const latestSender = await findLatestSenderForCurrentHolder();
    const receivingUser = users.find((u) => u.role?.toUpperCase() === "RECEIVING");
    const targetUser = users.find((u) => u.email === latestSender?.email) || receivingUser;

    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Returned",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      to_user: targetUser?.email || latestSender?.email,
      to_user_name: targetUser?.full_name || latestSender?.name,
      notes: returnReason,
      new_status: "Returned",
    });
    await base44.entities.Document.update(document.id, {
      status: "Returned",
      return_reason: returnReason,
      current_holder: targetUser?.email || document.current_holder,
      current_holder_name: targetUser?.full_name || latestSender?.name || document.current_holder_name,
      current_holder_role: targetUser?.role?.toUpperCase() || document.current_holder_role,
      forwarded_to: targetUser?.full_name || latestSender?.name || document.forwarded_to,
      physical_received: false,
    });
    await createNotification({
      recipientEmail: targetUser?.email || latestSender?.email,
      recipientName: targetUser?.full_name || latestSender?.name,
      document,
      type: "RETURNED",
      title: "Document returned",
      message: `${document.control_number || "Document"} was returned by ${currentUser.full_name}: ${returnReason}`,
    });
  };

  const doSign = async () => {
    await base44.entities.Document.update(document.id, {
      status: "Signed",
      physical_received: true,
    });
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Signed",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: `Document reviewed and signed by ${currentUser.full_name}.`,
      new_status: "Signed",
    });
    await notifyPreviousSenderStatusChange("Signed");
  };

  const doRelease = async () => {
    await base44.entities.Document.update(document.id, {
      status: "Released",
      released_date: new Date().toISOString().split("T")[0],
    });
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Released",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: `Document officially released by ${currentUser.full_name}.`,
      new_status: "Released",
    });
    await notifyPreviousSenderStatusChange("Released");
  };

  const doUploadMemo = async () => {
    let filePatch = {};
    if (memoFile) {
      const result = await base44.integrations.Core.UploadFile({ file: memoFile, category: "memorandums" });
      filePatch = {
        memo_file_url: result.file_url,
        memo_file_path: result.file_path,
        memo_file_name: result.file_name,
        memo_file_mime: result.file_mime,
        memo_file_size: result.file_size,
      };
    }
    await base44.entities.Document.update(document.id, {
      ...filePatch,
    });
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Memo Uploaded",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: "Memorandum uploaded and linked to communication letter.",
      new_status: document.status,
    });
  };

  const doUploadTripTicket = async () => {
    let filePatch = {};
    if (tripTicketFile) {
      const result = await base44.integrations.Core.UploadFile({ file: tripTicketFile, category: "trip-tickets" });
      filePatch = {
        trip_ticket_file_url: result.file_url,
        trip_ticket_file_path: result.file_path,
        trip_ticket_file_name: result.file_name,
        trip_ticket_file_mime: result.file_mime,
        trip_ticket_file_size: result.file_size,
      };
    }

    await base44.entities.Document.update(document.id, {
      ...filePatch,
    });

    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Trip Ticket Uploaded",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: "Trip ticket uploaded and linked to request letter.",
      new_status: document.status,
    });
  };

  const notifyPreviousSenderStatusChange = async (newStatus) => {
    const sender = await findLatestSenderForCurrentHolder();
    if (!sender?.email || sender.email === currentUser.email) return;

    await createNotification({
      recipientEmail: sender.email,
      recipientName: sender.name,
      document,
      type: "STATUS_CHANGED",
      title: `Document status changed to ${newStatus}`,
      message: `${document.control_number || "Document"} is now ${newStatus} by ${currentUser.full_name}.`,
    });
  };

  const findLatestSenderForCurrentHolder = async () => {
    const log = await base44.entities.DocumentAction.filter({ document_id: document.id }, "-created_date", 200);
    const latestForwardToMe = log.find(
      (action) => action.action_type === "Forwarded" && action.to_user === currentUser.email
    );

    if (!latestForwardToMe) return null;

    return {
      email: latestForwardToMe.from_user,
      name: latestForwardToMe.from_user_name,
    };
  };

  const createNotification = async ({ recipientEmail, recipientName, document, type, title, message }) => {
    if (!recipientEmail) return;

    await base44.entities.Notification.create({
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      document_id: document.id,
      control_number: document.control_number,
      type,
      title,
      message,
      is_read: false,
    });
  };

  const canConfirm = () => {
    if (activeAction === "return") return returnReason.trim().length > 0;
    if (activeAction === "forward") return !!selectedUser;
    if (activeAction === "upload_memo") return !!memoFile || !!document.memo_file_url;
    if (activeAction === "upload_trip_ticket") return !!tripTicketFile || !!document.trip_ticket_file_url;
    return true;
  };

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-red-50/40 p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <ChevronRight className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-primary">Actions Available for You</h3>
      </div>

      {/* Action Buttons (no active action) */}
      {!activeAction && (
        <div className="flex flex-wrap gap-3">
          {availableActions.map((action) => (
            <ActionButton key={action.key} action={action} onClick={() => setActiveAction(action.key)} />
          ))}
        </div>
      )}

      {/* Confirmation Panel */}
      {activeAction && (
        <div className="space-y-4">
          {/* Action title */}
          <p className="text-lg font-bold flex items-center gap-2">
            {getActionIcon(activeAction)}
            {getActionLabel(activeAction)}
          </p>

          {/* Instruction box */}
          <div className="bg-white border rounded-xl px-4 py-3 text-base text-muted-foreground flex items-center gap-2">
            <span className="text-xl">ℹ️</span>
            {ACTION_DESCRIPTIONS[activeAction]}
          </div>

          {/* Extra inputs per action */}
          {activeAction === "return" && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">Reason for Returning <span className="text-red-500">*</span></Label>
              <Textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Explain why this document is being returned..."
                className="text-base min-h-[100px]"
              />
            </div>
          )}

          {activeAction === "forward" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Send To <span className="text-red-500">*</span></Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Select recipient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {forwardableUsers.length === 0 ? (
                      <SelectItem value="_none" disabled>No eligible recipients found</SelectItem>
                    ) : (
                      forwardableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name} — {u.role?.toUpperCase()}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-base font-semibold">Notes (optional)</Label>
                <Textarea
                  value={forwardNotes}
                  onChange={(e) => setForwardNotes(e.target.value)}
                  placeholder="Add any forwarding notes..."
                  className="text-base"
                />
              </div>
            </div>
          )}

          {activeAction === "upload_memo" && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">Memorandum File <span className="text-red-500">*</span></Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => setMemoFile(e.target.files[0])}
                className="h-12 text-base cursor-pointer"
              />
              <p className="text-sm text-muted-foreground">Accepts PDF, DOC, JPG, PNG. Upload and link the memorandum to this communication letter.</p>
            </div>
          )}

          {activeAction === "upload_trip_ticket" && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">Trip Ticket File <span className="text-red-500">*</span></Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => setTripTicketFile(e.target.files[0])}
                className="h-12 text-base cursor-pointer"
              />
              <p className="text-sm text-muted-foreground">Accepts PDF, DOC, JPG, PNG. Upload and link the generated trip ticket.</p>
            </div>
          )}

          {/* Back / Confirm buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => { setActiveAction(null); setReturnReason(""); setForwardNotes(""); setSelectedUser(""); setMemoFile(null); setTripTicketFile(null); }}
              className="h-12 px-6 text-base gap-2"
              disabled={isSubmitting}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm() || isSubmitting}
              className={`h-12 px-8 text-base font-bold ${
                activeAction === "return"
                  ? "bg-red-700 hover:bg-red-800 text-white"
                  : "bg-green-700 hover:bg-green-800 text-white"
              }`}
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
              Confirm Action
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Helpers -----

function getAvailableActions(doc, userRole, isHolder, isCommuLetter) {
  if (!isHolder) return [];
  const status = doc.status;
  const physReceived = doc.physical_received;
  const actions = [];
  const isFinalized = status === "Released";
  const canReturn = !isFinalized;

  if (userRole === "RECEIVING") {
    if (!isFinalized) {
      actions.push({ key: "forward", label: "➡️ Forward to Section", style: "darkgreen" });
    }
  }

  if (userRole === "PROCUREMENT") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived && !isFinalized) {
      actions.push({ key: "forward", label: "➡️ Forward to Mayor", style: "darkgreen" });
    }
    if (canReturn) {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "MOBILIZATION") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived && !isFinalized) {
      actions.push({ key: "upload_trip_ticket", label: "🧾 Upload Trip Ticket", style: "darkgreen" });
    }
    if (physReceived && !!doc.trip_ticket_file_url && !isFinalized) {
      actions.push({ key: "release", label: "📤 Mark as Released", style: "darkgreen" });
    }
    if (canReturn) {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "MAYOR") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived && status !== "Signed" && !isFinalized) {
      actions.push({ key: "sign", label: "✍️ Sign Document", style: "darkgreen" });
    }
    if (status === "Signed") {
      actions.push({ key: "forward", label: "➡️ Forward to Releasing / Records", style: "darkgreen" });
    }
    if (canReturn) {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "RELEASING") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived && !isFinalized) {
      actions.push({ key: "release", label: "📤 Mark as Released", style: "darkgreen" });
    }
    if (canReturn) {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "COMMS") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (isCommuLetter && physReceived && !isFinalized) {
      actions.push({ key: "upload_memo", label: "📝 Upload Memorandum", style: "darkgreen" });
    }
    if (physReceived && status === "Received") {
      actions.push({ key: "forward", label: "➡️ Forward to Mayor", style: "darkgreen" });
    }
    if (physReceived && status === "For Release") {
      actions.push({ key: "release", label: "📤 Forward to Records / Release", style: "darkgreen" });
    }
    if (canReturn) {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "RECORDS") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived && !isFinalized) {
      actions.push({ key: "release", label: "📤 Forward to Records / Release", style: "darkgreen" });
    }
  }

  return actions;
}

function getActionLabel(key) {
  const labels = {
    mark_received: "Mark as Received",
    forward: "Forward Document",
    return: "Return to Sender",
    sign: "Sign Document",
    release: "Mark as Released",
    upload_memo: "Upload Memorandum",
    upload_trip_ticket: "Upload Trip Ticket",
  };
  return labels[key] || key;
}

function getForwardableUsers(allUsers, currentUser, document) {
  const userRole = currentUser?.role?.toUpperCase();
  const documentSection = document?.section?.toUpperCase();

  if (userRole === "RECEIVING") {
    return allUsers.filter((u) => {
      const role = u.role?.toUpperCase();
      if (u.email === currentUser?.email) return false;
      if (documentSection === "COMMS") return role === "COMMS";
      if (documentSection === "MOBILIZATION") return role === "MOBILIZATION";
      return role === "PROCUREMENT";
    });
  }

  if (userRole === "PROCUREMENT" || userRole === "COMMS") {
    return allUsers.filter(
      (u) => u.role?.toUpperCase() === "MAYOR" && u.email !== currentUser?.email
    );
  }

  if (userRole === "MAYOR") {
    if (document?.classification === "Commu Letter") {
      return allUsers.filter(
        (u) => u.role?.toUpperCase() === "RECORDS" && u.email !== currentUser?.email
      );
    }
    if (documentSection === "MOBILIZATION") {
      return allUsers.filter(
        (u) =>
          u.role?.toUpperCase() === "MOBILIZATION" &&
          u.email !== currentUser?.email
      );
    }
    return allUsers.filter(
      (u) => u.role?.toUpperCase() === "RELEASING" && u.email !== currentUser?.email
    );
  }

  return [];
}

function getForwardStatus(userRole, document, toUser) {
  const role = userRole?.toUpperCase();
  const targetRole = toUser?.role?.toUpperCase();

  if (role === "RECEIVING") return "Forwarded";
  if (role === "PROCUREMENT" || role === "COMMS") return "For Signature";
  if (role === "MAYOR" && (targetRole === "RELEASING" || targetRole === "COMMS" || targetRole === "RECORDS" || targetRole === "MOBILIZATION" || targetRole === "PROCUREMENT")) {
    return "For Release";
  }

  return "Forwarded";
}

function canRoleHandleSection(role, userSection, docSection) {
  if (!docSection) return true;
  if (role === "ADMIN" || role === "MAYOR" || role === "RECEIVING") return true;
  return userSection === docSection;
}

function getActionIcon(key) {
  if (key === "return") return <AlertTriangle className="w-5 h-5 text-red-600" />;
  if (key === "forward") return <Send className="w-5 h-5 text-green-700" />;
  if (key === "upload_memo" || key === "upload_trip_ticket") return <FileUp className="w-5 h-5 text-green-700" />;
  return <CheckSquare className="w-5 h-5 text-green-700" />;
}

function ActionButton({ action, onClick }) {
  const base = "h-14 px-8 text-base font-bold rounded-xl transition-all active:scale-95";
  const styles = {
    green: `${base} bg-green-600 hover:bg-green-700 text-white`,
    darkgreen: `${base} bg-green-800 hover:bg-green-900 text-white`,
    red: `${base} bg-red-700 hover:bg-red-800 text-white`,
  };
  return (
    <button className={styles[action.style] || styles.green} onClick={onClick}>
      {action.label}
    </button>
  );
}