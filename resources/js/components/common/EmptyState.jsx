import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmptyState({ icon: Icon = Inbox, title = "No records found", description = "There is no data to display yet.", action, className }) {
  return (
    <div className={cn("rounded-2xl border border-dashed bg-card/70 px-6 py-10 text-center", className)} role="status" aria-live="polite">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
