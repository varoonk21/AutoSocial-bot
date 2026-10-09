import { useEffect, useState, useRef } from "react";
import { Bell, CheckCheck, AlertTriangle, CheckCircle2, Info, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch } from "@/lib/fetcher";

interface Notification {
  _id: string;
  type: "post_published" | "post_failed" | "token_expiring" | "info";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const TYPE_ICONS = {
  post_published: { icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  post_failed: { icon: AlertTriangle, color: "text-red-600 bg-red-50" },
  token_expiring: { icon: KeyRound, color: "text-amber-600 bg-amber-50" },
  info: { icon: Info, color: "text-blue-600 bg-blue-50" },
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const [list, count] = await Promise.all([
        apiGet("/notifications?pageSize=15"),
        apiGet("/notifications/unread-count"),
      ]);
      setNotifications(list.items || []);
      setUnread(count.count || 0);
    } catch {
      // Bell degrades silently — it's ambient UI, not the main content
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const markAllRead = async () => {
    try {
      await apiPatch("/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {}
  };

  const markOneRead = async (id: string) => {
    try {
      await apiPatch(`/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Notifications"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full ring-2 ring-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 w-80 max-h-[70vh] overflow-hidden bg-white rounded-xl border border-gray-200 shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10 px-4">
                You're all caught up. Publish results and account alerts will appear here.
              </p>
            ) : (
              notifications.map((n) => {
                const { icon: Icon, color } = TYPE_ICONS[n.type] || TYPE_ICONS.info;
                return (
                  <button
                    key={n._id}
                    onClick={() => markOneRead(n._id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 flex gap-3 ${
                      n.read ? "opacity-60" : ""
                    }`}
                  >
                    <div className={`p-2 rounded-full shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{n.title}</p>
                        {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
