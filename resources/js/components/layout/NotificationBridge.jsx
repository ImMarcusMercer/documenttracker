import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

const toastBySeverity = (item) => {
  const severity = item?.severity || item?.type || "info";
  const title = item?.title || "DocTracker notification";
  const description = item?.message || "A new notification was received.";
  const options = { description, id: `notification-${item?.id || Date.now()}` };

  if (severity === "success") return toast.success(title, options);
  if (severity === "warning") return toast.warning(title, options);
  if (severity === "critical" || severity === "error") return toast.error(title, options);
  return toast.info(title, options);
};

export default function NotificationBridge() {
  const queryClient = useQueryClient();
  const latestShownIdRef = useRef(null);

  useEffect(() => {
    let source = null;
    let cancelled = false;
    let fallbackTimer = null;

    const refreshNotificationQueries = () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["global-dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    };

    const startPollingFallback = () => {
      if (fallbackTimer) return;
      fallbackTimer = window.setInterval(refreshNotificationQueries, 15000);
    };

    try {
      source = new EventSource(base44.entities.Notification.streamUrl(), { withCredentials: true });
      source.addEventListener("notification-summary", (event) => {
        if (cancelled) return;
        const payload = JSON.parse(event.data || "{}");
        const latest = payload.latest;
        refreshNotificationQueries();

        if (latest && latest.delivery_methods?.popup !== false && latest.id !== latestShownIdRef.current && !latest.is_read) {
          latestShownIdRef.current = latest.id;
          toastBySeverity(latest);
        }
      });
      source.onerror = () => {
        startPollingFallback();
      };
    } catch {
      startPollingFallback();
    }

    const mutationListener = (event) => {
      const payload = event.detail?.payload;
      if (payload?.data?.title && payload?.data?.message && payload?.data?.delivery_methods?.popup !== false) {
        toastBySeverity(payload.data);
      }
      refreshNotificationQueries();
    };

    window.addEventListener("docutracker:data-mutated", mutationListener);

    return () => {
      cancelled = true;
      if (source) source.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      window.removeEventListener("docutracker:data-mutated", mutationListener);
    };
  }, [queryClient]);

  return null;
}
