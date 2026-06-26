// Маршруты тестов: редактирование вопросов учителем, прохождение учеником.
import { Router } from 'express';
import { run, now } from '../../core/db.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { idParam } from '../../core/validate.js';
import { memberRole, requireActive, requireTeacher } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { brand } from '../../config.js';
import { courseworkById, visibleToStudent } from '../coursework/routes.js';
import { questionsOf, replaceQuestions, studentView, teacherView } from './service.js';

export const quizzesRouter = Router();
quizzesRouter.use(requireAuth);

function requireQuizFeature(): void {
  if (!brand.features.quizzes) throw forbidden('Модуль тестов отключён');
}

quizzesRouter.get('/coursework/:id/quiz', (req, res) => {
  requireQuizFeature();
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  if (cw.type !== 'QUIZ') throw badRequest('Это не тест');
  const role = memberRole(cw.course_id, user.id);
  if (!role) throw forbidden();
  if (role === 'TEACHER') {
    res.json({ questions: questionsOf(cw.id).map(teacherView) });
    return;
  }
  if (!visibleToStudent(cw, user.id)) throw notFound('Задание не найдено');
  res.json({ questions: questionsOf(cw.id).map(studentView) });
});

// Полная замена вопросов теста; max_points задания приводится к сумме баллов.
quizzesRouter.put('/coursework/:id/quiz', (req, res) => {
  requireQuizFeature();
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  requireActive(requireTeacher(cw.course_id, user.id));
  if (cw.type !== 'QUIZ') throw badRequest('Это не тест');
  const total = replaceQuestions(cw.id, req.body.questions);
  const showScore = req.body.showScore === true ? 1 : 0;
  run(
    'UPDATE coursework SET max_points = ?, quiz_show_score = ?, updated_at = ? WHERE id = ?',
    total, showScore, now(), cw.id,
  );
  res.json({ questions: questionsOf(cw.id).map(teacherView), maxPoints: total });
});
