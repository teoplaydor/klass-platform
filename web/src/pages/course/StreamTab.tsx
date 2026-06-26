// Вкладка «Лента»: блок «Скоро сдавать», композер объявления, поток постов.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { del, get, patch, post } from '../../api';
import { useBrand } from '../../brand';
import { useUser } from '../../auth';
import {
  AttachmentList,
  AttachmentPicker,
  Avatar,
  Empty,
  Menu,
  Spinner,
  usePendingAttachments,
  useToast,
} from '../../components/ui';
import { Comments } from '../../components/Comments';
import type { Announcement, Course, Coursework } from '../../types';
import { formatDateTime, formatDue, fromLocalInput, shortName } from '../../utils';

function Composer({ course, onPosted }: { course: Course; onPosted: () => void }) {
  const brand = useBrand();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const pending = usePendingAttachments();

  const publish = async (state: 'PUBLISHED' | 'SCHEDULED' | 'DRAFT') => {
    setBusy(true);
    try {
      await post(`/api/courses/${course.id}/announcements`, {
        text,
        state,
        scheduledAt: state === 'SCHEDULED' ? fromLocalInput(scheduledAt) : undefined,
        attachments: pending.payload,
      });
      setText('');
      setExpanded(false);
      setShowSchedule(false);
      setScheduledAt('');
      pending.reset();
      toast.success(
        state === 'PUBLISHED' ? 'Объявление опубликовано' : state === 'SCHEDULED' ? 'Публикация запланирована' : 'Черновик сохранён',
      );
      onPosted();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <div className="card card-pad row" style={{ cursor: 'text' }} onClick={() => setExpanded(true)}>
        <span className="muted">Напишите объявление для курса…</span>
      </div>
    );
  }

  const isTeacher = course.role === 'TEACHER';

  return (
    <div className="card card-pad stack">
      <textarea
        className="textarea"
        autoFocus
        placeholder="Текст объявления"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <AttachmentPicker pending={pending} />
      {showSchedule && (
        <input
          className="input"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          style={{ maxWidth: 260 }}
        />
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            setExpanded(false);
            pending.reset();
          }}
          disabled={busy}
        >
          Отмена
        </button>
        {isTeacher && brand.features.scheduling && !showSchedule && (
          <button className="btn btn-secondary" onClick={() => setShowSchedule(true)} disabled={busy}>
            Запланировать
          </button>
        )}
        {showSchedule ? (
          <button className="btn" onClick={() => void publish('SCHEDULED')} disabled={busy || !text.trim() || !scheduledAt}>
            Запланировать публикацию
          </button>
        ) : (
          <button className="btn" onClick={() => void publish('PUBLISHED')} disabled={busy || !text.trim()}>
            Опубликовать
          </button>
        )}
      </div>
    </div>
  );
}

export function StreamTab({ course }: { course: Course }) {
  const user = useUser();
  const toast = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [upcoming, setUpcoming] = useState<Coursework[]>([]);

  const isTeacher = course.role === 'TEACHER';
  const isActive = course.state === 'ACTIVE';
  const canPost = isActive && (isTeacher || course.stream_mode === 'ALL_POST');
  const canComment = isActive && (isTeacher || course.stream_mode !== 'TEACHERS_ONLY');

  const load = () =>
    get<{ announcements: Announcement[] }>(`/api/courses/${course.id}/announcements`)
      .then((r) => setAnnouncements(r.announcements))
      .catch(toast.error);

  useEffect(() => {
    void load();
    get<{ coursework: Coursework[] }>(`/api/courses/${course.id}/coursework`)
      .then((r) => {
        const soon = r.coursework
          .filter((cw) => cw.state === 'PUBLISHED' && cw.type !== 'MATERIAL' && cw.due_at && Date.parse(cw.due_at) > Date.now())
          .sort((a, b) => (a.due_at! < b.due_at! ? -1 : 1))
          .slice(0, 5);
        setUpcoming(soon);
      })
      .catch(() => {});
  }, [course.id]);

  const removeAnnouncement = async (id: number) => {
    try {
      await del(`/api/announcements/${id}`);
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const togglePin = async (id: number) => {
    try {
      await post(`/api/announcements/${id}/pin`);
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  if (!announcements) return <Spinner />;

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 200px' }} className="card card-pad">
        <h3 style={{ fontSize: 14 }}>Скоро сдавать</h3>
        {upcoming.length === 0 ? (
          <p className="small faint mt-8">Ближайших сроков нет</p>
        ) : (
          <div className="stack mt-8" style={{ gap: 10 }}>
            {upcoming.map((cw) => (
              <div key={cw.id} className="small">
                <Link to={`/courses/${course.id}/coursework/${cw.id}`}>{cw.title}</Link>
                <div className="faint">{formatDue(cw.due_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }} className="stack">
        {canPost && <Composer course={course} onPosted={() => void load()} />}
        {announcements.length === 0 && (
          <Empty>В ленте курса пока нет объявлений.</Empty>
        )}
        {announcements.map((a) => (
          <div key={a.id} className="card card-pad">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar person={a.author} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row">
                  <strong className="small">{shortName(a.author)}</strong>
                  <span className="small faint">{formatDateTime(a.created_at)}</span>
                  {a.pinned === 1 && <span className="badge badge-primary">Закреплено</span>}
                  {a.state === 'DRAFT' && <span className="badge">Черновик</span>}
                  {a.state === 'SCHEDULED' && (
                    <span className="badge badge-warn">
                      Запланировано{a.scheduled_at ? `: ${formatDateTime(a.scheduled_at)}` : ''}
                    </span>
                  )}
                </div>
                <div className="pre-wrap mt-8">{a.text}</div>
                <div className="mt-8">
                  <AttachmentList attachments={a.attachments} />
                </div>
              </div>
              {(isTeacher || a.author.id === user.id) && (
                <Menu
                  items={[
                    ...(isTeacher && a.state === 'PUBLISHED'
                      ? [{ label: a.pinned ? 'Открепить' : 'Закрепить', onClick: () => void togglePin(a.id) }]
                      : []),
                    { label: 'Удалить', onClick: () => void removeAnnouncement(a.id), danger: true },
                  ]}
                />
              )}
            </div>
            {a.state === 'PUBLISHED' && (
              <Comments
                scope="ANNOUNCEMENT"
                scopeId={a.id}
                canComment={canComment}
                canModerate={isTeacher}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
