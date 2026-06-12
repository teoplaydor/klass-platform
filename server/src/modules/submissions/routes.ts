// Модуль «Сдачи работ» (аналог StudentSubmission).
// Жизненный цикл: ASSIGNED -> TURNED_IN -> RETURNED (оценка опубликована),
// ученик может отменить сдачу (RECLAIMED) или пересдать после возврата.
import { Router } from 'express';
import { all, get, run, now, tx } from '../../core/db.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { optNum, optStr, idParam } from '../../core/validate.js';
import { memberRole, requireTeacher } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { attachItems, attachmentsFor } from '../files/attachments.js';
import { brand } from '../../config.js';
import { notify } from '../notifications/service.js';
import { audienceOf, courseworkById, visibleToStudent, type CourseworkRow } from '../coursework/routes.js';
import { answersOf, autograde, saveAnswers } from '../quizzes/service.js';

export const submissionsRouter = Router();
submissionsRouter.use(requireAuth);

interface SubmissionRow {
  id: number;
  coursework_id: number;
  student_id: number;
  state: 'ASSIGNED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED';
  answer_text: string | null;
  draft_grade: number | null;
  grade: number | null;
  turned_in_at: string | null;
  returned_at: string | null;
  updated_at: string;
}

function ensureSubmission(courseworkId: number, studentId: number): SubmissionRow {
  run(
    'INSERT OR IGNORE INTO submissions (coursework_id, student_id, updated_at) VALUES (?, ?, ?)',
    courseworkId, studentId, now(),
  );
  return get<SubmissionRow>(
    'SELECT * FROM submissions WHERE coursework_id = ? AND student_id = ?',
    courseworkId, studentId,
  )!;
}

function submissionById(id: number): { sub: SubmissionRow; cw: CourseworkRow } {
  const sub = get<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', id);
  if (!sub) throw notFound('Сдача не найдена');
  return { sub, cw: courseworkById(sub.coursework_id) };
}

function recordEvent(submissionId: number, actorId: number, event: string, payload?: unknown): void {
  run(
    'INSERT INTO submission_events (submission_id, actor_id, event, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    submissionId, actorId, event, payload === undefined ? null : JSON.stringify(payload), now(),
  );
}

function isLate(sub: SubmissionRow, cw: CourseworkRow): boolean {
  return !!cw.due_at && !!sub.turned_in_at && sub.turned_in_at > cw.due_at;
}

function rubricGradesOf(submissionId: number) {
  return all(
    `SELECT g.criterion_id, g.level_id, l.points FROM submission_rubric_grades g
     JOIN rubric_levels l ON l.id = g.level_id WHERE g.submission_id = ?`,
    submissionId,
  );
}

function fullSubmission(sub: SubmissionRow, cw: CourseworkRow) {
  return {
    ...sub,
    late: isLate(sub, cw),
    attachments: attachmentsFor('SUBMISSION', sub.id),
    rubricGrades: rubricGradesOf(sub.id),
  };
}

// Список сдач для преподавателя: все адресаты задания со статусами.
submissionsRouter.get('/coursework/:id/submissions', (req, res) => {
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  requireTeacher(cw.course_id, user.id);
  if (cw.type === 'MATERIAL') throw badRequest('У материала нет сдач');

  const items = audienceOf(cw).map((studentId) => {
    const student = get(
      'SELECT id, email, last_name, first_name, middle_name FROM users WHERE id = ?',
      studentId,
    );
    const sub = ensureSubmission(cw.id, studentId);
    return { student, submission: fullSubmission(sub, cw) };
  });
  res.json({ submissions: items });
});

// Своя сдача ученика (создаётся при первом обращении).
submissionsRouter.get('/coursework/:id/my', (req, res) => {
  const user = currentUser(req);
  const cw = courseworkById(idParam(req.params.id));
  if (memberRole(cw.course_id, user.id) !== 'STUDENT' || !visibleToStudent(cw, user.id)) {
    throw notFound('Задание не найдено');
  }
  if (cw.type === 'MATERIAL') throw badRequest('У материала нет сдач');
  const sub = ensureSubmission(cw.id, user.id);
  const body: Record<string, unknown> = { submission: fullSubmission(sub, cw) };
  if (cw.type === 'QUIZ') {
    // Баллы автопроверки ученик видит после возврата работы
    // или сразу после сдачи, если включено в настройках теста
    const canSeeScore = sub.state === 'RETURNED' || (sub.state === 'TURNED_IN' && !!cw.quiz_show_score);
    const answers = answersOf(sub.id);
    body.quizAnswers = canSeeScore ? answers : answers.map((a) => ({ ...a, awarded: null }));
    body.quizScoreVisible = canSeeScore;
  }
  res.json(body);
});

submissionsRouter.get('/submissions/:id', (req, res) => {
  const user = currentUser(req);
  const { sub, cw } = submissionById(idParam(req.params.id));
  const role = memberRole(cw.course_id, user.id);
  if (sub.student_id !== user.id && role !== 'TEACHER') throw forbidden();
  const student = get(
    'SELECT id, email, last_name, first_name, middle_name FROM users WHERE id = ?',
    sub.student_id,
  );
  const events = all(
    'SELECT event, payload, actor_id, created_at FROM submission_events WHERE submission_id = ? ORDER BY id',
    sub.id,
  );
  const quizAnswers = cw.type === 'QUIZ' && role === 'TEACHER' ? answersOf(sub.id) : undefined;
  res.json({ submission: { ...fullSubmission(sub, cw), student, events, quizAnswers }, coursework: cw });
});

// Ученик редактирует ответ и вложения (пока работа не сдана).
submissionsRouter.patch('/submissions/:id', (req, res) => {
  const user = currentUser(req);
  const { sub, cw } = submissionById(idParam(req.params.id));
  if (sub.student_id !== user.id) throw forbidden();
  if (sub.state === 'TURNED_IN') throw badRequest('Работа уже сдана. Отмените сдачу, чтобы внести изменения');

  const answerText = optStr(req.body, 'answerText', { max: 50000 });
  tx(() => {
    run('UPDATE submissions SET answer_text = ?, updated_at = ? WHERE id = ?', answerText, now(), sub.id);
    attachItems(req.body.attachments, 'SUBMISSION', sub.id, user.id, brand.limits.maxAttachmentsPerPost);
    if (cw.type === 'QUIZ' && req.body.answers !== undefined) {
      saveAnswers(sub.id, cw.id, req.body.answers);
    }
  });
  res.json({ submission: fullSubmission(get<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', sub.id)!, cw) });
});

submissionsRouter.post('/submissions/:id/turn-in', (req, res) => {
  const user = currentUser(req);
  const { sub, cw } = submissionById(idParam(req.params.id));
  if (sub.student_id !== user.id) throw forbidden();
  if (sub.state === 'TURNED_IN') throw badRequest('Работа уже сдана');
  if (!cw.allow_late && cw.due_at && Date.parse(cw.due_at) < Date.now()) {
    throw badRequest('Срок сдачи истёк, преподаватель не принимает работы с опозданием');
  }
  const ts = now();
  run("UPDATE submissions SET state = 'TURNED_IN', turned_in_at = ?, updated_at = ? WHERE id = ?", ts, ts, sub.id);
  // Тесты проверяются автоматически: сумма баллов — в черновик оценки
  if (cw.type === 'QUIZ') {
    const score = autograde(sub.id, cw.id);
    run('UPDATE submissions SET draft_grade = ? WHERE id = ?', score, sub.id);
    recordEvent(sub.id, user.id, 'GRADE_CHANGED', { draftGrade: score, source: 'autograde' });
  }
  recordEvent(sub.id, user.id, 'TURNED_IN');
  const teachers = all<{ user_id: number }>(
    "SELECT user_id FROM course_members WHERE course_id = ? AND role = 'TEACHER'",
    cw.course_id,
  ).map((r) => r.user_id);
  notify(teachers, {
    type: 'WORK_TURNED_IN',
    title: `${user.last_name} ${user.first_name}: сдана работа`,
    body: cw.title,
    link: `/courses/${cw.course_id}/coursework/${cw.id}/review`,
  });
  res.json({ ok: true });
});

submissionsRouter.post('/submissions/:id/reclaim', (req, res) => {
  const user = currentUser(req);
  const { sub } = submissionById(idParam(req.params.id));
  if (sub.student_id !== user.id) throw forbidden();
  if (sub.state !== 'TURNED_IN') throw badRequest('Работа не находится в статусе «Сдано»');
  run("UPDATE submissions SET state = 'RECLAIMED', updated_at = ? WHERE id = ?", now(), sub.id);
  recordEvent(sub.id, user.id, 'RECLAIMED');
  res.json({ ok: true });
});

// Черновик оценки: виден только преподавателю до возврата работы.
submissionsRouter.post('/submissions/:id/grade', (req, res) => {
  const user = currentUser(req);
  const { sub, cw } = submissionById(idParam(req.params.id));
  requireTeacher(cw.course_id, user.id);
  const draftGrade = optNum(req.body, 'draftGrade', { min: 0, max: 100000 });
  run('UPDATE submissions SET draft_grade = ?, updated_at = ? WHERE id = ?', draftGrade, now(), sub.id);
  recordEvent(sub.id, user.id, 'GRADE_CHANGED', { draftGrade });
  res.json({ submission: fullSubmission(get<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', sub.id)!, cw) });
});

// Возврат работы: публикует оценку и уведомляет ученика.
submissionsRouter.post('/submissions/:id/return', (req, res) => {
  const user = currentUser(req);
  const { sub, cw } = submissionById(idParam(req.params.id));
  requireTeacher(cw.course_id, user.id);
  const explicit = optNum(req.body, 'grade', { min: 0, max: 100000 });
  const grade = explicit ?? sub.draft_grade;
  const ts = now();
  run(
    "UPDATE submissions SET state = 'RETURNED', grade = ?, draft_grade = ?, returned_at = ?, updated_at = ? WHERE id = ?",
    grade, grade, ts, ts, sub.id,
  );
  recordEvent(sub.id, user.id, 'RETURNED', { grade });
  notify([sub.student_id], {
    type: 'WORK_RETURNED',
    title: grade !== null ? `Работа проверена: ${grade} из ${cw.max_points ?? '—'}` : 'Работа возвращена',
    body: cw.title,
    link: `/courses/${cw.course_id}/coursework/${cw.id}`,
  });
  res.json({ submission: fullSubmission(get<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', sub.id)!, cw) });
});

// Оценка по рубрике: выбор уровня по каждому критерию, сумма — в черновик оценки.
submissionsRouter.put('/submissions/:id/rubric', (req, res) => {
  if (!brand.features.rubrics) throw forbidden('Рубрики отключены');
  const user = currentUser(req);
  const { sub, cw } = submissionById(idParam(req.params.id));
  requireTeacher(cw.course_id, user.id);
  const rubric = get<{ id: number }>('SELECT id FROM rubrics WHERE coursework_id = ?', cw.id);
  if (!rubric) throw badRequest('У задания нет рубрики');

  const grades = req.body.grades as Record<string, unknown>;
  if (typeof grades !== 'object' || grades === null) throw badRequest('Ожидается объект grades: {criterionId: levelId}');

  const total = tx(() => {
    run('DELETE FROM submission_rubric_grades WHERE submission_id = ?', sub.id);
    let sum = 0;
    for (const [criterionIdRaw, levelIdRaw] of Object.entries(grades)) {
      const criterionId = Number(criterionIdRaw);
      const levelId = Number(levelIdRaw);
      const level = get<{ points: number; criterion_id: number; rubric_id: number }>(
        `SELECT l.points, l.criterion_id, c.rubric_id FROM rubric_levels l
         JOIN rubric_criteria c ON c.id = l.criterion_id WHERE l.id = ?`,
        levelId,
      );
      if (!level || level.criterion_id !== criterionId || level.rubric_id !== rubric.id) {
        throw badRequest('Уровень не принадлежит рубрике этого задания');
      }
      run(
        'INSERT INTO submission_rubric_grades (submission_id, criterion_id, level_id) VALUES (?, ?, ?)',
        sub.id, criterionId, levelId,
      );
      sum += level.points;
    }
    run('UPDATE submissions SET draft_grade = ?, updated_at = ? WHERE id = ?', sum, now(), sub.id);
    return sum;
  });
  recordEvent(sub.id, user.id, 'GRADE_CHANGED', { draftGrade: total, source: 'rubric' });
  res.json({ submission: fullSubmission(get<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', sub.id)!, cw) });
});
