// Планировщик: публикует отложенные задания и объявления, когда подходит время.
// Опрос каждые 30 секунд — достаточно для учебного сценария и не нагружает БД.
import { all, get, run, now } from './db.js';
import { notify } from '../modules/notifications/service.js';
import { studentIds } from './access.js';
import { audienceOf, type CourseworkRow } from '../modules/coursework/routes.js';

function sweep(): void {
  const ts = now();

  for (const cw of all<CourseworkRow>(
    "SELECT * FROM coursework WHERE state = 'SCHEDULED' AND scheduled_at <= ?",
    ts,
  )) {
    run("UPDATE coursework SET state = 'PUBLISHED', scheduled_at = NULL, updated_at = ? WHERE id = ?", ts, cw.id);
    const course = get<{ name: string }>('SELECT name FROM courses WHERE id = ?', cw.course_id);
    notify(audienceOf(cw), {
      type: 'NEW_COURSEWORK',
      title: `Новое задание в курсе «${course?.name ?? ''}»`,
      body: cw.title,
      link: `/courses/${cw.course_id}/coursework/${cw.id}`,
    });
  }

  for (const a of all<{ id: number; course_id: number; author_id: number; text: string }>(
    "SELECT id, course_id, author_id, text FROM announcements WHERE state = 'SCHEDULED' AND scheduled_at <= ?",
    ts,
  )) {
    run("UPDATE announcements SET state = 'PUBLISHED', scheduled_at = NULL, updated_at = ? WHERE id = ?", ts, a.id);
    const course = get<{ name: string }>('SELECT name FROM courses WHERE id = ?', a.course_id);
    notify(studentIds(a.course_id).filter((id) => id !== a.author_id), {
      type: 'NEW_ANNOUNCEMENT',
      title: `Объявление в курсе «${course?.name ?? ''}»`,
      body: a.text.slice(0, 200),
      link: `/courses/${a.course_id}`,
    });
  }
}

export function startScheduler(): void {
  sweep();
  const timer = setInterval(() => {
    try {
      sweep();
    } catch (e) {
      console.error('Ошибка планировщика:', e);
    }
  }, 30_000);
  timer.unref();
}
