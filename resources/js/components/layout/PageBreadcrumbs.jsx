import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

const LABELS = {
  documents: "Documents",
  new: "New Document",
  notifications: "Notifications",
  profile: "Profile",
  users: "User Management",
  admin: "Admin Console",
  developer: "Developer Console",
};

export default function PageBreadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);

  if (parts.length === 0) return null;

  const crumbs = parts.map((part, index) => {
    const path = `/${parts.slice(0, index + 1).join("/")}`;
    const label = LABELS[part] || (index > 0 && parts[index - 1] === "documents" ? "View Document" : part.replace(/-/g, " "));
    return { path, label };
  });

  return (
    <nav aria-label="Breadcrumb" className="px-4 pt-4 sm:px-6 lg:px-8">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link to="/" className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Dashboard
          </Link>
        </li>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.path} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              {isLast ? (
                <span className="rounded-md px-2 py-1 font-medium text-foreground capitalize">{crumb.label}</span>
              ) : (
                <Link to={crumb.path} className="rounded-md px-2 py-1 capitalize hover:bg-muted hover:text-foreground">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
