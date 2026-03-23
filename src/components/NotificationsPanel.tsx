import { useState, useEffect, useRef } from 'react';
import { Bell, PackageCheck, TrendingDown, Tag, PackageX, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Notification } from '../lib/types';

interface NotificationsPanelProps {
  userId: string;
}

const iconFor = (type: Notification['type']) => {
  switch (type) {
    case 'back_in_stock': return <PackageCheck className="w-4 h-4 text-green-600" />;
    case 'out_of_stock':  return <PackageX className="w-4 h-4 text-gray-500" />;
    case 'on_sale':       return <Tag className="w-4 h-4 text-red-500" />;
    case 'price_drop':    return <TrendingDown className="w-4 h-4 text-blue-500" />;
  }
};

const bgFor = (type: Notification['type']) => {
  switch (type) {
    case 'back_in_stock': return 'bg-green-50';
    case 'out_of_stock':  return 'bg-gray-50';
    case 'on_sale':       return 'bg-red-50';
    case 'price_drop':    return 'bg-blue-50';
  }
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPanel({ userId }: NotificationsPanelProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
  }, [userId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setNotifications(data as unknown as Notification[]);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const dismiss = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) markAllRead();
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Alerts</h3>
            {notifications.length > 0 && (
              <button
                onClick={() => {
                  notifications.forEach((n) => dismiss(n.id));
                }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No alerts yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Refresh products to check for price drops and stock changes
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start space-x-3 px-4 py-3 ${bgFor(n.type as Notification['type'])}`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {iconFor(n.type as Notification['type'])}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  <button
                    onClick={() => dismiss(n.id)}
                    className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors mt-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
