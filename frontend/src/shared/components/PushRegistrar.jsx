import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getSession, roleFromPath } from '@/shared/constants/authRoles';
import { registerPushToken, onForegroundPush } from '@/shared/lib/push';
import { useToast } from '@/shared/context/ToastContext';

// Renders nothing. Registers the browser for web push once a portal session exists, and shows foreground pushes as toasts.
export default function PushRegistrar() {
  const { pathname } = useLocation();
  const toast = useToast();
  const role = roleFromPath(pathname);
  const loggedIn = Boolean(role && getSession(role).token);

  useEffect(() => { if (loggedIn) registerPushToken(); }, [loggedIn, role]);

  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    onForegroundPush((p) => {
      const { title, body } = p.notification || {};
      if (title) toast.success(body ? `${title} — ${body}` : title);
    }).then((fn) => (cancelled ? fn?.() : (off = fn)));
    return () => { cancelled = true; off?.(); };
  }, [toast]);

  return null;
}
