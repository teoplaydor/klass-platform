// Вкладка «Оценки»: журнал «ученики × задания» для преподавателя,
// сводка своих оценок для ученика. Шкала отображения — настройка курса.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../../api';
import { Empty, Spinner, useToast } from '../../components/ui';
import type { Course, PersonRef } from '../../types';
import { formatDate, formatGrade, shortName } from '../../utils';

interface WorkCol {
  id: number;
  title: string;
  max_points: number | null;
  due_at: string | null;
  type: string;
}

interface Cell {
  coursework_id: number;
  student_id?: number;
  state: string;
  grade: number | null;
  draft_grade?: number | null;
  turned_in_at: string | null;
}

interface GradesResponse {
  role: 'TEACHER' | 'STUDENT';
  works: WorkCol[];
  students?: PersonRef[];
  cells: Cell[];
}

export function GradesTab({ course }: { course: Course }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<GradesResponse | null>(null);

  useEffect(() => {
    get<GradesResponse>(`/api/courses/${course.id}/grades`)
      .then(setData)
      .catch(toast.error);
  }, [course.id]);

  if (!data) return <Spinner />;
  if (data.works.length === 0) return <Empty>Оцениваемых заданий пока нет.</Empty>;

  const scale = course.grade_scale;

  if (data.role === 'STUDENT') {
    const byWork = new Map(data.cells.map((c) => [c.coursework_id, c]));
    const graded = data.works.filter((w) => byWork.get(w.id)?.grade !== null && byWork.get(w.id)?.grade !== undefined);
    const totalEarned = graded.reduce((sum, w) => sum + (byWork.get(w.id)?.grade ?? 0), 0);
    const totalMax = graded.reduce((sum, w) => sum + (w.max_points ?? 0), 0);

    return (
      <div className="card">
        {data.works.map((w) => {
          const cell = byWork.get(w.id);
          return (
            <div key={w.id} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/courses/${course.id}/coursework/${w.id}`}>{w.title}</Link>
                <div className="small faint">{w.due_at ? `Срок: ${formatDate(w.due_at)}` : 'Без срока'}</div>
              </div>
              <div style={{ fontWeight: 600 }}>
                {cell?.state === 'RETURNED' ? formatGrade(cell.grade, w.max_points, scale) : '—'}
              </div>
            </div>
          );
        })}
        {totalMax > 0 && (
          <div className="list-row" style={{ background: 'var(--color-bg)' }}>
            <div style={{ flex: 1, fontWeight: 600 }}>Итог по проверенным работам</div>
            <div style={{ fontWeight: 600 }}>{formatGrade(totalEarned, totalMax, scale)}</div>
          </div>
        )}
      </div>
    );
  }

  // Журнал преподавателя
  const students = data.students ?? [];
  const cellMap = new Map(data.cells.map((c) => [`${c.student_id}:${c.coursework_id}`, c]));

  const classAvg = (w: WorkCol): string => {
    const grades = students
      .map((s) => cellMap.get(`${s.id}:${w.id}`))
      .filter((c): c is Cell => !!c && c.grade !== null && c.state === 'RETURNED')
      .map((c) => c.grade!);
    if (grades.length === 0) return '—';
    const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
    return formatGrade(Math.round(avg * 10) / 10, w.max_points, scale);
  };

  return (
    <div className="card grades-table-wrap">
      <table className="grades-table">
        <thead>
          <tr>
            <th className="sticky-col">Ученик</th>
            {data.works.map((w) => (
              <th key={w.id} style={{ maxWidth: 140 }}>
                <Link to={`/courses/${course.id}/coursework/${w.id}/review`} title={w.title}>
                  <span style={{ display: 'block', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.title}
                  </span>
                </Link>
                <span className="faint" style={{ fontWeight: 400 }}>
                  {w.max_points ? `из ${w.max_points}` : 'без баллов'}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky-col" style={{ fontWeight: 400 }} >
              <span className="muted">Среднее по классу</span>
            </th>
            {data.works.map((w) => (
              <td key={w.id} className="muted">
                {classAvg(w)}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id}>
              <td className="sticky-col">{shortName(s)}</td>
              {data.works.map((w) => {
                const cell = cellMap.get(`${s.id}:${w.id}`);
                const style =
                  cell?.state === 'RETURNED'
                    ? { background: 'var(--color-ok-soft)', cursor: 'pointer' }
                    : cell?.state === 'TURNED_IN'
                      ? { background: 'var(--color-primary-soft)', cursor: 'pointer' }
                      : { cursor: 'pointer' };
                return (
                  <td
                    key={w.id}
                    style={style}
                    title={cell?.state === 'TURNED_IN' ? 'Сдано, ожидает проверки' : undefined}
                    onClick={() => navigate(`/courses/${course.id}/coursework/${w.id}/review?student=${s.id}`)}
                  >
                    {cell?.state === 'RETURNED'
                      ? formatGrade(cell.grade, w.max_points, scale)
                      : cell?.state === 'TURNED_IN'
                        ? 'сдано'
                        : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
