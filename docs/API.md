# Справочник REST API

Все ответы — JSON. Ошибки: `{ "error": { "code": "…", "message": "…" } }`
со статусами 400/401/403/404/409/413/500. Аутентификация — httpOnly-cookie
`session` (выдаётся при входе). Даты — ISO 8601 (UTC).

## Конфигурация

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/config` | публичный бренд-конфиг: product, theme, features, limits |

## Аутентификация

| Метод | Путь | Тело / параметры |
| --- | --- | --- |
| POST | `/api/auth/register` | `email, password (≥8), lastName, firstName, middleName?` |
| POST | `/api/auth/login` | `email, password` |
| POST | `/api/auth/logout` | — |
| GET | `/api/auth/me` | → `{ user \| null }` |
| PATCH | `/api/auth/profile` | `lastName, firstName, middleName?` |
| POST | `/api/auth/change-password` | `oldPassword, newPassword` |

## Курсы

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/courses?state=ACTIVE\|ARCHIVED` | мои курсы (с ролью, преподавателями, числом учеников) |
| POST | `/api/courses` | `name, section?, subject?, room?, description?, themeColor?` |
| POST | `/api/courses/join` | `code` — вступить учеником |
| GET | `/api/courses/:id` | курс (ученику код приглашения не отдаётся) |
| PATCH | `/api/courses/:id` | + `streamMode (ALL_POST\|COMMENT_ONLY\|TEACHERS_ONLY)`, `gradeScale (POINTS\|FIVE\|PERCENT)` |
| POST | `/api/courses/:id/archive` / `restore` | архив/восстановление (учитель) |
| POST | `/api/courses/:id/copy` | копия структуры (темы + задания черновиками) |
| DELETE | `/api/courses/:id` | удаление (владелец, только из архива) |
| POST | `/api/courses/:id/code/reset` | новый код приглашения |
| GET | `/api/courses/:id/members` | участники |
| POST | `/api/courses/:id/invite` | `email, role (TEACHER\|STUDENT)` |
| DELETE | `/api/courses/:id/members/:userId` | удалить участника / выйти самому |

## Темы

GET/POST `/api/courses/:courseId/topics`; PATCH/DELETE `/api/topics/:id`.

## Задания (coursework)

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/courses/:courseId/coursework` | учителю — всё (+счётчики), ученику — опубликованное и адресованное (+своя сдача) |
| POST | `/api/courses/:courseId/coursework` | `type (ASSIGNMENT\|QUIZ\|QUESTION\|MATERIAL), title, description?, maxPoints?, dueAt?, topicId?, allowLate?, state (PUBLISHED\|DRAFT\|SCHEDULED), scheduledAt?, assigneeIds?, attachments?` |
| GET | `/api/coursework/:id` | деталь (+topic, attachments, rubric; учителю — assigneeIds, counters) |
| PATCH | `/api/coursework/:id` | обновление |
| POST | `/api/coursework/:id/publish` | публикация черновика (уведомляет учеников) |
| DELETE | `/api/coursework/:id` | удаление |
| PUT | `/api/coursework/:id/rubric` | `criteria: [{title, description?, levels: [{title, points}]}]` |
| DELETE | `/api/coursework/:id/rubric` | удалить рубрику |

Формат `attachments` при создании поста:
`[{kind:'FILE', fileId}, {kind:'LINK', url, title?}]` — fileId из POST /api/files.

## Тесты

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/coursework/:id/quiz` | вопросы (ученику — без правильных ответов) |
| PUT | `/api/coursework/:id/quiz` | `questions: [{type: SINGLE\|MULTI\|TEXT, text, options?, correct, points}], showScore?` — полная замена; maxPoints = сумма баллов |

## Сдачи

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/coursework/:id/submissions` | учителю: все адресаты + работы |
| GET | `/api/coursework/:id/my` | ученику: своя сдача (для теста — `quizAnswers`, `quizScoreVisible`) |
| GET | `/api/submissions/:id` | деталь + история событий (учитель или владелец) |
| PATCH | `/api/submissions/:id` | ученик: `answerText?, attachments?, answers?` (тест: `{questionId: ответ}`) |
| POST | `/api/submissions/:id/turn-in` | сдать (тест автопроверяется → draft_grade) |
| POST | `/api/submissions/:id/reclaim` | отменить сдачу |
| POST | `/api/submissions/:id/grade` | учитель: `draftGrade` (черновик) |
| POST | `/api/submissions/:id/return` | учитель: вернуть; `grade?` (иначе берётся черновик) |
| PUT | `/api/submissions/:id/rubric` | `grades: {criterionId: levelId}` → сумма в draft_grade |

## Лента

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/courses/:courseId/announcements` | закреплённые сверху; ученикам — только опубликованные |
| POST | `/api/courses/:courseId/announcements` | `text, state?, scheduledAt?, attachments?` (права — по stream_mode) |
| PATCH / DELETE | `/api/announcements/:id` | автор или учитель |
| POST | `/api/announcements/:id/pin` | закрепить/открепить (учитель) |

## Комментарии

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/comments?scope=&scopeId=` | scope: ANNOUNCEMENT \| COURSEWORK \| SUBMISSION (приватные) |
| POST | `/api/comments` | `scope, scopeId, text` |
| DELETE | `/api/comments/:id` | автор или учитель курса |

## Журнал, файлы, прочее

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/courses/:id/grades` | журнал (роль определяет состав ответа) |
| POST | `/api/files` | multipart `file` → запись вложения (статус UPLOAD) |
| GET | `/api/files/:id` | скачивание с проверкой прав |
| DELETE | `/api/files/:id` | удаление вложения (правила — по владельцу) |
| GET | `/api/notifications` | последние 50 + unreadCount |
| POST | `/api/notifications/read` | `ids?` — отметить прочитанными (без ids — все) |
| GET | `/api/todo` | `{ toSubmit, done, toReview }` |
| GET | `/api/calendar?from=&to=` | дедлайны в диапазоне |
| GET/POST/DELETE | `/api/comment-bank` | банк комментариев учителя |
