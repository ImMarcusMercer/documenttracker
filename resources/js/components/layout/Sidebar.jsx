import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  FileText, 
  FilePlus, 
  LogOut,
  Building2,
  Users,
  Bell,
  Menu,
  ShieldCheck,
  UserCircle,
  Code2
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "All Documents", icon: FileText, path: "/documents" },
  { label: "New Document", icon: FilePlus, path: "/documents/new" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "My Profile", icon: UserCircle, path: "/profile" },
];

export default function Sidebar({ className, onNavigate, isOpen, onToggle }) {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setCurrentUser(u);
      const role = u?.role?.toUpperCase();
      if (role === "ADMIN") setIsAdmin(true);
      if (role === "ADMIN" || role === "DEVELOPER") setIsDeveloper(true);
    });
  }, []);

  const { data: unreadNotificationPage = { data: [], meta: {} } } = useQuery({
    queryKey: ["unread-notifications", currentUser?.email],
    queryFn: () => base44.entities.Notification.listPage({ is_read: false, per_page: 100 }),
    enabled: !!currentUser?.email,
    refetchInterval: 15000,
  });

  const unreadCount = unreadNotificationPage?.meta?.unread_count ?? unreadNotificationPage?.data?.length ?? 0;

  return (
    <aside className={cn("w-64 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col shadow-xl", className)}>
      {/* Logo / Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">DocTracker</h1>
            <p className="text-xs text-white/70">Empowering Women Through Efficient and Inclusive Service Systems</p>
          </div>
          {isOpen && (
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={onToggle}
              className="mt-1 h-7 w-7 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <Menu className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all ${
                isActive
                  ? "bg-white text-primary shadow-md"
                  : "text-white/90 hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.path === "/notifications" && unreadCount > 0 && (
                <span className="text-xs bg-white text-primary font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Admin: User Management */}
      {isAdmin && (
        <div className="px-4 pb-2">
          <Link
            to="/users"
            onClick={onNavigate}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all ${
              location.pathname === "/users"
                ? "bg-white text-primary shadow-md"
                : "text-white/90 hover:bg-sidebar-accent"
            }`}
          >
            <Users className="w-5 h-5 flex-shrink-0" />
            <span>Manage Users</span>
          </Link>
          <Link
            to="/admin"
            onClick={onNavigate}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all ${
              location.pathname === "/admin"
                ? "bg-white text-primary shadow-md"
                : "text-white/90 hover:bg-sidebar-accent"
            }`}
          >
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
            <span>Admin Console</span>
          </Link>
        </div>
      )}


      {isDeveloper && (
        <div className="px-4 pb-2">
          <Link
            to="/developer"
            onClick={onNavigate}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all ${
              location.pathname === "/developer"
                ? "bg-white text-primary shadow-md"
                : "text-white/90 hover:bg-sidebar-accent"
            }`}
          >
            <Code2 className="w-5 h-5 flex-shrink-0" />
            <span>Developer Console</span>
          </Link>
        </div>
      )}

      {/* Logout */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => {
            if (onNavigate) onNavigate();
            base44.auth.logout('/login');
          }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-sidebar-accent hover:text-white transition-all w-full text-base font-medium"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}