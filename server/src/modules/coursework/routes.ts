// Модуль «Задания» (аналог CourseWork): задания, вопросы и материалы курса.
// Поддерживает черновики, отложенную публикацию, назначение отдельным ученикам,
// темы, вложения и критериальные рубрики.
import { Router } from 'express';
import { all, get, run, now, tx } from '../../core/db.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { str, optStr, optNum, optDate, idParam, oneOf, optOneOf } from '../../core/validate.js';
import { memberRole, requireMember, requireTeacher, studentIds } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { attachItems, attachmentsFor } from '../files/attachments.js';
import { brand } from '../../config.js';
import { notify } from '../notifications/service.js';

export const courseworkRouter = Router();
courseworkRouter.use(requireAuth);

export interface CourseworkRow {
  id: number;
  course_id: number;
  topic_id: number | null;
  type: 'ASSIGNMENT' | 'QUIZ' | 'QUESTION' | 'MATERIAL';
  title: string;
  description: string | null;
  max_points: number | null;
  due_at: string | null;
  state: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
  scheduled_at: string | null;
  allow_late: number;
  quiz_show_score: number;
  position: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export function courseworkById(id: number): CourseworkRow {
  const row = get<CourseworkRow>('SELECT * FROM coursework WHERE id = ?', id);
  if (!row) throw notFound('Задание не найдено');
  return row;
}

function assigneeIdsOf(courseworkId: number): number[] {
  return all<{ user_id: number }>(
    'SELECT user_id FROM coursework_assignees WHERE coursework_id = ?',
    courseworkId,
  ).map((r) => r.user_id);
}

// Ученики, которым адресовано задание (пустой список назначений = весь курс).
export function audienceOf(cw: CourseworkRow): number[] {
  const explicit = assigneeIdsOf(cw.id);
  return explicit.length > 0 ? explicit : studentIds(cw.course_id);
}

export function visibleToStudent(cw: CourseworkRow, userId: number): boolean {
  if (cw.state !== 'PUBLISHED') return false;
  const explicit = assigneeIdsOf(cw.id);
  return explicit.length === 0 || explicit.includes(userId);
}

function mySubmissionSummary(courseworkId: number, userId: number) {
  return (
    get(
      `SELECT id, state, grade, draft_grade, turned_in_at, returned_at
       FROM submissions WHERE coursework_id = ? AND student_id = ?`,
      courseworkId,
      userId,
    ) ?? null
  );
}

function teacherCounters(cw: CourseworkRow) {
  const assigned = audienceOf(cw).length;
  const turnedIn = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM submissions WHERE coursework_id = ? AND state = 'TURNED_IN'",
    cw.id,
  )!.n;
  const graded = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM submissions WHERE coursework_id = ? AND state = 'RETURNED'",
    cw.id,
  )!.n;
  return { assigned, turnedIn, graded };
}

function rubricOf(courseworkId: number) {
  const rubric = get<{ id: number }>('SELECT id FROM rubrics WHERE coursework_id = ?', courseworkId);
  if (!rubric) return null;
  const criteria = all<{ id: number; title: string; description: string | null; position: number }>(
    'SELECT id, title, description, position FROM rubric_criteria WHERE rubric_id = ? ORDER BY position, id',
    rubric.id,
  ).map((c) => ({
    ...c,
    levels: all('SELECT id, title, points, position FROM rubric_levels WHERE criterion_id = ? ORDER BY points DESC, id', c.id),
  }));
  return { id: rubric.id, criteria };
}

function listItemFor(cw: CourseworkRow, role: 'TEACHER' | 'STUDENT', userId: number) {
  const base = { ...cw, attachments: attachmentsFor('COURSEWORK', cw.id) };
  if (role === 'TEACHER') {
    return { ...base, counters: cw.type === 'MATERIAL' ? null : teacherCounters(cw) };
  }
  return {
    ...base,
    mySubmission: cw.type === 'MATERIAL' ? null : mySubmissionSummary(cw.id, userId),
  };
}

courseworkRouter.get('/courses/:courseId/coursework', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.courseId, 'courseId');
  const { role } = requireMember(courseId, user.id);
  let rows = all<CourseworkRow>(
    'SELECT * FROM coursework WHERE course_id = ? ORDER BY position DESC, created_at DESC, id DESC',
    courseId,
  );
  if (role === 'STUDENT') rows = rows.filter((cw) => visibleToStudent(cw, user.id));
  res.json({ coursework: rows.map((cw) => listItemFor(cw, role, user.id)) });
});

function publishNotifications(cw: CourseworkRow, courseName: string): void {
  if (cw.type === 'MATERIAL') {
    notify(audienceOf(cw), {
      type: 'NEW_COURSEWORK',
      title: `Новый материал в курсе «${courseName}»`,
      body: cw.title,
      link: `/courses/${cw.course_id}/coursework/${cw.id}`,
    });
    return;
  }
  notify(audienceOf(cw), {
    type: 'NEW_COURSEWORK',
    title: `Новое задание в курсе «${courseName}»`,
    body: cw.due_at ? `${cw.title} — срок сдачи ${new Date(cw.due_at).toLocaleString('ru-RU')}` : cw.title,
    link: `/courses/${cw.course_id}/coursework/${cw.id}`,
  });
}

courseworkRouter.post('/courses/:courseId/coursework', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.courseId, 'courseId');
  const course = requireTeacher(courseId, user.id);

  const type = oneOf(req.body, 'type', ['ASSIGNMENT', 'QUIZ', 'QUESTION', 'MATERIAL'] as const);
  if (type === 'QUIZ' && !brand.features.quizzes) throw forbidden('Модуль тестов отключён');
  const title = str(req.body, 'title', { max: 300 });
  const description = optStr(req.body, 'description', { max: 20000 });
  const isGradable = type !== 'MATERIAL';
  const maxPoints = isGradable ? optNum(req.body, 'maxPoints', { min: 1, max: 10000 }) : null;
  const dueAt = isGradable ? optDate(req.body, 'dueAt') : null;
  const allowLate = req.body.allowLate === false ? 0 : 1;
  let state = optOneOf(req.body, 'state', ['DRAFT', 'SCHEDULED', 'PUBLISHED'] as const) ?? 'PUBLISHED';
  let scheduledAt: string | null = null;
  if (state === 'SCHEDULED') {
    if (!brand.features.scheduling) throw forbidden('Отложенная публикация отключена');
    scheduledAt = optDate(req.body, 'scheduledAt');
    if (!scheduledAt) throw badRequest('Для отложенной публикации укажите scheduledAt');
    if (Date.parse(scheduledAt) <= Date.now()) state = 'PUBLISHED';
  }

  let topicId = optNum(req.body, 'topicId');
  if (topicId !== null) {
    const topic = get<{ course_id: number }>('SELECT course_id FROM topics WHERE id = ?', topicId);
    if (!topic || topic.course_id !== courseId) throw badRequest('Тема не принадлежит этому курсу');
  }

  const ts = now();
  const cwId = tx(() => {
    const { lastInsertRowid: id } = run(
      `INSERT INTO coursework (course_id, topic_id, type, title, description, max_points, due_at,
         state, scheduled_at, allow_late, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      courseId, topicId, type, title, description, maxPoints, dueAt,
      state, scheduledAt, allowLate, user.id, ts, ts,
    );
    // Назначение отдельным ученикам
    const assigneeIds = req.body.assigneeIds;
    if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
      const courseStudents = new Set(studentIds(courseId));
      for (const raw of assigneeIds) {
        const sid = Number(raw);
        if (!courseStudents.has(sid)) throw badRequest('В списке назначения есть пользователь не из курса');
        run('INSERT INTO coursework_assignees (coursework_id, user_id) VALUES (?, ?)', id, sid);
      }
    }
    attachItems(req.body.attachments, 'COURSEWORK', id, user.id, brand.limits.maxAttachmentsPerPost);
    return id;
  });

  const cw = courseworkById(cwId);
  if (cw.state === 'PUBLISHED') publishNotifications(cw, course.name);
  res.status(201).json({ coursework: listItemFor(cw, 'TEACHER', user.id) });
});

courseworkRouter.get('/coursework/:id', (req, res) => {
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  const { role } = requireMember(cw.course_id, user.id);
  if (role === 'STUDENT' && !visibleToStudent(cw, user.id)) throw notFound('Задание не найдено');

  const topic = cw.topic_id ? get('SELECT id, name FROM topics WHERE id = ?', cw.topic_id) : null;
  const base = {
    ...cw,
    topic,
    attachments: attachmentsFor('COURSEWORK', cw.id),
    rubric: brand.features.rubrics ? rubricOf(cw.id) : null,
  };
  if (role === 'TEACHER') {
    res.json({
      coursework: {
        ...base,
        counters: cw.type === 'MATERIAL' ? null : teacherCounters(cw),
        assigneeIds: assigneeIdsOf(cw.id),
      },
    });
    return;
  }
  res.json({
    coursework: {
      ...base,
      mySubmission: cw.type === 'MATERIAL' ? null : mySubmissionSummary(cw.id, user.id),
    },
  });
});

courseworkRouter.patch('/coursework/:id', (req, res) => {
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  const course = requireTeacher(cw.course_id, user.id);

  const title = str(req.body, 'title', { max: 300 });
  const description = optStr(req.body, 'description', { max: 20000 });
  const isGradable = cw.type !== 'MATERIAL';
  const maxPoints = isGradable ? optNum(req.body, 'maxPoints', { min: 1, max: 10000 }) : null;
  const dueAt = isGradable ? optDate(req.body, 'dueAt') : null;
  const allowLate = req.body.allowLate === false ? 0 : 1;
  let topicId = optNum(req.body, 'topicId');
  if (topicId !== null) {
    const topic = get<{ course_id: number }>('SELECT course_id FROM topics WHERE id = ?', topicId);
    if (!topic || topic.course_id !== cw.course_id) throw badRequest('Тема не принадлежит этому курсу');
  }

  tx(() => {
    run(
      `UPDATE coursework SET title = ?, description = ?, max_points = ?, due_at = ?,
       allow_late = ?, topic_id = ?, updated_at = ? WHERE id = ?`,
      title, description, maxPoints, dueAt, allowLate, topicId, now(), cw.id,
    );
    attachItems(req.body.attachments, 'COURSEWORK', cw.id, user.id, brand.limits.maxAttachmentsPerPost);
  });
  res.json({ coursework: listItemFor(courseworkById(cw.id), 'TEACHER', user.id) });
});

courseworkRouter.post('/coursework/:id/publish', (req, res) => {
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  const course = requireTeacher(cw.course_id, user.id);
  if (cw.state === 'PUBLISHED') throw badRequest('Уже опубликовано');
  run("UPDATE coursework SET state = 'PUBLISHED', scheduled_at = NULL, updated_at = ? WHERE id = ?", now(), cw.id);
  publishNotifications(courseworkById(cw.id), course.name);
  res.json({ ok: true });
});

courseworkRouter.delete('/coursework/:id', (req, res) => {
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  requireTeacher(cw.course_id, user.id);
  run('DELETE FROM coursework WHERE id = ?', cw.id);
  res.json({ ok: true });
});

// Полная замена рубрики задания (создание и редактирование одним запросом).
courseworkRouter.put('/coursework/:id/rubric', (req, res) => {
  if (!brand.features.rubrics) throw forbidden('Рубрики отключены');
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  requireTeacher(cw.course_id, user.id);
  if (cw.type === 'MATERIAL') throw badRequest('У материала не может быть рубрики');

  const criteria = req.body.criteria;
  if (!Array.isArray(criteria) || criteria.length === 0 || criteria.length > 20) {
    throw badRequest('Рубрика должна содержать от 1 до 20 критериев');
  }
  tx(() => {
    run('DELETE FROM rubrics WHERE coursework_id = ?', cw.id);
    const { lastInsertRowid: rubricId } = run('INSERT INTO rubrics (coursework_id) VALUES (?)', cw.id);
    criteria.forEach((c: { title?: unknown; description?: unknown; levels?: unknown }, ci: number) => {
      const title = String(c.title ?? '').trim();
      if (!title) throw badRequest('У каждого критерия должно быть название');
      const { lastInsertRowid: critId } = run(
        'INSERT INTO rubric_criteria (rubric_id, title, description, position) VALUES (?, ?, ?, ?)',
        rubricId, title.slice(0, 300), c.description ? String(c.description).slice(0, 1000) : null, ci,
      );
      const levels = c.levels;
      if (!Array.isArray(levels) || levels.length === 0 || levels.length > 10) {
        throw badRequest('У каждого критерия должно быть от 1 до 10 уровней');
      }
      levels.forEach((l: { title?: unknown; points?: unknown }, li: number) => {
        const points = Number(l.points);
        if (!Number.isFinite(points) || points < 0) throw badRequest('Баллы уровня должны быть числом не меньше 0');
        run(
          'INSERT INTO rubric_levels (criterion_id, title, points, position) VALUES (?, ?, ?, ?)',
          critId, String(l.title ?? '').trim().slice(0, 300) || `Уровень ${li + 1}`, points, li,
        );
      });
    });
  });
  res.json({ rubric: rubricOf(cw.id) });
});

courseworkRouter.delete('/coursework/:id/rubric', (req, res) => {
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  requireTeacher(cw.course_id, user.id);
  run('DELETE FROM rubrics WHERE coursework_id = ?', cw.id);
  res.json({ ok: true });
});
