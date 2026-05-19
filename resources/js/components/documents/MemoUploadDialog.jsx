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
import { Input } from "@/components/ui/input";
import { FileUp, Loader2 } from "lucide-react";

export default function MemoUploadDialog({ open, onOpenChange, document, onUploaded }) {
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!file) return;
    setIsSubmitting(true);

    const uploadedFile = await base44.integrations.Core.UploadFile({ file, category: "memorandums" });
    const me = await base44.auth.me();

    await base44.entities.Document.update(document.id, {
      memo_file_url: uploadedFile.file_url,
      memo_file_path: uploadedFile.file_path,
      memo_file_name: uploadedFile.file_name,
      memo_file_mime: uploadedFile.file_mime,
      memo_file_size: uploadedFile.file_size,
    });

    await base44.entities.DocumentAction.create({
      document_id: document.id,
      action_type: "Memo Uploaded",
      from_user: me.email,
      from_user_name: me.full_name,
      notes: "Memorandum uploaded and linked to communication letter",
      new_status: document.status,
    });

    setIsSubmitting(false);
    setFile(null);
    onOpenChange(false);
    if (onUploaded) onUploaded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileUp className="w-5 h-5 text-primary" />
            Upload Memorandum
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-base text-muted-foreground">
            This communication letter will be released as a memorandum. Upload the memorandum file below.
          </p>
          <div className="space-y-2">
            <Label className="text-base font-semibold">Memorandum File</Label>
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
              className="h-12 text-base cursor-pointer"
              accept=".pdf,.doc,.docx,.jpg,.png"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12 text-base px-6">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || isSubmitting}
            className="h-12 text-base px-6 bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <FileUp className="w-5 h-5 mr-2" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}