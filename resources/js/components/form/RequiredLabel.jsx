import { Label } from "@/components/ui/label";

export default function RequiredLabel({ htmlFor, children, required = false, className = "text-base font-semibold" }) {
  return (
    <Label htmlFor={htmlFor} className={className}>
      {children} {required && <span className="text-red-500" aria-label="required">*</span>}
    </Label>
  );
}
