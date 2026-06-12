// Модуль «Курсы»: создание, список, участники, приглашения, архив.
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { all, get, run, now, tx } from '../../core/db.js';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js';
import { str, optStr, idParam, optOneOf } from '../../core/validate.js';
import { courseById, memberRole, requireActive, requireMember, requireTeacher } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { brand } from '../../config.js';
import { notify } from '../notifications/service.js';

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

// Код приглашения: 7 символов без неоднозначных (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 7; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!get('SELECT id FROM courses WHERE enrollment_code = ?', code)) return code;
  }
  throw new Error('Не удалось сгенерировать уникальный код курса');
}

const colorKeys = Object.keys(brand.theme.courseColors);

function courseListItem(courseId: number, userId: number) {
  const course = courseById(courseId);
  const role = memberRole(courseId, userId);
  const teachers = all<{ last_name: string; first_name: string; middle_name: string | null }>(
    `SELECT u.last_name, u.first_name, u.middle_name FROM course_members m
     JOIN users u ON u.id = m.user_id WHERE m.course_id = ? AND m.role = 'TEACHER' ORDER BY m.joined_at`,
    courseId,
  );
  const studentsCount = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM course_members WHERE course_id = ? AND role = 'STUDENT'",
    courseId,
  )!.n;
  return { ...course, role, teachers, studentsCount };
}

coursesRouter.get('/', (req, res) => {
  const user = currentUser(req);
  const state = optOneOf(req.query as Record<string, unknown>, 'state', ['ACTIVE', 'ARCHIVED'] as const) ?? 'ACTIVE';
  const rows = all<{ course_id: number }>(
    `SELECT m.course_id FROM course_members m JOIN courses c ON c.id = m.course_id
     WHERE m.user_id = ? AND c.state = ? ORDER BY c.created_at DESC`,
    user.id,
    state,
  );
  res.json({ courses: rows.map((r) => courseListItem(r.course_id, user.id)) });
});

coursesRouter.post('/', (req, res) => {
  const user = currentUser(req);
  if (!brand.features.courseCreationByAnyone && user.global_role !== 'ADMIN') {
    throw forbidden('Создание курсов доступно только администратору');
  }
  const name = str(req.body, 'name', { max: 200 });
  const section = optStr(req.body, 'section', { max: 100 });
  const subject = optStr(req.body, 'subject', { max: 100 });
  const room = optStr(req.body, 'room', { max: 100 });
  const description = optStr(req.body, 'description', { max: 5000 });
  const themeColor =
    optOneOf(req.body, 'themeColor', colorKeys as readonly string[]) ??
    colorKeys[randomInt(colorKeys.length)];

  const ts = now();
  const courseId = tx(() => {
    const { lastInsertRowid: id } = run(
      `INSERT INTO courses (name, section, subject, room, description, owner_id, enrollment_code, theme_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      name, section, subject, room, description, user.id, generateCode(), themeColor, ts, ts,
    );
    run(
      "INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'TEACHER', ?)",
      id, user.id, ts,
    );
    return id;
  });
  res.status(201).json({ course: courseListItem(courseId, user.id) });
});

coursesRouter.post('/join', (req, res) => {
  const user = currentUser(req);
  const code = str(req.body, 'code', { max: 20 }).toUpperCase();
  const course = get<{ id: number; state: string }>(
    'SELECT id, state FROM courses WHERE enrollment_code = ?',
    code,
  );
  if (!course) throw notFound('Курс с таким кодом не найден');
  if (course.state !== 'ACTIVE') throw badRequest('Курс находится в архиве');
  if (memberRole(course.id, user.id)) throw conflict('Вы уже участник этого курса');
  run(
    "INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'STUDENT', ?)",
    course.id, user.id, now(),
  );
  res.status(201).json({ course: courseListItem(course.id, user.id) });
});

coursesRouter.get('/:id', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  const { role } = requireMember(courseId, user.id);
  const item = courseListItem(courseId, user.id);
  // Код приглашения видят только преподаватели
  if (role !== 'TEACHER') item.enrollment_code = '';
  res.json({ course: item });
});

coursesRouter.patch('/:id', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  requireTeacher(courseId, user.id);
  const name = str(req.body, 'name', { max: 200 });
  const section = optStr(req.body, 'section', { max: 100 });
  const subject = optStr(req.body, 'subject', { max: 100 });
  const room = optStr(req.body, 'room', { max: 100 });
  const description = optStr(req.body, 'description', { max: 5000 });
  const themeColor = optOneOf(req.body, 'themeColor', colorKeys as readonly string[]);
  const streamMode = optOneOf(req.body, 'streamMode', ['ALL_POST', 'COMMENT_ONLY', 'TEACHERS_ONLY'] as const);
  const gradeScale = optOneOf(req.body, 'gradeScale', ['POINTS', 'FIVE', 'PERCENT'] as const);
  run(
    `UPDATE courses SET name = ?, section = ?, subject = ?, room = ?, description = ?,
     theme_color = COALESCE(?, theme_color), stream_mode = COALESCE(?, stream_mode),
     grade_scale = COALESCE(?, grade_scale), updated_at = ? WHERE id = ?`,
    name, section, subject, room, description, themeColor, streamMode, gradeScale, now(), courseId,
  );
  res.json({ course: courseListItem(courseId, user.id) });
});

// Копия курса: структура (темы, задания как черновики), без учеников и работ.
coursesRouter.post('/:id/copy', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  const source = requireTeacher(courseId, user.id);
  const ts = now();
  const newId = tx(() => {
    const { lastInsertRowid: id } = run(
      `INSERT INTO courses (name, section, subject, room, description, owner_id, enrollment_code,
         theme_color, stream_mode, grade_scale, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `${source.name} (копия)`, source.section, source.subject, source.room, source.description,
      user.id, generateCode(), source.theme_color, source.stream_mode ?? 'ALL_POST',
      source.grade_scale ?? 'FIVE', ts, ts,
    );
    run(
      "INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'TEACHER', ?)",
      id, user.id, ts,
    );
    const topicMap = new Map<number, number>();
    for (const topic of all<{ id: number; name: string; position: number }>(
      'SELECT id, name, position FROM topics WHERE course_id = ? ORDER BY position, id', courseId,
    )) {
      const { lastInsertRowid: tid } = run(
        'INSERT INTO topics (course_id, name, position) VALUES (?, ?, ?)', id, topic.name, topic.position,
      );
      topicMap.set(topic.id, tid);
    }
    for (const cw of all<Record<string, unknown>>(
      'SELECT * FROM coursework WHERE course_id = ? ORDER BY id', courseId,
    )) {
      const { lastInsertRowid: cwId } = run(
        `INSERT INTO coursework (course_id, topic_id, type, title, description, max_points, due_at,
           state, allow_late, quiz_show_score, position, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'DRAFT', ?, ?, ?, ?, ?, ?)`,
        id,
        cw.topic_id ? (topicMap.get(cw.topic_id as number) ?? null) : null,
        cw.type as string, cw.title as string, (cw.description as string | null),
        (cw.max_points as number | null), (cw.allow_late as number),
        (cw.quiz_show_score as number), (cw.position as number), user.id, ts, ts,
      );
      for (const q of all<Record<string, unknown>>(
        'SELECT * FROM quiz_questions WHERE coursework_id = ? ORDER BY position, id', cw.id as number,
      )) {
        run(
          'INSERT INTO quiz_questions (coursework_id, type, text, options, correct, points, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
          cwId, q.type as string, q.text as string, (q.options as string | null),
          q.correct as string, q.points as number, q.position as number,
        );
      }
    }
    return id;
  });
  res.status(201).json({ course: courseListItem(newId, user.id) });
});

coursesRouter.post('/:id/archive', (req, res) => {
  if (!brand.features.archive) throw forbidden('Архивирование отключено');
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  requireTeacher(courseId, user.id);
  run("UPDATE courses SET state = 'ARCHIVED', updated_at = ? WHERE id = ?", now(), courseId);
  res.json({ ok: true });
});

coursesRouter.post('/:id/restore', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  requireTeacher(courseId, user.id);
  run("UPDATE courses SET state = 'ACTIVE', updated_at = ? WHERE id = ?", now(), courseId);
  res.json({ ok: true });
});

coursesRouter.delete('/:id', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  const course = courseById(courseId);
  if (course.owner_id !== user.id && user.global_role !== 'ADMIN') {
    throw forbidden('Удалить курс может только его владелец');
  }
  if (course.state !== 'ARCHIVED') throw badRequest('Сначала переместите курс в архив');
  run('DELETE FROM courses WHERE id = ?', courseId);
  res.json({ ok: true });
});

coursesRouter.post('/:id/code/reset', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  requireActive(requireTeacher(courseId, user.id));
  const code = generateCode();
  run('UPDATE courses SET enrollment_code = ?, updated_at = ? WHERE id = ?', code, now(), courseId);
  res.json({ enrollmentCode: code });
});

coursesRouter.get('/:id/members', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  requireMember(courseId, user.id);
  const members = all(
    `SELECT u.id, u.email, u.last_name, u.first_name, u.middle_name, m.role, m.joined_at
     FROM course_members m JOIN users u ON u.id = m.user_id
     WHERE m.course_id = ? ORDER BY m.role DESC, u.last_name, u.first_name`,
    courseId,
  );
  res.json({ members });
});

// Приглашение по email: если пользователь зарегистрирован — добавляется сразу
// и получает уведомление. Внешняя рассылка писем — точка расширения (см. docs).
coursesRouter.post('/:id/invite', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  const course = requireTeacher(courseId, user.id);
  requireActive(course);
  const email = str(req.body, 'email', { max: 254 }).toLowerCase();
  const role = optOneOf(req.body, 'role', ['TEACHER', 'STUDENT'] as const) ?? 'STUDENT';
  const invited = get<{ id: number }>('SELECT id FROM users WHERE email = ?', email);
  if (!invited) throw notFound('Пользователь с таким email не зарегистрирован на платформе');
  if (memberRole(courseId, invited.id)) throw conflict('Пользователь уже участник курса');
  run(
    'INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
    courseId, invited.id, role, now(),
  );
  notify([invited.id], {
    type: 'INVITED',
    title: `Вас добавили в курс «${course.name}»`,
    body: role === 'TEACHER' ? 'Роль: преподаватель' : 'Роль: ученик',
    link: `/courses/${courseId}`,
  });
  res.status(201).json({ ok: true });
});

coursesRouter.delete('/:id/members/:userId', (req, res) => {
  const user = currentUser(req);
  const courseId = idParam(req.params.id);
  const targetId = idParam(req.params.userId, 'userId');
  const course = courseById(courseId);
  const targetRole = memberRole(courseId, targetId);
  if (!targetRole) throw notFound('Участник не найден');
  const isSelf = targetId === user.id;
  if (!isSelf) requireTeacher(courseId, user.id);
  if (targetId === course.owner_id) throw badRequest('Владельца курса удалить нельзя');
  run('DELETE FROM course_members WHERE course_id = ? AND user_id = ?', courseId, targetId);
  res.json({ ok: true });
});
