import { Badge } from "@/components/ui/badge";
import { 
  Inbox, 
  Search, 
  PenTool, 
  Send, 
  CheckCircle2, 
  RotateCcw,
  Clock
} from "lucide-react";

const statusConfig = {
  "Pending Receipt": { color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  "Forwarded": { color: "bg-blue-100 text-blue-800 border-blue-200", icon: Send },
  "Received": { color: "bg-blue-100 text-blue-800 border-blue-200", icon: Inbox },
  "Checking": { color: "bg-amber-100 text-amber-800 border-amber-200", icon: Search },
  "For Signature": { color: "bg-purple-100 text-purple-800 border-purple-200", icon: PenTool },
  "Signed": { color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: PenTool },
  "For Release": { color: "bg-orange-100 text-orange-800 border-orange-200", icon: Send },
  "Released": { color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  "Returned": { color: "bg-red-100 text-red-800 border-red-200", icon: RotateCcw },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig["Received"];
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`${config.color} border text-sm px-3 py-1 font-semibold inline-flex items-center gap-1.5`}
    >
      <Icon className="w-3.5 h-3.5" />
      {status}
    </Badge>
  );
}