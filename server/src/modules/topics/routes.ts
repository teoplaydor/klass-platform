// Модуль «Темы»: разделы, по которым группируются задания внутри курса.
import { Router } from 'express';
import { all, get, run } from '../../core/db.js';
import { notFound } from '../../core/errors.js';
import { str, idParam } from '../../core/validate.js';
import { requireActive, requireMember, requireTeacher } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';

export const topicsRouter = Router();
topicsRouter.use(requireAuth);

topicsRouter.get('/courses/:courseId/topics', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.courseId, 'courseId');
  requireMember(courseId, user.id);
  const topics = all('SELECT * FROM topics WHERE course_id = ? ORDER BY position, id', courseId);
  res.json({ topics });
});

topicsRouter.post('/courses/:courseId/topics', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.courseId, 'courseId');
  requireActive(requireTeacher(courseId, user.id));
  const name = str(req.body, 'name', { max: 200 });
  const maxPos = get<{ p: number | null }>('SELECT MAX(position) AS p FROM topics WHERE course_id = ?', courseId)!.p ?? 0;
  const { lastInsertRowid: id } = run(
    'INSERT INTO topics (course_id, name, position) VALUES (?, ?, ?)',
    courseId, name, maxPos + 1,
  );
  res.status(201).json({ topic: get('SELECT * FROM topics WHERE id = ?', id) });
});

topicsRouter.patch('/topics/:id', (req, res) => {
  const user = currentUser(req);
  const topicId = idParam(req.params.id);
  const topic = get<{ course_id: number }>('SELECT course_id FROM topics WHERE id = ?', topicId);
  if (!topic) throw notFound('Тема не найдена');
  requireActive(requireTeacher(topic.course_id, user.id));
  const name = str(req.body, 'name', { max: 200 });
  run('UPDATE topics SET name = ? WHERE id = ?', name, topicId);
  res.json({ topic: get('SELECT * FROM topics WHERE id = ?', topicId) });
});

topicsRouter.delete('/topics/:id', (req, res) => {
  const user = currentUser(req);
  const topicId = idParam(req.params.id);
  const topic = get<{ course_id: number }>('SELECT course_id FROM topics WHERE id = ?', topicId);
  if (!topic) throw notFound('Тема не найдена');
  requireActive(requireTeacher(topic.course_id, user.id));
  // Задания темы не удаляются — остаются без темы (ON DELETE SET NULL)
  run('DELETE FROM topics WHERE id = ?', topicId);
  res.json({ ok: true });
});
