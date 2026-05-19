import { Link, useLocation } from "react-router-dom";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HelpDeskFloatingButton() {
  const location = useLocation();
  if (location.pathname.startsWith("/helpdesk")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <Button asChild className="h-14 rounded-full shadow-xl px-5 gap-2">
        <Link to="/helpdesk" aria-label="Open Help Desk ticketing page">
          <LifeBuoy className="w-5 h-5" />
          <span className="hidden sm:inline">Need Help?</span>
        </Link>
      </Button>
    </div>
  );
}
