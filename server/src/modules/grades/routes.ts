// Модуль «Оценки»: журнал курса (таблица ученики x задания) для преподавателя
// и сводка собственных оценок для ученика.
import { Router } from 'express';
import { all, get } from '../../core/db.js';
import { forbidden } from '../../core/errors.js';
import { idParam } from '../../core/validate.js';
import { requireMember, studentIds } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { brand } from '../../config.js';

export const gradesRouter = Router();
gradesRouter.use(requireAuth);

interface WorkCol {
  id: number;
  title: string;
  max_points: number | null;
  due_at: string | null;
  type: string;
}

gradesRouter.get('/courses/:courseId/grades', (req, res) => {
  if (!brand.features.grades) throw forbidden('Модуль оценок отключён');
  const user = currentUser(req);
  const courseId = idParam(req.params.courseId, 'courseId');
  const { role } = requireMember(courseId, user.id);

  // Оцениваемые опубликованные задания курса (столбцы журнала)
  const works = all<WorkCol>(
    `SELECT id, title, max_points, due_at, type FROM coursework
     WHERE course_id = ? AND state = 'PUBLISHED' AND type != 'MATERIAL'
     ORDER BY due_at IS NULL, due_at, id`,
    courseId,
  );

  if (role === 'TEACHER') {
    const students = all(
      `SELECT u.id, u.last_name, u.first_name, u.middle_name FROM course_members m
       JOIN users u ON u.id = m.user_id WHERE m.course_id = ? AND m.role = 'STUDENT'
       ORDER BY u.last_name, u.first_name`,
      courseId,
    );
    const cells = all(
      `SELECT s.coursework_id, s.student_id, s.state, s.grade, s.draft_grade, s.turned_in_at
       FROM submissions s JOIN coursework cw ON cw.id = s.coursework_id
       WHERE cw.course_id = ?`,
      courseId,
    );
    res.json({ role, works, students, cells });
    return;
  }

  // Ученик видит только свои опубликованные оценки
  const mine = all(
    `SELECT s.coursework_id, s.state, s.grade, s.turned_in_at
     FROM submissions s JOIN coursework cw ON cw.id = s.coursework_id
     WHERE cw.course_id = ? AND s.student_id = ?`,
    courseId,
    user.id,
  );
  res.json({ role, works, cells: mine });
});
