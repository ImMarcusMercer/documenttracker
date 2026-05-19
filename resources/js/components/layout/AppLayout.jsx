import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import Sidebar from "./Sidebar";
import HelpDeskFloatingButton from "./HelpDeskFloatingButton";
import SystemChatbot from "@/components/chat/SystemChatbot";
import DashboardSummaryBar from "./DashboardSummaryBar";
import NotificationBridge from "./NotificationBridge";
import PageBreadcrumbs from "./PageBreadcrumbs";
import ThemeToggle from "./ThemeToggle";

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { sessionPolicy, logout } = useAuth();
  const lastActivityRef = useRef(Date.now());
  const hasWarnedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const syncSidebarDefault = () => {
      setIsSidebarOpen(media.matches);
    };

    syncSidebarDefault();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncSidebarDefault);
      return () => media.removeEventListener("change", syncSidebarDefault);
    }

    media.addListener(syncSidebarDefault);
    return () => media.removeListener(syncSidebarDefault);
  }, []);

  useEffect(() => {
    const timeoutMinutes = Number(sessionPolicy?.session_timeout_minutes || 120);
    const warningMinutes = Number(sessionPolicy?.session_timeout_warning_minutes || 5);
    const timeoutMs = Math.max(1, timeoutMinutes) * 60 * 1000;
    const warningMs = Math.max(1, warningMinutes) * 60 * 1000;

    const markActivity = () => {
      lastActivityRef.current = Date.now();
      hasWarnedRef.current = false;
      toast.dismiss("session-timeout-warning");
    };

    const activityEvents = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - elapsed;

      if (remaining <= 0) {
        window.clearInterval(interval);
        toast.error("Session expired. Please sign in again.", { id: "session-timeout-warning" });
        logout(true);
        return;
      }

      if (remaining <= warningMs && !hasWarnedRef.current) {
        hasWarnedRef.current = true;
        const minutes = Math.max(1, Math.ceil(remaining / 60000));
        toast.warning(`Your session will expire in about ${minutes} minute(s) because of inactivity. Move or click anywhere to stay active.`, {
          id: "session-timeout-warning",
        });
      }
    }, 15000);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.clearInterval(interval);
    };
  }, [sessionPolicy, logout]);

  const handleNavigate = () => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow">Skip to main content</a>
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle />
      </div>
      {!isSidebarOpen && (
        <button
          type="button"
          aria-label="Open sidebar"
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-50 h-8 w-8 rounded-md border bg-card shadow-sm flex items-center justify-center"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}

      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          onNavigate={handleNavigate}
          className="h-full"
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
        />
      </div>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "min-h-screen transition-all duration-300 focus:outline-none",
          isSidebarOpen ? "lg:pl-64" : "lg:pl-0"
        )}
      >
        <div className="w-full max-w-7xl mx-auto">
          <DashboardSummaryBar />
          <PageBreadcrumbs />
          <Outlet />
        </div>
      </main>

      <NotificationBridge />
      <SystemChatbot />
      <HelpDeskFloatingButton />
    </div>
  );
}
