// Календарь: недельная сетка дедлайнов по всем курсам.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { courseColor, useBrand } from '../brand';
import { Spinner, useToast } from '../components/ui';

interface CalEvent {
  courseworkId: number;
  courseId: number;
  courseName: string;
  courseColor: string;
  title: string;
  dueAt: string;
  role: 'TEACHER' | 'STUDENT';
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // понедельник = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

export function CalendarPage() {
  const brand = useBrand();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<CalEvent[] | null>(null);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);

  useEffect(() => {
    setEvents(null);
    get<{ events: CalEvent[] }>(
      `/api/calendar?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`,
    )
      .then((r) => setEvents(r.events))
      .catch(toast.error);
  }, [weekStart, weekEnd]);

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
  const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString();

  return (
    <div className="content-narrow">
      <div className="row-between mb-16">
        <h1>Календарь</h1>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={() => shiftWeek(-1)}>
            ← Неделя
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Сегодня
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => shiftWeek(1)}>
            Неделя →
          </button>
        </div>
      </div>
      <p className="muted small mb-16">
        {fmt.format(weekStart)} — {fmt.format(new Date(weekEnd.getTime() - 1))}
      </p>

      {!events ? (
        <Spinner />
      ) : (
        <div className="stack">
          {days.map((day, i) => {
            const dayEvents = events.filter((e) => new Date(e.dueAt).toDateString() === day.toDateString());
            const isToday = day.toDateString() === today;
            return (
              <div key={i} className="card">
                <div
                  className="list-row"
                  style={{ background: isToday ? 'var(--color-primary-soft)' : 'var(--color-bg)', fontWeight: 600 }}
                >
                  {DAY_NAMES[i]}, {fmt.format(day)}
                  {isToday && <span className="badge badge-primary">Сегодня</span>}
                </div>
                {dayEvents.length === 0 ? (
                  <div className="list-row small faint">Нет сроков сдачи</div>
                ) : (
                  dayEvents.map((e) => (
                    <Link
                      key={`${e.courseworkId}-${e.role}`}
                      to={
                        e.role === 'TEACHER'
                          ? `/courses/${e.courseId}/coursework/${e.courseworkId}/review`
                          : `/courses/${e.courseId}/coursework/${e.courseworkId}`
                      }
                      className="list-row"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: courseColor(brand, e.courseColor),
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 500 }}>{e.title}</span>
                        <span className="small faint"> · {e.courseName}</span>
                      </div>
                      <span className="small muted">{timeFmt.format(new Date(e.dueAt))}</span>
                    </Link>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
