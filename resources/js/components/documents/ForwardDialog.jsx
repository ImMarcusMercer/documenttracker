import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Loader2 } from "lucide-react";

export default function ForwardDialog({ open, onOpenChange, document, onForwarded }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [notes, setNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadUsers();
      // Suggest next status
      const statusFlow = {
        "Received": "Checking",
        "Checking": "For Signature",
        "For Signature": "For Release",
        "For Release": "Released",
      };
      setNewStatus(statusFlow[document?.status] || "Checking");
    }
  }, [open, document]);

  const loadUsers = async () => {
    const allUsers = await base44.entities.User.list();
    setUsers(allUsers);
  };

  const handleSubmit = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    
    const toUser = users.find(u => u.id === selectedUser);
    const me = await base44.auth.me();

    // Log action while the current user is still the holder.
    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Forwarded",
      from_user: me.email,
      from_user_name: me.full_name,
      to_user: toUser.email,
      to_user_name: toUser.full_name,
      notes: notes,
      new_status: newStatus,
    });

    // Update document
    await base44.entities.Document.update(document.id, {
      status: newStatus,
      current_holder: toUser.email,
      current_holder_name: toUser.full_name,
      current_holder_role: toUser.role?.toUpperCase(),
      forwarded_to: toUser.full_name,
      physical_received: false,
    });

    setIsSubmitting(false);
    setSelectedUser("");
    setNotes("");
    onOpenChange(false);
    if (onForwarded) onForwarded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Forward Document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Set Status To</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Received">Received</SelectItem>
                <SelectItem value="Checking">Checking</SelectItem>
                <SelectItem value="For Signature">For Signature</SelectItem>
                <SelectItem value="For Release">For Release</SelectItem>
                <SelectItem value="Released">Released</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-base font-semibold">Send To</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Select a person..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-base font-semibold">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes here..."
              className="text-base min-h-[80px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12 text-base px-6">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!selectedUser || isSubmitting}
            className="h-12 text-base px-6 bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
            Forward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}