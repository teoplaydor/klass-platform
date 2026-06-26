// Вкладка «Задания»: группировка по темам, создание заданий и тем.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { del, get, post } from '../../api';
import { useBrand } from '../../brand';
import { Empty, Field, Menu, Modal, Spinner, useToast } from '../../components/ui';
import type { Course, Coursework, Topic } from '../../types';
import { COURSEWORK_TYPE_LABEL, formatDue, formatGrade, isOverdue, SUBMISSION_STATE_LABEL } from '../../utils';

function typeIcon(type: string): string {
  // Лаконичные текстовые маркеры вместо иконографики — минимализм и читаемость
  switch (type) {
    case 'QUIZ':
      return 'Т';
    case 'QUESTION':
      return '?';
    case 'MATERIAL':
      return 'М';
    default:
      return 'З';
  }
}

function WorkRow({ course, cw, onChanged }: { course: Course; cw: Coursework; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const isTeacher = course.role === 'TEACHER';

  const remove = async () => {
    try {
      await del(`/api/coursework/${cw.id}`);
      toast.success('Удалено');
      onChanged();
    } catch (e) {
      toast.error(e);
    }
  };

  const publish = async () => {
    try {
      await post(`/api/coursework/${cw.id}/publish`);
      toast.success('Опубликовано');
      onChanged();
    } catch (e) {
      toast.error(e);
    }
  };

  const sub = cw.mySubmission;

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="list-row" style={{ cursor: 'pointer', border: 'none' }} onClick={() => setOpen((v) => !v)}>
        <span
          className="avatar"
          style={{ width: 30, height: 30, fontSize: 12 }}
          title={COURSEWORK_TYPE_LABEL[cw.type]}
        >
          {typeIcon(cw.type)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row">
            <span style={{ fontWeight: 500 }}>{cw.title}</span>
            {cw.state === 'DRAFT' && <span className="badge">Черновик</span>}
            {cw.state === 'SCHEDULED' && <span className="badge badge-warn">Запланировано</span>}
          </div>
          <div className="small faint">
            {cw.type !== 'MATERIAL' ? formatDue(cw.due_at) : 'Материал'}
            {cw.max_points ? ` · ${cw.max_points} б.` : ''}
          </div>
        </div>
        {isTeacher && cw.counters && (
          <div className="small muted" style={{ textAlign: 'right' }}>
            <span title="Сдано">{cw.counters.turnedIn}</span> / <span title="Проверено">{cw.counters.graded}</span> /{' '}
            <span title="Назначено">{cw.counters.assigned}</span>
          </div>
        )}
        {!isTeacher && sub && (
          <span
            className={
              sub.state === 'RETURNED'
                ? 'badge badge-ok'
                : sub.state === 'TURNED_IN'
                  ? 'badge badge-primary'
                  : isOverdue(cw.due_at)
                    ? 'badge badge-danger'
                    : 'badge'
            }
          >
            {sub.state === 'RETURNED' && sub.grade !== null
              ? formatGrade(sub.grade, cw.max_points, course.grade_scale)
              : sub.state === 'ASSIGNED' && isOverdue(cw.due_at)
                ? 'Не сдано'
                : SUBMISSION_STATE_LABEL[sub.state]}
          </span>
        )}
        {isTeacher && (
          <span onClick={(e) => e.stopPropagation()}>
            <Menu
              items={[
                { label: 'Открыть', onClick: () => navigate(`/courses/${course.id}/coursework/${cw.id}`) },
                ...(cw.type !== 'MATERIAL' && cw.state === 'PUBLISHED'
                  ? [{ label: 'Работы учеников', onClick: () => navigate(`/courses/${course.id}/coursework/${cw.id}/review`) }]
                  : []),
                { label: 'Изменить', onClick: () => navigate(`/courses/${course.id}/coursework/${cw.id}/edit`) },
                ...(cw.state !== 'PUBLISHED' ? [{ label: 'Опубликовать', onClick: () => void publish() }] : []),
                { label: 'Удалить', onClick: () => void remove(), danger: true },
              ]}
            />
          </span>
        )}
      </div>
      {open && (
        <div style={{ padding: '0 16px 14px 58px' }}>
          {cw.description && <p className="pre-wrap small muted">{cw.description.slice(0, 400)}{cw.description.length > 400 ? '…' : ''}</p>}
          <div className="row mt-8">
            <Link className="btn btn-ghost btn-sm" to={`/courses/${course.id}/coursework/${cw.id}`}>
              Открыть
            </Link>
            {isTeacher && cw.type !== 'MATERIAL' && cw.state === 'PUBLISHED' && (
              <Link className="btn btn-ghost btn-sm" to={`/courses/${course.id}/coursework/${cw.id}/review`}>
                Проверка работ
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ClassworkTab({ course }: { course: Course }) {
  const brand = useBrand();
  const toast = useToast();
  const navigate = useNavigate();
  const [coursework, setCoursework] = useState<Coursework[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicModal, setTopicModal] = useState(false);
  const [topicName, setTopicName] = useState('');

  const isTeacher = course.role === 'TEACHER';
  const isActive = course.state === 'ACTIVE';

  const load = () =>
    Promise.all([
      get<{ coursework: Coursework[] }>(`/api/courses/${course.id}/coursework`),
      get<{ topics: Topic[] }>(`/api/courses/${course.id}/topics`),
    ])
      .then(([cw, t]) => {
        setCoursework(cw.coursework);
        setTopics(t.topics);
      })
      .catch(toast.error);

  useEffect(() => {
    void load();
  }, [course.id]);

  if (!coursework) return <Spinner />;

  const createTopic = async () => {
    try {
      await post(`/api/courses/${course.id}/topics`, { name: topicName });
      setTopicModal(false);
      setTopicName('');
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const removeTopic = async (id: number) => {
    try {
      await del(`/api/topics/${id}`);
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const noTopic = coursework.filter((cw) => !cw.topic_id);
  const groups = topics.map((t) => ({ topic: t, items: coursework.filter((cw) => cw.topic_id === t.id) }));

  const createItems = [
    { label: 'Задание', onClick: () => navigate(`/courses/${course.id}/coursework/new?type=ASSIGNMENT`) },
    ...(brand.features.quizzes
      ? [{ label: 'Тест с автопроверкой', onClick: () => navigate(`/courses/${course.id}/coursework/new?type=QUIZ`) }]
      : []),
    { label: 'Вопрос', onClick: () => navigate(`/courses/${course.id}/coursework/new?type=QUESTION`) },
    { label: 'Материал', onClick: () => navigate(`/courses/${course.id}/coursework/new?type=MATERIAL`) },
    { label: 'Тема (раздел)', onClick: () => setTopicModal(true) },
  ];

  return (
    <div>
      {isTeacher && isActive && (
        <div className="row mb-16">
          {createItems.slice(0, 4).map((item) => (
            <button key={item.label} className="btn btn-secondary btn-sm" onClick={item.onClick}>
              {item.label}
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setTopicModal(true)}>
            Добавить тему
          </button>
        </div>
      )}

      {coursework.length === 0 && <Empty>Заданий пока нет.</Empty>}

      {noTopic.length > 0 && (
        <div className="card mb-16">
          {noTopic.map((cw) => (
            <WorkRow key={cw.id} course={course} cw={cw} onChanged={() => void load()} />
          ))}
        </div>
      )}

      {groups.map(({ topic, items }) => (
        <div key={topic.id} className="mb-16">
          <div className="row-between" style={{ padding: '0 4px 8px' }}>
            <h2 style={{ color: 'var(--color-primary)' }}>{topic.name}</h2>
            {isTeacher && (
              <Menu items={[{ label: 'Удалить тему', onClick: () => void removeTopic(topic.id), danger: true }]} />
            )}
          </div>
          {items.length === 0 ? (
            <p className="small faint" style={{ padding: '0 4px' }}>
              В теме нет заданий
            </p>
          ) : (
            <div className="card">
              {items.map((cw) => (
                <WorkRow key={cw.id} course={course} cw={cw} onChanged={() => void load()} />
              ))}
            </div>
          )}
        </div>
      ))}

      {topicModal && (
        <Modal
          title="Новая тема"
          onClose={() => setTopicModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setTopicModal(false)}>
                Отмена
              </button>
              <button className="btn" onClick={() => void createTopic()} disabled={!topicName.trim()}>
                Создать
              </button>
            </>
          }
        >
          <Field label="Название темы">
            <input className="input" value={topicName} onChange={(e) => setTopicName(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}
