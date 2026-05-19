import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, FilePlus, Loader2, ScanText, Upload } from "lucide-react";
import { toast } from "sonner";
import FieldError from "@/components/form/FieldError";
import RequiredLabel from "@/components/form/RequiredLabel";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { firstError, validateDate, validateFile, validateNumber, validateRequired } from "@/lib/formValidation";

const sectionByClassification = {
  "Commu Letter": "COMMS",
  "Purchase Request": "PROCUREMENT",
  "Request Letter": "MOBILIZATION",
};

const ocrFieldLabels = {
  classification: "Classification",
  section: "Section",
  particulars: "Particulars / Subject",
  source_office: "Source Office",
  requestor: "Requestor",
  amount: "Amount",
  received_date: "Date Received",
  remarks: "Remarks",
};

const ocrSupportedExtensions = new Set(["pdf", "jpg", "jpeg", "png", "tif", "tiff", "bmp", "webp"]);

export default function NewDocument() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [file, setFile] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [form, setForm] = useState(() => {
    try {
      return {
        control_number: "",
        classification: "",
        section: "COMMS",
        particulars: "",
        source_office: "",
        requestor: "",
        amount: "",
        received_date: new Date().toISOString().split("T")[0],
        remarks: "",
        ...(JSON.parse(localStorage.getItem("docutracker.new_document_draft") || "{}")),
      };
    } catch {
      return {
        control_number: "",
        classification: "",
        section: "COMMS",
        particulars: "",
        source_office: "",
        requestor: "",
        amount: "",
        received_date: new Date().toISOString().split("T")[0],
        remarks: "",
      };
    }
  });
  const [touched, setTouched] = useState({});
  const [hasSavedOnce, setHasSavedOnce] = useState(false);

  const { data: existingDocs = [] } = useQuery({
    queryKey: ["documents-for-control-number"],
    queryFn: () => base44.entities.Document.list("-created_date", 1000),
  });

  const errors = useMemo(() => ({
    received_date: validateDate(form.received_date, { required: true, label: "Date received" }),
    classification: validateRequired(form.classification, "Classification"),
    section: validateRequired(form.section, "Section"),
    particulars: validateRequired(form.particulars, "Particulars / subject"),
    amount: validateNumber(form.amount, { min: 0, max: 999999999, decimals: 2, label: "Amount" }),
    file: validateFile(file, { allowed: ["pdf", "doc", "docx", "jpg", "jpeg", "png", "tif", "tiff", "bmp", "webp"], maxMb: 10 }),
  }), [form, file]);

  const markTouched = (field) => setTouched((current) => ({ ...current, [field]: true }));
  const showError = (field) => touched[field] ? errors[field] : "";
  const isDirty = Boolean(form.classification || form.particulars || form.source_office || form.requestor || form.amount || form.remarks || file);
  useUnsavedChanges(isDirty && !hasSavedOnce);

  useEffect(() => {
    if (hasSavedOnce) return;
    localStorage.setItem("docutracker.new_document_draft", JSON.stringify({ ...form, control_number: "" }));
  }, [form, hasSavedOnce]);


  const handleChange = (field, value) => {
    if (field === "classification") {
      setForm((prev) => ({
        ...prev,
        classification: value,
        section: sectionByClassification[value] || prev.section,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (selectedFile) => {
    const error = validateFile(selectedFile, { allowed: ["pdf", "doc", "docx", "jpg", "jpeg", "png", "tif", "tiff", "bmp", "webp"], maxMb: 10 });
    if (error) {
      toast.error(error);
      setFile(null);
      markTouched("file");
      return;
    }
    setFile(selectedFile || null);
    setOcrResult(null);
    markTouched("file");
  };

  useEffect(() => {
    const nextControlNumber = generateControlNumber(form.received_date, existingDocs);
    setForm((prev) => ({ ...prev, control_number: nextControlNumber }));
  }, [form.received_date, existingDocs]);

  const handleExtract = async () => {
    if (!file) {
      toast.error("Upload a request form first.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ocrSupportedExtensions.has(extension)) {
      toast.error("OCR supports PDF and image files only. DOC and DOCX can be uploaded, but they cannot be extracted.");
      return;
    }

    setIsExtracting(true);
    try {
      const result = await base44.integrations.Core.ExtractDocument({ file });
      setOcrResult(result);

      if (result?.status === "extracted") {
        toast.success("OCR extracted suggested fields. Review before saving.");
      } else if (result?.status === "text_only") {
        toast.warning("OCR found text but did not detect enough known fields.");
      } else {
        toast.error(result?.message || "OCR extraction failed.");
      }
    } catch (error) {
      toast.error(error.message || "OCR extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  };

  const applyOcrSuggestions = () => {
    const suggestions = ocrResult?.suggestions || {};
    if (!Object.keys(suggestions).length) {
      toast.error("No OCR suggestions to apply.");
      return;
    }

    setForm((prev) => {
      const next = { ...prev };
      for (const [field, value] of Object.entries(suggestions)) {
        if (!Object.prototype.hasOwnProperty.call(next, field) || value === null || value === undefined) {
          continue;
        }
        next[field] = String(value);
      }

      if (suggestions.classification) {
        next.section = sectionByClassification[suggestions.classification] || suggestions.section || next.section;
      }

      return next;
    });

    toast.success("OCR suggestions applied. Please verify the fields.");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ received_date: true, classification: true, section: true, particulars: true, amount: true, file: true });
    const error = firstError(errors);
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);

    try {
      let uploadedFile = {};
      if (file) {
        uploadedFile = await base44.integrations.Core.UploadFile({ file });
      }

      const docData = {
        classification: form.classification,
        section: form.section,
        particulars: form.particulars,
        source_office: form.source_office || undefined,
        requestor: form.requestor || undefined,
        amount: form.amount ? parseFloat(form.amount) : undefined,
        received_date: form.received_date,
        remarks: form.remarks || undefined,
        file_url: uploadedFile.file_url,
        file_path: uploadedFile.file_path,
        file_name: uploadedFile.file_name,
        file_mime: uploadedFile.file_mime,
        file_size: uploadedFile.file_size,
        ocr_status: ocrResult?.status,
        ocr_text: ocrResult?.text,
        ocr_confidence: ocrResult?.confidence,
        extracted_fields: ocrResult?.fields,
      };

      const newDoc = await base44.entities.Document.create(docData);

      setHasSavedOnce(true);
      localStorage.removeItem("docutracker.new_document_draft");
      toast.success("Document created successfully!");
      navigate(`/documents/${newDoc.id}`);
    } catch (error) {
      toast.error(error.message || "Failed to save document.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
        <FilePlus className="w-8 h-8 text-primary" />
        New Document
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Document Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold flex items-center gap-2">
                    <ScanText className="w-5 h-5" />
                    OCR-assisted encoding
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Upload the standard request form, extract suggested fields, then review before saving.
                  </p>
                </div>
                <a
                  href="/templates/docutracker_request_form_sample.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Download test request form
                </a>
              </div>

              {ocrResult && (
                <div className="rounded-lg border bg-background p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {ocrResult.status === "extracted" ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                      )}
                      <span className="text-sm font-semibold">{ocrResult.message}</span>
                    </div>
                    <Badge variant="outline">Confidence: {ocrResult.confidence || 0}%</Badge>
                  </div>

                  {Object.keys(ocrResult.fields || {}).length > 0 && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {Object.entries(ocrResult.fields).map(([key, field]) => (
                          <div key={key} className="rounded-md border p-2 text-sm">
                            <p className="font-medium">{ocrFieldLabels[key] || key}</p>
                            <p className="text-muted-foreground break-words">{field.value}</p>
                          </div>
                        ))}
                      </div>
                      <Button type="button" variant="secondary" onClick={applyOcrSuggestions}>
                        Apply Suggestions to Form
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-base font-semibold">
                  Control Number <span className="text-red-500">*</span>
                </Label>
                <Input value={form.control_number} readOnly placeholder="Auto-generated" className="h-12 text-lg" />
                <p className="text-xs text-muted-foreground">Auto format: MMDDNNN (e.g., 0325001)</p>
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="received_date" required>Date Received</RequiredLabel>
                <Input
                  id="received_date"
                  type="date"
                  value={form.received_date}
                  onChange={(e) => handleChange("received_date", e.target.value)}
                  onBlur={() => markTouched("received_date")}
                  aria-invalid={Boolean(showError("received_date"))}
                  aria-describedby="received_date-error"
                  className="h-12 text-lg"
                />
                <FieldError id="received_date-error" message={showError("received_date")} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <RequiredLabel required>Classification</RequiredLabel>
                <Select value={form.classification} onValueChange={(v) => handleChange("classification", v)}>
                  <SelectTrigger className="h-12 text-base" aria-invalid={Boolean(showError("classification"))}>
                    <SelectValue placeholder="Select document type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Commu Letter">Commu Letter</SelectItem>
                    <SelectItem value="Purchase Request">Purchase Request</SelectItem>
                    <SelectItem value="Request Letter">Request Letter</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError id="classification-error" message={showError("classification")} />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Section / Department</RequiredLabel>
                <Select value={form.section} onValueChange={(v) => handleChange("section", v)}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Select section..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMMS">Communications</SelectItem>
                    <SelectItem value="PROCUREMENT">Procurement</SelectItem>
                    <SelectItem value="MOBILIZATION">Mobilization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel htmlFor="particulars" required>Particulars / Subject</RequiredLabel>
              <Textarea
                id="particulars"
                value={form.particulars}
                onChange={(e) => handleChange("particulars", e.target.value)}
                onBlur={() => markTouched("particulars")}
                aria-invalid={Boolean(showError("particulars"))}
                aria-describedby="particulars-error"
                placeholder="Describe the document..."
                className="text-base min-h-[100px]"
              />
              <FieldError id="particulars-error" message={showError("particulars")} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Source Office</Label>
                <Input
                  value={form.source_office}
                  onChange={(e) => handleChange("source_office", e.target.value)}
                  placeholder="e.g., City Agriculture Office"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base font-semibold">Requestor</Label>
                <Input
                  value={form.requestor}
                  onChange={(e) => handleChange("requestor", e.target.value)}
                  placeholder="Name of requestor"
                  className="h-12 text-base"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">Amount (₱)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => handleChange("amount", e.target.value)}
                onBlur={() => markTouched("amount")}
                aria-invalid={Boolean(showError("amount"))}
                aria-describedby="amount-error"
                placeholder="0.00"
                className="h-12 text-lg"
              />
              <FieldError id="amount-error" message={showError("amount")} />
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">Upload Document Scan</Label>
              <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <Input
                  type="file"
                  onChange={(e) => handleFileChange(e.target.files[0])}
                  onBlur={() => markTouched("file")}
                  aria-invalid={Boolean(showError("file"))}
                  aria-describedby="file-error"
                  className="h-12 text-base cursor-pointer"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff,.bmp,.webp"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Upload accepts PDF, DOC, DOCX, and image files. OCR works only on PDF, JPG, PNG, TIFF, BMP, and WEBP.
                </p>
                <FieldError id="file-error" message={showError("file")} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExtract}
                  disabled={!file || isExtracting}
                  className="mt-4"
                >
                  {isExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanText className="w-4 h-4 mr-2" />}
                  Extract with OCR
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">Remarks (optional)</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => handleChange("remarks", e.target.value)}
                placeholder="Any additional notes..."
                className="text-base"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => { if (!isDirty || window.confirm("Discard unsaved document draft?")) navigate(-1); }} className="h-14 px-8 text-lg">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-14 px-8 text-lg font-semibold bg-primary hover:bg-primary/90 flex-1"
              >
                {isSubmitting ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <FilePlus className="w-6 h-6 mr-2" />}
                Save Document
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function generateControlNumber(receivedDate, documents) {
  const [year, month, day] = (receivedDate || "").split("-");
  if (!year || !month || !day) return "";

  const prefix = `${month}${day}`;
  const suffixes = documents
    .filter((doc) => doc.received_date === receivedDate && typeof doc.control_number === "string")
    .map((doc) => doc.control_number)
    .filter((controlNo) => controlNo.startsWith(prefix) && controlNo.length >= 7)
    .map((controlNo) => Number(controlNo.slice(4)))
    .filter((value) => Number.isFinite(value));

  const nextSeq = (suffixes.length ? Math.max(...suffixes) : 0) + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}
