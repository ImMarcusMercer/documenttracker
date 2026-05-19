import { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RotateCcw, Loader2 } from "lucide-react";

export default function ReturnDialog({ open, onOpenChange, document, onReturned }) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setIsSubmitting(true);

    const me = await base44.auth.me();

    await base44.entities.Document.update(document.id, {
      status: "Returned",
      return_reason: reason,
    });

    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Returned",
      from_user: me.email,
      from_user_name: me.full_name,
      notes: reason,
      new_status: "Returned",
    });

    setIsSubmitting(false);
    setReason("");
    onOpenChange(false);
    if (onReturned) onReturned();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-600">
            <RotateCcw className="w-5 h-5" />
            Return Document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Reason for Returning</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why this document is being returned..."
              className="text-base min-h-[120px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12 text-base px-6">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || isSubmitting}
            variant="destructive"
            className="h-12 text-base px-6"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <RotateCcw className="w-5 h-5 mr-2" />}
            Return Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}