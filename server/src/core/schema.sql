-- Схема данных платформы.
-- Спроектирована по модели Google Classroom API (Course, CourseWork,
-- StudentSubmission, Announcement, Topic, Rubric), адаптирована под ру-сегмент.
-- Диалект: переносимый SQL (SQLite сейчас, PostgreSQL — см. docs/ИНТЕГРАЦИЯ.md).

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  last_name     TEXT    NOT NULL,
  first_name    TEXT    NOT NULL,
  middle_name   TEXT,
  global_role   TEXT    NOT NULL DEFAULT 'USER', -- USER | ADMIN
  -- Версия токенов: инкремент при смене пароля отзывает все выданные сессии
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  section         TEXT,                            -- класс/группа, напр. «10 Б»
  subject         TEXT,                            -- предмет
  room            TEXT,                            -- аудитория
  description     TEXT,
  owner_id        INTEGER NOT NULL REFERENCES users(id),
  state           TEXT    NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | ARCHIVED
  enrollment_code TEXT    NOT NULL UNIQUE,           -- код приглашения
  theme_color     TEXT    NOT NULL DEFAULT 'blue',   -- ключ из brand.config.json
  -- Режим ленты: ALL_POST (ученики публикуют и комментируют),
  -- COMMENT_ONLY (только комментируют), TEACHERS_ONLY (лента только для учителей)
  stream_mode     TEXT    NOT NULL DEFAULT 'ALL_POST',
  -- Шкала отображения оценок: POINTS (баллы), FIVE (5-балльная), PERCENT (проценты)
  grade_scale     TEXT    NOT NULL DEFAULT 'FIVE',
  -- Ссылка на комнату видеовстречи (Телемост, SberJazz, Jitsi и т. п.)
  meet_url        TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS course_members (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role      TEXT    NOT NULL, -- TEACHER | STUDENT
  joined_at TEXT    NOT NULL,
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS topics (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);

-- Учебный материал: задание, вопрос или материал (аналог CourseWork).
CREATE TABLE IF NOT EXISTS coursework (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id    INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  topic_id     INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  type         TEXT    NOT NULL, -- ASSIGNMENT | QUIZ | QUESTION | MATERIAL
  title        TEXT    NOT NULL,
  description  TEXT,
  max_points   REAL,             -- NULL = без оценки
  due_at       TEXT,             -- срок сдачи, ISO 8601
  state        TEXT    NOT NULL DEFAULT 'PUBLISHED', -- DRAFT | SCHEDULED | PUBLISHED
  scheduled_at TEXT,             -- время отложенной публикации
  allow_late   INTEGER NOT NULL DEFAULT 1, -- принимать после срока
  quiz_show_score INTEGER NOT NULL DEFAULT 0, -- показывать ученику баллы теста сразу после сдачи
  position     INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

-- Назначение задания отдельным ученикам (пусто = всем ученикам курса).
CREATE TABLE IF NOT EXISTS coursework_assignees (
  coursework_id INTEGER NOT NULL REFERENCES coursework(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (coursework_id, user_id)
);

-- Вложения: файлы и ссылки к заданиям, объявлениям и сдачам.
CREATE TABLE IF NOT EXISTS attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT    NOT NULL, -- COURSEWORK | ANNOUNCEMENT | SUBMISSION
  owner_id    INTEGER NOT NULL,
  kind        TEXT    NOT NULL, -- FILE | LINK
  title       TEXT,
  url         TEXT,             -- для LINK
  file_name   TEXT,             -- исходное имя файла
  stored_name TEXT,             -- имя на диске (uuid)
  mime        TEXT,
  size        INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL
);

-- Сдача работы учеником (аналог StudentSubmission).
CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  coursework_id INTEGER NOT NULL REFERENCES coursework(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state         TEXT    NOT NULL DEFAULT 'ASSIGNED', -- ASSIGNED | TURNED_IN | RETURNED | RECLAIMED
  answer_text   TEXT,            -- текстовый ответ (для QUESTION и кратких ответов)
  draft_grade   REAL,            -- черновик оценки (виден только учителю)
  grade         REAL,            -- итоговая оценка (после возврата)
  turned_in_at  TEXT,
  returned_at   TEXT,
  updated_at    TEXT    NOT NULL,
  UNIQUE (coursework_id, student_id)
);

-- История событий по сдаче (сдал, вернул, оценка изменена).
CREATE TABLE IF NOT EXISTS submission_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  actor_id      INTEGER REFERENCES users(id),
  event         TEXT    NOT NULL, -- TURNED_IN | RECLAIMED | RETURNED | GRADE_CHANGED
  payload       TEXT,             -- JSON с деталями (например, оценка)
  created_at    TEXT    NOT NULL
);

-- Объявления в ленте курса (аналог Announcement).
CREATE TABLE IF NOT EXISTS announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id    INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id    INTEGER NOT NULL REFERENCES users(id),
  text         TEXT    NOT NULL,
  state        TEXT    NOT NULL DEFAULT 'PUBLISHED', -- DRAFT | SCHEDULED | PUBLISHED
  scheduled_at TEXT,
  pinned       INTEGER NOT NULL DEFAULT 0, -- закреплено вверху ленты
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

-- Вопросы встроенного теста (для coursework.type = 'QUIZ').
CREATE TABLE IF NOT EXISTS quiz_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  coursework_id INTEGER NOT NULL REFERENCES coursework(id) ON DELETE CASCADE,
  type          TEXT    NOT NULL, -- SINGLE (один вариант) | MULTI (несколько) | TEXT (короткий ответ)
  text          TEXT    NOT NULL,
  options       TEXT,             -- JSON-массив вариантов (для SINGLE/MULTI)
  correct       TEXT    NOT NULL, -- JSON: индекс / массив индексов / массив допустимых строк
  points        REAL    NOT NULL DEFAULT 1,
  position      INTEGER NOT NULL DEFAULT 0
);

-- Ответы ученика на вопросы теста (автопроверка при сдаче).
CREATE TABLE IF NOT EXISTS quiz_answers (
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  answer        TEXT,             -- JSON: индекс / массив индексов / строка
  awarded       REAL,             -- начислено автопроверкой
  PRIMARY KEY (submission_id, question_id)
);

-- Комментарии: к объявлениям и заданиям — публичные в рамках курса,
-- SUBMISSION — приватная переписка учителя и ученика по конкретной работе.
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT    NOT NULL, -- ANNOUNCEMENT | COURSEWORK | SUBMISSION
  scope_id   INTEGER NOT NULL,
  author_id  INTEGER NOT NULL REFERENCES users(id),
  text       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

-- Критериальные рубрики оценивания (аналог Rubric).
CREATE TABLE IF NOT EXISTS rubrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  coursework_id INTEGER NOT NULL UNIQUE REFERENCES coursework(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rubric_id   INTEGER NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rubric_levels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criterion_id INTEGER NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  points       REAL    NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0
);

-- Выбранные уровни рубрики при оценке конкретной сдачи.
CREATE TABLE IF NOT EXISTS submission_rubric_grades (
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  criterion_id  INTEGER NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  level_id      INTEGER NOT NULL REFERENCES rubric_levels(id) ON DELETE CASCADE,
  PRIMARY KEY (submission_id, criterion_id)
);

-- Уведомления пользователя (колокольчик; каналы email/Telegram — точки расширения).
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL, -- NEW_COURSEWORK | NEW_ANNOUNCEMENT | WORK_RETURNED | WORK_TURNED_IN | INVITED | COMMENT
  title      TEXT    NOT NULL,
  body       TEXT,
  link       TEXT,             -- путь внутри приложения
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

-- Банк комментариев учителя (быстрые ответы при проверке работ).
CREATE TABLE IF NOT EXISTS comment_bank (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_user        ON course_members(user_id);
CREATE INDEX IF NOT EXISTS idx_coursework_course   ON coursework(course_id, state);
CREATE INDEX IF NOT EXISTS idx_coursework_due      ON coursework(due_at);
CREATE INDEX IF NOT EXISTS idx_submissions_work    ON submissions(coursework_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id, state);
CREATE INDEX IF NOT EXISTS idx_announcements_course ON announcements(course_id, state);
CREATE INDEX IF NOT EXISTS idx_comments_scope      ON comments(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_attachments_owner   ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user  ON notifications(user_id, is_read);
