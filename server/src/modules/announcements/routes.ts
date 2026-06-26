// Модуль «Лента»: объявления курса с вложениями и отложенной публикацией.
import { Router } from 'express';
import { all, get, run, now, tx } from '../../core/db.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { str, idParam, optOneOf, optDate } from '../../core/validate.js';
import { requireActive, requireMember, requireTeacher, studentIds } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { attachItems, attachmentsFor } from '../files/attachments.js';
import { brand } from '../../config.js';
import { notify } from '../notifications/service.js';

export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

interface AnnouncementRow {
  id: number;
  course_id: number;
  author_id: number;
  text: string;
  state: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
  scheduled_at: string | null;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function withExtras(row: AnnouncementRow) {
  const author = get(
    'SELECT id, last_name, first_name, middle_name FROM users WHERE id = ?',
    row.author_id,
  );
  const commentsCount = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM comments WHERE scope = 'ANNOUNCEMENT' AND scope_id = ?",
    row.id,
  )!.n;
  return { ...row, author, commentsCount, attachments: attachmentsFor('ANNOUNCEMENT', row.id) };
}

announcementsRouter.get('/courses/:courseId/announcements', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.courseId, 'courseId');
  const { role } = requireMember(courseId, user.id);
  let rows = all<AnnouncementRow>(
    'SELECT * FROM announcements WHERE course_id = ? ORDER BY pinned DESC, created_at DESC, id DESC',
    courseId,
  );
  if (role === 'STUDENT') rows = rows.filter((a) => a.state === 'PUBLISHED');
  res.json({ announcements: rows.map(withExtras) });
});

announcementsRouter.post('/courses/:courseId/announcements', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.courseId, 'courseId');
  const { course, role } = requireMember(courseId, user.id);
  requireActive(course);
  // Право учеников писать в ленту определяется режимом ленты курса
  if (role === 'STUDENT' && course.stream_mode !== 'ALL_POST') {
    throw forbidden('В этом курсе объявления могут публиковать только преподаватели');
  }
  const text = str(req.body, 'text', { max: 20000 });
  let state = optOneOf(req.body, 'state', ['DRAFT', 'SCHEDULED', 'PUBLISHED'] as const) ?? 'PUBLISHED';
  let scheduledAt: string | null = null;
  if (role !== 'TEACHER' && state !== 'PUBLISHED') throw forbidden('Черновики доступны только преподавателю');
  if (state === 'SCHEDULED') {
    if (!brand.features.scheduling) throw forbidden('Отложенная публикация отключена');
    scheduledAt = optDate(req.body, 'scheduledAt');
    if (!scheduledAt) throw badRequest('Для отложенной публикации укажите scheduledAt');
    if (Date.parse(scheduledAt) <= Date.now()) state = 'PUBLISHED';
  }

  const ts = now();
  const id = tx(() => {
    const { lastInsertRowid } = run(
      `INSERT INTO announcements (course_id, author_id, text, state, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      courseId, user.id, text, state, scheduledAt, ts, ts,
    );
    attachItems(req.body.attachments, 'ANNOUNCEMENT', lastInsertRowid, user.id, brand.limits.maxAttachmentsPerPost);
    return lastInsertRowid;
  });

  if (state === 'PUBLISHED') {
    const audience = studentIds(courseId).filter((sid) => sid !== user.id);
    notify(audience, {
      type: 'NEW_ANNOUNCEMENT',
      title: `Объявление в курсе «${course.name}»`,
      body: text.slice(0, 200),
      link: `/courses/${courseId}`,
    });
  }
  res.status(201).json({ announcement: withExtras(get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', id)!) });
});

announcementsRouter.patch('/announcements/:id', (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const row = get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', id);
  if (!row) throw notFound('Объявление не найдено');
  const { course, role } = requireMember(row.course_id, user.id);
  requireActive(course);
  if (row.author_id !== user.id && role !== 'TEACHER') throw forbidden();
  const text = str(req.body, 'text', { max: 20000 });
  tx(() => {
    run('UPDATE announcements SET text = ?, updated_at = ? WHERE id = ?', text, now(), id);
    attachItems(req.body.attachments, 'ANNOUNCEMENT', id, user.id, brand.limits.maxAttachmentsPerPost);
  });
  res.json({ announcement: withExtras(get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', id)!) });
});

// Закрепление объявления вверху ленты (только преподаватель).
announcementsRouter.post('/announcements/:id/pin', (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const row = get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', id);
  if (!row) throw notFound('Объявление не найдено');
  requireActive(requireTeacher(row.course_id, user.id));
  run('UPDATE announcements SET pinned = ?, updated_at = ? WHERE id = ?', row.pinned ? 0 : 1, now(), id);
  res.json({ pinned: !row.pinned });
});

announcementsRouter.delete('/announcements/:id', (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const row = get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', id);
  if (!row) throw notFound('Объявление не найдено');
  const { course, role } = requireMember(row.course_id, user.id);
  requireActive(course);
  if (row.author_id !== user.id && role !== 'TEACHER') throw forbidden();
  run('DELETE FROM announcements WHERE id = ?', id);
  res.json({ ok: true });
});
