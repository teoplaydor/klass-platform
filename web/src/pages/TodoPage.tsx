// «Список дел»: агрегатор по всем курсам — что сдать (ученик)
// и что проверить (преподаватель). Роли смешиваются: один человек
// может быть учителем в одном курсе и учеником в другом.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { courseColor, useBrand } from '../brand';
import { Empty, Spinner, useToast } from '../components/ui';
import type { TodoItem } from '../types';
import { SUBMISSION_STATE_LABEL, formatDue } from '../utils';

function CourseDot({ color }: { color: string }) {
  const brand = useBrand();
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: courseColor(brand, color),
        flexShrink: 0,
      }}
    />
  );
}

export function TodoPage() {
  const toast = useToast();
  const [data, setData] = useState<{ toSubmit: TodoItem[]; done: TodoItem[]; toReview: TodoItem[] } | null>(null);
  const [tab, setTab] = useState<'assigned' | 'done' | 'review'>('assigned');

  useEffect(() => {
    get<{ toSubmit: TodoItem[]; done: TodoItem[]; toReview: TodoItem[] }>('/api/todo')
      .then((r) => {
        setData(r);
        if (r.toSubmit.length === 0 && r.toReview.length > 0) setTab('review');
      })
      .catch(toast.error);
  }, []);

  if (!data) return <Spinner />;

  const hasStudent = data.toSubmit.length > 0 || data.done.length > 0;
  const hasTeacher = data.toReview.length > 0;

  const Row = ({ item, review }: { item: TodoItem; review?: boolean }) => (
    <Link
      to={
        review
          ? `/courses/${item.courseId}/coursework/${item.courseworkId}/review`
          : `/courses/${item.courseId}/coursework/${item.courseworkId}`
      }
      className="list-row"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <CourseDot color={item.courseColor} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{item.title}</div>
        <div className="small faint">
          {item.courseName} · {formatDue(item.dueAt)}
        </div>
      </div>
      {review ? (
        <span className="small muted">
          {item.turnedIn} сдано · {item.graded} проверено · {item.assigned} назначено
        </span>
      ) : item.missing ? (
        <span className="badge badge-danger">Не сдано</span>
      ) : item.submissionState && item.submissionState !== 'ASSIGNED' ? (
        <span className={item.submissionState === 'RETURNED' ? 'badge badge-ok' : 'badge badge-primary'}>
          {SUBMISSION_STATE_LABEL[item.submissionState]}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div className="content-narrow">
      <h1 className="mb-16">Список дел</h1>
      <div className="tabs card mb-16">
        {hasStudent || !hasTeacher ? (
          <>
            <button className={tab === 'assigned' ? 'tab active' : 'tab'} onClick={() => setTab('assigned')}>
              Назначено ({data.toSubmit.length})
            </button>
            <button className={tab === 'done' ? 'tab active' : 'tab'} onClick={() => setTab('done')}>
              Сделано ({data.done.length})
            </button>
          </>
        ) : null}
        {hasTeacher && (
          <button className={tab === 'review' ? 'tab active' : 'tab'} onClick={() => setTab('review')}>
            На проверку ({data.toReview.length})
          </button>
        )}
      </div>

      {tab === 'assigned' &&
        (data.toSubmit.length === 0 ? (
          <Empty>Всё сдано — назначенных работ нет.</Empty>
        ) : (
          <div className="card">
            {data.toSubmit.map((i) => (
              <Row key={`${i.courseworkId}`} item={i} />
            ))}
          </div>
        ))}
      {tab === 'done' &&
        (data.done.length === 0 ? (
          <Empty>Сданных работ пока нет.</Empty>
        ) : (
          <div className="card">
            {data.done.map((i) => (
              <Row key={`${i.courseworkId}`} item={i} />
            ))}
          </div>
        ))}
      {tab === 'review' &&
        (data.toReview.length === 0 ? (
          <Empty>Работ на проверку нет.</Empty>
        ) : (
          <div className="card">
            {data.toReview.map((i) => (
              <Row key={`${i.courseworkId}`} item={i} review />
            ))}
          </div>
        ))}
    </div>
  );
}
