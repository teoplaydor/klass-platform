// Проверки прав доступа к курсам. Используются всеми модулями.
import { all, get } from './db.js';
import { badRequest, forbidden, notFound } from './errors.js';

export type CourseRole = 'TEACHER' | 'STUDENT';

export interface CourseRow {
  id: number;
  name: string;
  section: string | null;
  subject: string | null;
  room: string | null;
  description: string | null;
  owner_id: number;
  state: 'ACTIVE' | 'ARCHIVED';
  enrollment_code: string;
  theme_color: string;
  stream_mode: 'ALL_POST' | 'COMMENT_ONLY' | 'TEACHERS_ONLY';
  grade_scale: 'POINTS' | 'FIVE' | 'PERCENT';
  created_at: string;
  updated_at: string;
}

export function courseById(courseId: number): CourseRow {
  const course = get<CourseRow>('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) throw notFound('Курс не найден');
  return course;
}

export function memberRole(courseId: number, userId: number): CourseRole | null {
  const row = get<{ role: CourseRole }>(
    'SELECT role FROM course_members WHERE course_id = ? AND user_id = ?',
    courseId,
    userId,
  );
  return row?.role ?? null;
}

// Участник курса (любая роль) — иначе 403/404.
export function requireMember(courseId: number, userId: number): { course: CourseRow; role: CourseRole } {
  const course = courseById(courseId);
  const role = memberRole(courseId, userId);
  if (!role) throw forbidden('Вы не участник этого курса');
  return { course, role };
}

export function requireTeacher(courseId: number, userId: number): CourseRow {
  const { course, role } = requireMember(courseId, userId);
  if (role !== 'TEACHER') throw forbidden('Действие доступно только преподавателю');
  return course;
}

// Архивный курс доступен только для чтения: любые изменения содержимого
// (посты, задания, сдачи, оценки, участники) требуют активного курса.
export function requireActive(course: Pick<CourseRow, 'state'>): void {
  if (course.state !== 'ACTIVE') {
    throw badRequest('Курс находится в архиве и доступен только для чтения');
  }
}

export function requireActiveCourse(courseId: number): CourseRow {
  const course = courseById(courseId);
  requireActive(course);
  return course;
}

// Идентификаторы всех учеников курса.
export function studentIds(courseId: number): number[] {
  return all<{ user_id: number }>(
    "SELECT user_id FROM course_members WHERE course_id = ? AND role = 'STUDENT'",
    courseId,
  ).map((r) => r.user_id);
}
