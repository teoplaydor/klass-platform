// Страница курса: баннер, вкладки Лента / Задания / Участники / Оценки.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { del, get, patch, post } from '../api';
import { courseColor, useBrand } from '../brand';
import { Field, Menu, Modal, Spinner, useToast } from '../components/ui';
import type { Course } from '../types';
import { StreamTab } from './course/StreamTab';
import { ClassworkTab } from './course/ClassworkTab';
import { PeopleTab } from './course/PeopleTab';
import { GradesTab } from './course/GradesTab';

function CourseSettingsModal({
  course,
  onClose,
  onSaved,
}: {
  course: Course;
  onClose: () => void;
  onSaved: (c: Course) => void;
}) {
  const brand = useBrand();
  const toast = useToast();
  const [name, setName] = useState(course.name);
  const [section, setSection] = useState(course.section ?? '');
  const [subject, setSubject] = useState(course.subject ?? '');
  const [room, setRoom] = useState(course.room ?? '');
  const [description, setDescription] = useState(course.description ?? '');
  const [themeColor, setThemeColor] = useState(course.theme_color);
  const [streamMode, setStreamMode] = useState(course.stream_mode);
  const [gradeScale, setGradeScale] = useState(course.grade_scale);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await patch<{ course: Course }>(`/api/courses/${course.id}`, {
        name, section, subject, room, description, themeColor, streamMode, gradeScale,
      });
      toast.success('Настройки сохранены');
      onSaved(r.course);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Настройки курса"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" onClick={save} disabled={busy || !name.trim()}>
            Сохранить
          </button>
        </>
      }
    >
      <Field label="Название">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Класс или группа">
            <input className="input" value={section} onChange={(e) => setSection(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Предмет">
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Аудитория">
            <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Описание">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Цвет курса">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {Object.entries(brand.theme.courseColors).map(([key, color]) => (
            <button
              key={key}
              type="button"
              onClick={() => setThemeColor(key)}
              aria-label={key}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: color,
                border: themeColor === key ? '3px solid var(--color-text)' : '3px solid transparent',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </Field>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Лента курса">
            <select className="select" value={streamMode} onChange={(e) => setStreamMode(e.target.value as Course['stream_mode'])}>
              <option value="ALL_POST">Ученики публикуют и комментируют</option>
              <option value="COMMENT_ONLY">Ученики только комментируют</option>
              <option value="TEACHERS_ONLY">Публикуют только преподаватели</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Шкала оценок (отображение)">
            <select className="select" value={gradeScale} onChange={(e) => setGradeScale(e.target.value as Course['grade_scale'])}>
              <option value="FIVE">Пятибалльная</option>
              <option value="POINTS">Баллы</option>
              <option value="PERCENT">Проценты</option>
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function CoursePage() {
  const { courseId } = useParams();
  const brand = useBrand();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tab = params.get('tab') ?? 'stream';
  const setTab = (t: string) => setParams(t === 'stream' ? {} : { tab: t });

  const load = useCallback(() => {
    get<{ course: Course }>(`/api/courses/${courseId}`)
      .then((r) => setCourse(r.course))
      .catch((e) => {
        toast.error(e);
        navigate('/');
      });
  }, [courseId]);

  useEffect(() => {
    setCourse(null);
    void load();
  }, [load]);

  if (!course) return <Spinner />;

  const isTeacher = course.role === 'TEACHER';

  const resetCode = async () => {
    try {
      await post<{ enrollmentCode: string }>(`/api/courses/${course.id}/code/reset`);
      toast.success('Код курса обновлён');
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(course.enrollment_code);
    toast.success('Код скопирован в буфер обмена');
  };

  const archiveCourse = async () => {
    try {
      await post(`/api/courses/${course.id}/archive`);
      toast.success('Курс перемещён в архив');
      navigate('/');
    } catch (e) {
      toast.error(e);
    }
  };

  const copyCourse = async () => {
    try {
      const r = await post<{ course: Course }>(`/api/courses/${course.id}/copy`);
      toast.success('Создана копия курса (задания — в черновиках)');
      navigate(`/courses/${r.course.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  const tabs: { key: string; label: string; visible: boolean }[] = [
    { key: 'stream', label: 'Лента', visible: true },
    { key: 'classwork', label: 'Задания', visible: true },
    { key: 'people', label: 'Участники', visible: true },
    { key: 'grades', label: 'Оценки', visible: brand.features.grades },
  ];

  return (
    <div className="content-narrow">
      <div className="course-banner" style={{ background: courseColor(brand, course.theme_color) }}>
        <div className="row-between">
          <div>
            <h1>{course.name}</h1>
            <div className="muted-inverse">
              {[course.section, course.subject, course.room].filter(Boolean).join(' · ')}
            </div>
            {course.state === 'ARCHIVED' && (
              <div className="mt-8">
                <span className="badge badge-warn">Курс в архиве — только просмотр</span>
              </div>
            )}
          </div>
          {isTeacher && (
            <Menu
              items={[
                { label: 'Настройки курса', onClick: () => setSettingsOpen(true) },
                { label: 'Скопировать код приглашения', onClick: () => void copyCode() },
                { label: 'Сбросить код приглашения', onClick: () => void resetCode() },
                { label: 'Создать копию курса', onClick: () => void copyCourse() },
                ...(brand.features.archive && course.state === 'ACTIVE'
                  ? [{ label: 'В архив', onClick: () => void archiveCourse(), danger: true }]
                  : []),
              ]}
            />
          )}
        </div>
        {isTeacher && course.enrollment_code && (
          <div className="mt-8 muted-inverse small">
            Код курса: <strong style={{ letterSpacing: '0.08em' }}>{course.enrollment_code}</strong>
          </div>
        )}
      </div>

      <div className="tabs card mb-16" style={{ borderRadius: 'var(--radius)' }}>
        {tabs
          .filter((t) => t.visible)
          .map((t) => (
            <button key={t.key} className={tab === t.key ? 'tab active' : 'tab'} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'stream' && <StreamTab course={course} />}
      {tab === 'classwork' && <ClassworkTab course={course} />}
      {tab === 'people' && <PeopleTab course={course} />}
      {tab === 'grades' && brand.features.grades && <GradesTab course={course} />}

      {settingsOpen && (
        <CourseSettingsModal
          course={course}
          onClose={() => setSettingsOpen(false)}
          onSaved={(c) => {
            setCourse(c);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
