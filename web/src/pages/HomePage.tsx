// Главная: сетка карточек курсов, создание и вступление по коду.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { del, get, post } from '../api';
import { courseColor, useBrand } from '../brand';
import { useUser } from '../auth';
import { Empty, Field, Menu, Modal, Spinner, useToast } from '../components/ui';
import type { Course } from '../types';
import { shortName } from '../utils';

function CreateCourseModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Course) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ course: Course }>('/api/courses', { name, section, subject, room });
      onCreated(r.course);
      toast.success('Курс создан');
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Создать курс"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" form="create-course" disabled={busy || !name.trim()}>
            Создать
          </button>
        </>
      }
    >
      <form id="create-course" onSubmit={submit}>
        <Field label="Название курса">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Класс или группа (необязательно)">
          <input className="input" value={section} onChange={(e) => setSection(e.target.value)} placeholder="Например: 9 «Б»" />
        </Field>
        <Field label="Предмет (необязательно)">
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Аудитория (необязательно)">
          <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function JoinCourseModal({ onClose, onJoined }: { onClose: () => void; onJoined: (c: Course) => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ course: Course }>('/api/courses/join', { code });
      onJoined(r.course);
      toast.success('Вы присоединились к курсу');
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Присоединиться к курсу"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" form="join-course" disabled={busy || code.trim().length < 5}>
            Присоединиться
          </button>
        </>
      }
    >
      <form id="join-course" onSubmit={submit}>
        <p className="muted small mb-16">Введите код курса, который вам сообщил преподаватель.</p>
        <Field label="Код курса">
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Например: ALG9B24"
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  );
}

export function HomePage() {
  const brand = useBrand();
  const user = useUser();
  const toast = useToast();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);

  const load = () =>
    get<{ courses: Course[] }>('/api/courses')
      .then((r) => setCourses(r.courses))
      .catch(toast.error);

  useEffect(() => {
    void load();
  }, []);

  const archive = async (id: number) => {
    try {
      await post(`/api/courses/${id}/archive`);
      toast.success('Курс перемещён в архив');
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const leave = async (c: Course) => {
    try {
      await del(`/api/courses/${c.id}/members/${user.id}`);
      toast.success('Вы покинули курс');
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  if (!courses) return <Spinner />;

  const canCreate = brand.features.courseCreationByAnyone || user.global_role === 'ADMIN';

  return (
    <div>
      <div className="row-between mb-16">
        <h1>Мои курсы</h1>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => setModal('join')}>
            Присоединиться
          </button>
          {canCreate && (
            <button className="btn" onClick={() => setModal('create')}>
              Создать курс
            </button>
          )}
        </div>
      </div>

      {courses.length === 0 ? (
        <Empty>
          Курсов пока нет. Создайте курс или присоединитесь по коду, который сообщил преподаватель.
        </Empty>
      ) : (
        <div className="course-grid">
          {courses.map((c) => (
            <div key={c.id} className="card course-card">
              <div className="course-card-head" style={{ background: courseColor(brand, c.theme_color) }}>
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <div className="course-card-title">
                      <Link to={`/courses/${c.id}`}>{c.name}</Link>
                    </div>
                    <div className="course-card-section">
                      {[c.section, c.subject].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Menu
                    items={
                      c.role === 'TEACHER'
                        ? [
                            { label: 'Открыть', onClick: () => navigate(`/courses/${c.id}`) },
                            ...(brand.features.archive
                              ? [{ label: 'В архив', onClick: () => void archive(c.id), danger: true }]
                              : []),
                          ]
                        : [
                            { label: 'Открыть', onClick: () => navigate(`/courses/${c.id}`) },
                            { label: 'Покинуть курс', onClick: () => void leave(c), danger: true },
                          ]
                    }
                  />
                </div>
              </div>
              <div className="course-card-body">
                {c.teachers.length > 0 && <div>{c.teachers.map((t) => shortName({ ...t, id: 0 })).join(', ')}</div>}
                <div className="mt-8 faint">
                  {c.role === 'TEACHER' ? 'Вы преподаватель' : 'Вы ученик'} · {c.studentsCount} уч.
                </div>
              </div>
              <div className="course-card-foot">
                <Link to={`/courses/${c.id}?tab=grades`} className="btn btn-ghost btn-sm">
                  Оценки
                </Link>
                <Link to={`/courses/${c.id}?tab=classwork`} className="btn btn-ghost btn-sm">
                  Задания
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'create' && (
        <CreateCourseModal
          onClose={() => setModal(null)}
          onCreated={(c) => {
            setModal(null);
            navigate(`/courses/${c.id}`);
          }}
        />
      )}
      {modal === 'join' && (
        <JoinCourseModal
          onClose={() => setModal(null)}
          onJoined={(c) => {
            setModal(null);
            navigate(`/courses/${c.id}`);
          }}
        />
      )}
    </div>
  );
}
