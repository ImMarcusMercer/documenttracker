import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

// Map roles to their next allowed recipient roles in the chain
const ROLE_CHAIN = {
  RECEIVING: ["PROCUREMENT", "MOBILIZATION"],
  PROCUREMENT: ["MAYOR"],
  MOBILIZATION: ["MAYOR"],
  MAYOR: ["RELEASING"],
  RELEASING: [], // terminal
  COMMS: ["MAYOR"], // comms drafts memo, sends to mayor
};

// What status to set when forwarding, per role
const FORWARD_STATUS = {
  RECEIVING: "Checking",
  PROCUREMENT: "For Signature",
  MOBILIZATION: "For Signature",
  MAYOR: "For Release",
  RELEASING: "Released",
  COMMS: "For Signature",
};

// Action descriptions per step
const ACTION_DESCRIPTIONS = {
  mark_received: "Confirm you have physically received this document.",
  forward: "Select who to forward this document to next.",
  return: "Describe why you are returning this document.",
  sign: "Confirm you have reviewed and signed this document.",
  release: "Confirm you are releasing this document.",
  upload_memo: "Upload the memorandum to link to this communication letter, then release.",
};

export default function ActionPanel({ document, currentUser, onActionDone }) {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState(null); // null | 'mark_received' | 'forward' | 'return' | 'sign' | 'release' | 'upload_memo'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [forwardNotes, setForwardNotes] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [memoFile, setMemoFile] = useState(null);

  const userRole = currentUser?.role?.toUpperCase();
  const isHolder = document.current_holder === currentUser?.email;
  const isCommuLetter = document.classification === "Communication Letter";
  const isAdmin = userRole === "ADMIN";

  // Load users to forward to
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => base44.entities.User.list(),
    enabled: activeAction === "forward",
  });

  // Filter users based on role chain
  const allowedNextRoles = ROLE_CHAIN[userRole] || [];
  const forwardableUsers = allUsers.filter(
    (u) => allowedNextRoles.includes(u.role?.toUpperCase()) && u.email !== currentUser?.email
  );

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
      }
      setActiveAction(null);
      setReturnReason("");
      setForwardNotes("");
      setSelectedUser("");
      setMemoFile(null);
      if (onActionDone) onActionDone();
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
  };

  const doForward = async () => {
    const toUser = allUsers.find((u) => u.id === selectedUser);
    if (!toUser) return;
    const newStatus = FORWARD_STATUS[userRole] || "Checking";
    await base44.entities.Document.update(document.id, {
      status: newStatus,
      current_holder: toUser.email,
      current_holder_name: toUser.full_name,
      current_holder_role: toUser.role?.toUpperCase(),
      forwarded_to: toUser.full_name,
      physical_received: false, // reset for next holder
    });
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
  };

  const doReturn = async () => {
    await base44.entities.Document.update(document.id, {
      status: "Returned",
      return_reason: returnReason,
    });
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Returned",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: returnReason,
      new_status: "Returned",
    });
  };

  const doSign = async () => {
    await base44.entities.Document.update(document.id, {
      status: "For Release",
      physical_received: true,
    });
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Signed",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: `Document reviewed and signed by ${currentUser.full_name}.`,
      new_status: "For Release",
    });
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
  };

  const doUploadMemo = async () => {
    let memo_file_url = document.memo_file_url;
    if (memoFile) {
      const result = await base44.integrations.Core.UploadFile({ file: memoFile });
      memo_file_url = result.file_url;
    }
    await base44.entities.Document.update(document.id, {
      memo_file_url,
      status: "Released",
      released_date: new Date().toISOString().split("T")[0],
    });
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Memo Uploaded",
      from_user: currentUser.email,
      from_user_name: currentUser.full_name,
      notes: "Memorandum uploaded and document released.",
      new_status: "Released",
    });
  };

  const canConfirm = () => {
    if (activeAction === "return") return returnReason.trim().length > 0;
    if (activeAction === "forward") return !!selectedUser;
    if (activeAction === "upload_memo") return !!memoFile || !!document.memo_file_url;
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
              <p className="text-sm text-muted-foreground">Accepts PDF, DOC, JPG, PNG. After upload, the document will be marked as Released.</p>
            </div>
          )}

          {/* Back / Confirm buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => { setActiveAction(null); setReturnReason(""); setForwardNotes(""); setSelectedUser(""); setMemoFile(null); }}
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

  if (userRole === "RECEIVING") {
    if (status === "Pending Receipt" || status === "Received" || !physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived) {
      actions.push({ key: "forward", label: "➡️ Forward to Section", style: "darkgreen" });
    }
    if (status !== "Released" && status !== "Returned") {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "PROCUREMENT" || userRole === "MOBILIZATION") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived) {
      actions.push({ key: "forward", label: "➡️ Forward to Mayor", style: "darkgreen" });
    }
    if (status !== "Released" && status !== "Returned") {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "MAYOR") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived) {
      actions.push({ key: "sign", label: "✍️ Sign & Send to Releasing", style: "darkgreen" });
    }
    if (status !== "Released" && status !== "Returned") {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "RELEASING") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived) {
      if (isCommuLetter) {
        actions.push({ key: "upload_memo", label: "📝 Upload Memorandum & Release", style: "darkgreen" });
      } else {
        actions.push({ key: "release", label: "📤 Mark as Released", style: "darkgreen" });
      }
    }
    if (status !== "Released" && status !== "Returned") {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
    }
  }

  if (userRole === "COMMS") {
    if (!physReceived) {
      actions.push({ key: "mark_received", label: "✅ Mark as Received", style: "green" });
    }
    if (physReceived && isCommuLetter) {
      actions.push({ key: "upload_memo", label: "📝 Upload Memorandum & Release", style: "darkgreen" });
    }
    if (status !== "Released" && status !== "Returned") {
      actions.push({ key: "return", label: "↩️ Return to Sender", style: "red" });
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
    upload_memo: "Upload Memorandum & Release",
  };
  return labels[key] || key;
}

function getActionIcon(key) {
  if (key === "return") return <AlertTriangle className="w-5 h-5 text-red-600" />;
  if (key === "forward") return <Send className="w-5 h-5 text-green-700" />;
  if (key === "upload_memo") return <FileUp className="w-5 h-5 text-green-700" />;
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