// Модуль «Планировщик»: агрегаторы по всем курсам пользователя —
// «Список дел» ученика, «На проверку» учителя и календарь дедлайнов.
import { Router } from 'express';
import { all, get } from '../../core/db.js';
import { forbidden } from '../../core/errors.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { brand } from '../../config.js';
import { audienceOf, visibleToStudent, type CourseworkRow } from '../coursework/routes.js';

export const plannerRouter = Router();
plannerRouter.use(requireAuth);

interface Membership {
  course_id: number;
  role: 'TEACHER' | 'STUDENT';
  name: string;
  theme_color: string;
}

function activeMemberships(userId: number): Membership[] {
  return all<Membership>(
    `SELECT m.course_id, m.role, c.name, c.theme_color FROM course_members m
     JOIN courses c ON c.id = m.course_id WHERE m.user_id = ? AND c.state = 'ACTIVE'`,
    userId,
  );
}

function gradableWork(courseId: number): CourseworkRow[] {
  return all<CourseworkRow>(
    "SELECT * FROM coursework WHERE course_id = ? AND state = 'PUBLISHED' AND type != 'MATERIAL'",
    courseId,
  );
}

plannerRouter.get('/todo', (req, res) => {
  if (!brand.features.todo) throw forbidden('Модуль «Список дел» отключён');
  const user = currentUser(req);
  const memberships = activeMemberships(user.id);

  // Ученик: что назначено и что сделано
  const toSubmit: unknown[] = [];
  const done: unknown[] = [];
  for (const m of memberships.filter((m) => m.role === 'STUDENT')) {
    for (const cw of gradableWork(m.course_id)) {
      if (!visibleToStudent(cw, user.id)) continue;
      const sub = get<{ state: string; grade: number | null; turned_in_at: string | null }>(
        'SELECT state, grade, turned_in_at FROM submissions WHERE coursework_id = ? AND student_id = ?',
        cw.id, user.id,
      );
      const item = {
        courseworkId: cw.id,
        courseId: m.course_id,
        courseName: m.name,
        courseColor: m.theme_color,
        title: cw.title,
        type: cw.type,
        dueAt: cw.due_at,
        maxPoints: cw.max_points,
        submissionState: sub?.state ?? 'ASSIGNED',
        grade: sub?.grade ?? null,
        missing: !!cw.due_at && Date.parse(cw.due_at) < Date.now() && (!sub || (sub.state !== 'TURNED_IN' && sub.state !== 'RETURNED')),
      };
      if (sub && (sub.state === 'TURNED_IN' || sub.state === 'RETURNED')) done.push(item);
      else toSubmit.push(item);
    }
  }
  const byDue = (a: { dueAt: string | null }, b: { dueAt: string | null }) =>
    (a.dueAt ?? '9999') < (b.dueAt ?? '9999') ? -1 : 1;
  (toSubmit as { dueAt: string | null }[]).sort(byDue);

  // Учитель: работы, ожидающие проверки
  const toReview: unknown[] = [];
  for (const m of memberships.filter((m) => m.role === 'TEACHER')) {
    for (const cw of gradableWork(m.course_id)) {
      const turnedIn = get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM submissions WHERE coursework_id = ? AND state = 'TURNED_IN'",
        cw.id,
      )!.n;
      const graded = get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM submissions WHERE coursework_id = ? AND state = 'RETURNED'",
        cw.id,
      )!.n;
      if (turnedIn === 0 && graded === 0) continue;
      toReview.push({
        courseworkId: cw.id,
        courseId: m.course_id,
        courseName: m.name,
        courseColor: m.theme_color,
        title: cw.title,
        type: cw.type,
        dueAt: cw.due_at,
        turnedIn,
        graded,
        assigned: audienceOf(cw).length,
      });
    }
  }
  (toReview as { dueAt: string | null }[]).sort(byDue);

  res.json({ toSubmit, done, toReview });
});

plannerRouter.get('/calendar', (req, res) => {
  if (!brand.features.calendar) throw forbidden('Календарь отключён');
  const user = currentUser(req);
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  const fromTs = Date.parse(from);
  const toTs = Date.parse(to);
  if (Number.isNaN(fromTs) || Number.isNaN(toTs)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите параметры from и to (ISO 8601)' } });
    return;
  }

  const events: unknown[] = [];
  for (const m of activeMemberships(user.id)) {
    for (const cw of gradableWork(m.course_id)) {
      if (!cw.due_at) continue;
      const due = Date.parse(cw.due_at);
      if (due < fromTs || due > toTs) continue;
      if (m.role === 'STUDENT' && !visibleToStudent(cw, user.id)) continue;
      events.push({
        courseworkId: cw.id,
        courseId: m.course_id,
        courseName: m.name,
        courseColor: m.theme_color,
        title: cw.title,
        type: cw.type,
        dueAt: cw.due_at,
        role: m.role,
      });
    }
  }
  (events as { dueAt: string }[]).sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));
  res.json({ events });
});
