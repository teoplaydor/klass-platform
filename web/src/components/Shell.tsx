// Каркас интерфейса: верхняя панель, боковое меню, уведомления.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useBrand } from '../brand';
import { useAuth } from '../auth';
import { useToast } from './ui';
import type { Course, Notification } from '../types';
import { formatDateTime, initials } from '../utils';

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = () =>
    get<{ notifications: Notification[]; unreadCount: number }>('/api/notifications')
      .then((r) => {
        setItems(r.notifications);
        setUnread(r.unreadCount);
      })
      .catch(() => {});

  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openPanel = async () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      await post('/api/notifications/read').catch(() => {});
      setUnread(0);
    }
  };

  return (
    <div className="menu-wrap" ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={openPanel} aria-label="Уведомления" style={{ position: 'relative' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-dot" />}
      </button>
      {open && (
        <div className="notif-panel">
          {items.length === 0 && <div className="empty">Уведомлений нет</div>}
          {items.map((n) => (
            <a
              key={n.id}
              className={n.is_read ? 'notif-item' : 'notif-item unread'}
              style={{ cursor: n.link ? 'pointer' : 'default' }}
              onClick={() => {
                setOpen(false);
                if (n.link) navigate(n.link);
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 14 }}>{n.title}</div>
              {n.body && <div className="small muted">{n.body}</div>}
              <div className="small faint">{formatDateTime(n.created_at)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const brand = useBrand();
  const { user, setUser } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    get<{ courses: Course[] }>('/api/courses')
      .then((r) => setCourses(r.courses))
      .catch(() => {});
  }, []);

  const logout = async () => {
    try {
      await post('/api/auth/logout');
      setUser(null);
      navigate('/');
    } catch (e) {
      toast.error(e);
    }
  };

  const teaching = courses.filter((c) => c.role === 'TEACHER');
  const studying = courses.filter((c) => c.role === 'STUDENT');

  return (
    <>
      <header className="topbar">
        <Link to="/" className="topbar-logo">
          <span className="logo-mark">{brand.product.logoText}</span>
          {brand.product.name}
        </Link>
        <div style={{ flex: 1 }} />
        {brand.features.notifications && <NotificationsBell />}
        <Link to="/profile" className="avatar" title={user ? `${user.last_name} ${user.first_name}` : ''} style={{ width: 36, height: 36 }}>
          {user ? initials(user) : ''}
        </Link>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Выйти
        </button>
      </header>
      <div className="layout">
        <nav className="sidebar">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
            Курсы
          </NavLink>
          {brand.features.todo && (
            <NavLink to="/todo" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
              Список дел
            </NavLink>
          )}
          {brand.features.calendar && (
            <NavLink to="/calendar" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
              Календарь
            </NavLink>
          )}
          {teaching.length > 0 && (
            <>
              <div className="sidebar-section">Преподавание</div>
              {teaching.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/courses/${c.id}`}
                  className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
                >
                  {c.name}
                  {c.section ? ` · ${c.section}` : ''}
                </NavLink>
              ))}
            </>
          )}
          {studying.length > 0 && (
            <>
              <div className="sidebar-section">Обучение</div>
              {studying.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/courses/${c.id}`}
                  className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
                >
                  {c.name}
                  {c.section ? ` · ${c.section}` : ''}
                </NavLink>
              ))}
            </>
          )}
          <hr className="sidebar-divider" />
          {brand.features.archive && (
            <NavLink to="/archive" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
              Архив
            </NavLink>
          )}
        </nav>
        <main className="content">{children}</main>
      </div>
    </>
  );
}
