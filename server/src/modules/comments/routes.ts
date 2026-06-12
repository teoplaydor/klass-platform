// Модуль «Комментарии»: публичные (объявления, задания) и приватные
// (переписка учитель–ученик по конкретной сдаче, scope = SUBMISSION).
import { Router } from 'express';
import { all, get, run, now } from '../../core/db.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { str, oneOf, idParam } from '../../core/validate.js';
import { courseById, memberRole, requireActive, requireMember } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { brand } from '../../config.js';
import { notify } from '../notifications/service.js';
import { courseworkById, visibleToStudent } from '../coursework/routes.js';

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

const SCOPES = ['ANNOUNCEMENT', 'COURSEWORK', 'SUBMISSION'] as const;
type Scope = (typeof SCOPES)[number];

// Проверяет право пользователя видеть ветку комментариев; возвращает контекст.
// Фичефлаги: comments — публичные ветки, privateComments — переписка по сдаче.
function checkScope(scope: Scope, scopeId: number, userId: number): { courseId: number; participants: number[] } {
  if (scope !== 'SUBMISSION' && !brand.features.comments) throw forbidden('Комментарии отключены');
  if (scope === 'ANNOUNCEMENT') {
    const a = get<{ course_id: number; author_id: number; state: string }>(
      'SELECT course_id, author_id, state FROM announcements WHERE id = ?',
      scopeId,
    );
    if (!a) throw notFound('Объявление не найдено');
    const { role } = requireMember(a.course_id, userId);
    if (role === 'STUDENT' && a.state !== 'PUBLISHED') throw notFound('Объявление не найдено');
    return { courseId: a.course_id, participants: [a.author_id] };
  }
  if (scope === 'COURSEWORK') {
    const cw = courseworkById(scopeId);
    const { role } = requireMember(cw.course_id, userId);
    if (role === 'STUDENT' && !visibleToStudent(cw, userId)) throw notFound('Задание не найдено');
    return { courseId: cw.course_id, participants: cw.created_by ? [cw.created_by] : [] };
  }
  // SUBMISSION — приватная ветка
  if (!brand.features.privateComments) throw forbidden('Приватные комментарии отключены');
  const sub = get<{ student_id: number; coursework_id: number }>(
    'SELECT student_id, coursework_id FROM submissions WHERE id = ?',
    scopeId,
  );
  if (!sub) throw notFound('Сдача не найдена');
  const cw = courseworkById(sub.coursework_id);
  const role = memberRole(cw.course_id, userId);
  if (sub.student_id !== userId && role !== 'TEACHER') throw forbidden();
  const teachers = all<{ user_id: number }>(
    "SELECT user_id FROM course_members WHERE course_id = ? AND role = 'TEACHER'",
    cw.course_id,
  ).map((r) => r.user_id);
  return { courseId: cw.course_id, participants: [sub.student_id, ...teachers] };
}

function withAuthor(row: Record<string, unknown>) {
  return {
    ...row,
    author: get('SELECT id, last_name, first_name, middle_name FROM users WHERE id = ?', row.author_id as number),
  };
}

commentsRouter.get('/', (req, res) => {
  const user = currentUser(req);
  const scope = oneOf(req.query as Record<string, unknown>, 'scope', SCOPES);
  const scopeId = idParam(String(req.query.scopeId ?? ''), 'scopeId');
  checkScope(scope, scopeId, user.id);
  const rows = all('SELECT * FROM comments WHERE scope = ? AND scope_id = ? ORDER BY id', scope, scopeId);
  res.json({ comments: rows.map(withAuthor) });
});

commentsRouter.post('/', (req, res) => {
  const user = currentUser(req);
  const scope = oneOf(req.body, 'scope', SCOPES);
  const scopeId = Number(req.body.scopeId);
  if (!Number.isInteger(scopeId) || scopeId <= 0) throw badRequest('Некорректный scopeId');
  const text = str(req.body, 'text', { max: 10000 });

  const ctx = checkScope(scope, scopeId, user.id);
  requireActive(courseById(ctx.courseId));
  // Публичные комментарии учеников ограничены режимом ленты курса
  if (scope !== 'SUBMISSION' && memberRole(ctx.courseId, user.id) === 'STUDENT') {
    const course = get<{ stream_mode: string }>('SELECT stream_mode FROM courses WHERE id = ?', ctx.courseId);
    if (course?.stream_mode === 'TEACHERS_ONLY') {
      throw forbidden('В этом курсе комментарии могут оставлять только преподаватели');
    }
  }
  const { lastInsertRowid: id } = run(
    'INSERT INTO comments (scope, scope_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)',
    scope, scopeId, user.id, text, now(),
  );

  // Уведомляем участников ветки, кроме автора комментария
  const recipients = [...new Set(ctx.participants)].filter((uid) => uid !== user.id);
  if (recipients.length > 0) {
    notify(recipients, {
      type: 'COMMENT',
      title: `${user.last_name} ${user.first_name}: новый комментарий`,
      body: text.slice(0, 200),
      link: scope === 'SUBMISSION' ? undefined : `/courses/${ctx.courseId}`,
    });
  }
  res.status(201).json({ comment: withAuthor(get('SELECT * FROM comments WHERE id = ?', id)!) });
});

commentsRouter.delete('/:id', (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const row = get<{ id: number; scope: Scope; scope_id: number; author_id: number }>(
    'SELECT * FROM comments WHERE id = ?',
    id,
  );
  if (!row) throw notFound('Комментарий не найден');
  const ctx = checkScope(row.scope, row.scope_id, user.id);
  const role = memberRole(ctx.courseId, user.id);
  if (row.author_id !== user.id && role !== 'TEACHER') throw forbidden();
  run('DELETE FROM comments WHERE id = ?', id);
  res.json({ ok: true });
});
