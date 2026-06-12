// Страница задания. Ученик: инструкция, тест, карточка «Моя работа»
// (вложения, ответ, кнопка «Сдать»), приватные комментарии преподавателю.
// Преподаватель: инструкция, счётчики сдач, переход к проверке работ.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, patch, post } from '../api';
import { useBrand } from '../brand';
import {
  AttachmentList,
  AttachmentPicker,
  Empty,
  Spinner,
  usePendingAttachments,
  useToast,
  removeSavedAttachment,
} from '../components/ui';
import { Comments } from '../components/Comments';
import type { Course, Coursework, QuizAnswer, QuizQuestion, Submission } from '../types';
import {
  COURSEWORK_TYPE_LABEL,
  SUBMISSION_STATE_LABEL,
  formatDue,
  formatGrade,
  isOverdue,
} from '../utils';

// Прохождение теста учеником: вопросы, ответы, индикация баллов после проверки.
function QuizForm({
  questions,
  answers,
  scoreVisible,
  editable,
  onChange,
  awardedMap,
}: {
  questions: QuizQuestion[];
  answers: Map<number, unknown>;
  scoreVisible: boolean;
  editable: boolean;
  onChange: (questionId: number, value: unknown) => void;
  awardedMap: Map<number, number | null>;
}) {
  return (
    <div className="stack">
      {questions.map((q, i) => {
        const value = answers.get(q.id);
        const awarded = awardedMap.get(q.id);
        return (
          <div key={q.id} className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row-between">
              <strong>
                {i + 1}. {q.text}
              </strong>
              <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                {scoreVisible && awarded !== undefined && awarded !== null ? (
                  <span className={awarded > 0 ? 'badge badge-ok' : 'badge badge-danger'}>
                    {awarded} из {q.points}
                  </span>
                ) : (
                  `${q.points} б.`
                )}
              </span>
            </div>
            {q.type === 'TEXT' ? (
              <input
                className="input"
                value={String(value ?? '')}
                disabled={!editable}
                placeholder="Ваш ответ"
                onChange={(e) => onChange(q.id, e.target.value)}
              />
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {(q.options ?? []).map((opt, oi) => (
                  <label key={oi} className="checkbox-row">
                    {q.type === 'SINGLE' ? (
                      <input
                        type="radio"
                        name={`q${q.id}`}
                        checked={Number(value) === oi && value !== null && value !== undefined}
                        disabled={!editable}
                        onChange={() => onChange(q.id, oi)}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={Array.isArray(value) && (value as number[]).includes(oi)}
                        disabled={!editable}
                        onChange={(e) => {
                          const current = Array.isArray(value) ? (value as number[]) : [];
                          onChange(q.id, e.target.checked ? [...current, oi] : current.filter((x) => x !== oi));
                        }}
                      />
                    )}
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StudentView({ course, cw }: { course: Course; cw: Coursework }) {
  const toast = useToast();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [quizMeta, setQuizMeta] = useState<{ visible: boolean }>({ visible: false });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<number, unknown>>(new Map());
  const [awardedMap, setAwardedMap] = useState<Map<number, number | null>>(new Map());
  const [answerText, setAnswerText] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = usePendingAttachments();

  const isQuiz = cw.type === 'QUIZ';

  const load = useCallback(async () => {
    const r = await get<{ submission: Submission; quizAnswers?: QuizAnswer[]; quizScoreVisible?: boolean }>(
      `/api/coursework/${cw.id}/my`,
    );
    setSubmission(r.submission);
    setAnswerText(r.submission.answer_text ?? '');
    if (r.quizAnswers) {
      setAnswers(new Map(r.quizAnswers.map((a) => [a.questionId, a.answer])));
      setAwardedMap(new Map(r.quizAnswers.map((a) => [a.questionId, a.awarded])));
      setQuizMeta({ visible: !!r.quizScoreVisible });
    }
  }, [cw.id]);

  useEffect(() => {
    const loads = [load()];
    if (isQuiz) {
      loads.push(
        get<{ questions: QuizQuestion[] }>(`/api/coursework/${cw.id}/quiz`).then((r) => setQuestions(r.questions)),
      );
    }
    Promise.all(loads).catch(toast.error);
  }, [cw.id, load]);

  if (!submission) return <Spinner />;

  const editable =
    course.state === 'ACTIVE' && submission.state !== 'TURNED_IN' && submission.state !== 'RETURNED';
  const canResubmit = course.state === 'ACTIVE' && submission.state === 'RETURNED';

  const saveDraft = async (silent = false) => {
    try {
      const body: Record<string, unknown> = { answerText, attachments: pending.payload };
      if (isQuiz) body.answers = Object.fromEntries(answers);
      const r = await patch<{ submission: Submission }>(`/api/submissions/${submission.id}`, body);
      setSubmission(r.submission);
      pending.reset();
      if (!silent) toast.success('Сохранено');
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  const turnIn = async () => {
    setBusy(true);
    try {
      await saveDraft(true);
      await post(`/api/submissions/${submission.id}/turn-in`);
      toast.success('Работа сдана');
      await load();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const reclaim = async () => {
    setBusy(true);
    try {
      await post(`/api/submissions/${submission.id}/reclaim`);
      toast.success('Сдача отменена — можно внести изменения');
      await load();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const overdueBlocked = !cw.allow_late && isOverdue(cw.due_at);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 480px', minWidth: 0 }} className="stack">
        {cw.description && (
          <div className="card card-pad">
            <p className="pre-wrap">{cw.description}</p>
          </div>
        )}
        <AttachmentList attachments={cw.attachments} />
        {isQuiz && questions.length > 0 && (
          <QuizForm
            questions={questions}
            answers={answers}
            awardedMap={awardedMap}
            scoreVisible={quizMeta.visible}
            editable={editable || canResubmit}
            onChange={(qid, value) => setAnswers(new Map(answers).set(qid, value))}
          />
        )}
        <div className="card card-pad">
          <Comments
            scope="COURSEWORK"
            scopeId={cw.id}
            canComment={course.state === 'ACTIVE' && course.stream_mode !== 'TEACHERS_ONLY'}
            canModerate={false}
            title="Комментарии курса (видны всем участникам)"
            compact
          />
        </div>
      </div>

      <div style={{ flex: '0 0 300px' }} className="stack">
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row-between">
            <h3>Моя работа</h3>
            <span
              className={
                submission.state === 'RETURNED'
                  ? 'badge badge-ok'
                  : submission.state === 'TURNED_IN'
                    ? 'badge badge-primary'
                    : isOverdue(cw.due_at)
                      ? 'badge badge-danger'
                      : 'badge'
              }
            >
              {submission.state === 'ASSIGNED' && isOverdue(cw.due_at)
                ? 'Срок истёк'
                : SUBMISSION_STATE_LABEL[submission.state]}
              {submission.late && submission.state !== 'ASSIGNED' ? ' (с опозданием)' : ''}
            </span>
          </div>

          {submission.state === 'RETURNED' && (
            <div>
              <span className="muted small">Оценка: </span>
              <strong>{formatGrade(submission.grade, cw.max_points, course.grade_scale)}</strong>
            </div>
          )}

          {!isQuiz && (
            <textarea
              className="textarea"
              placeholder={cw.type === 'QUESTION' ? 'Ваш ответ на вопрос' : 'Текстовый ответ (необязательно)'}
              value={answerText}
              disabled={!editable && !canResubmit}
              onChange={(e) => setAnswerText(e.target.value)}
            />
          )}

          {submission.attachments.length > 0 && (
            <AttachmentList
              attachments={submission.attachments}
              onRemove={
                editable || canResubmit
                  ? (id) =>
                      void removeSavedAttachment(id).then((ok) => {
                        if (ok) void load();
                      })
                  : undefined
              }
            />
          )}
          {(editable || canResubmit) && cw.type !== 'QUESTION' && !isQuiz && <AttachmentPicker pending={pending} />}

          {(editable || canResubmit) && (
            <>
              <button className="btn btn-secondary" onClick={() => void saveDraft()} disabled={busy}>
                Сохранить черновик
              </button>
              <button className="btn" onClick={() => void turnIn()} disabled={busy || overdueBlocked}>
                {canResubmit ? 'Сдать повторно' : 'Сдать работу'}
              </button>
              {overdueBlocked && (
                <p className="small faint">Срок сдачи истёк, преподаватель не принимает работы с опозданием.</p>
              )}
            </>
          )}
          {submission.state === 'TURNED_IN' && course.state === 'ACTIVE' && (
            <button className="btn btn-secondary" onClick={() => void reclaim()} disabled={busy}>
              Отменить сдачу
            </button>
          )}
        </div>

        <div className="card card-pad">
          <Comments
            scope="SUBMISSION"
            scopeId={submission.id}
            canComment={course.state === 'ACTIVE'}
            canModerate={false}
            title="Приватные комментарии (видны только преподавателю)"
            compact
          />
        </div>
      </div>
    </div>
  );
}

function TeacherView({ course, cw }: { course: Course; cw: Coursework }) {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  useEffect(() => {
    if (cw.type === 'QUIZ') {
      get<{ questions: QuizQuestion[] }>(`/api/coursework/${cw.id}/quiz`)
        .then((r) => setQuestions(r.questions))
        .catch(() => {});
    }
  }, [cw.id]);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 480px', minWidth: 0 }} className="stack">
        {cw.description ? (
          <div className="card card-pad">
            <p className="pre-wrap">{cw.description}</p>
          </div>
        ) : (
          <Empty>Без описания.</Empty>
        )}
        <AttachmentList attachments={cw.attachments} />
        {questions.length > 0 && (
          <div className="card card-pad">
            <h3 className="mb-16">Вопросы теста</h3>
            <ol style={{ margin: 0, paddingLeft: 20 }} className="stack">
              {questions.map((q) => (
                <li key={q.id}>
                  <span>{q.text}</span>{' '}
                  <span className="faint small">
                    ({q.points} б.
                    {q.options ? `, верно: ${
                      Array.isArray(q.correct)
                        ? (q.correct as number[]).map((i) => q.options![i]).join(', ')
                        : q.options[Number(q.correct)]
                    }` : `, верно: ${(q.correct as string[]).join(' / ')}`})
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="card card-pad">
          <Comments
            scope="COURSEWORK"
            scopeId={cw.id}
            canComment={course.state === 'ACTIVE'}
            canModerate
            title="Комментарии курса"
            compact
          />
        </div>
      </div>
      <div style={{ flex: '0 0 300px' }} className="card card-pad stack">
        {cw.type !== 'MATERIAL' && cw.counters && (
          <div className="row" style={{ gap: 20 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{cw.counters.turnedIn}</div>
              <div className="small muted">Сдано</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{cw.counters.graded}</div>
              <div className="small muted">Проверено</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{cw.counters.assigned}</div>
              <div className="small muted">Назначено</div>
            </div>
          </div>
        )}
        {cw.type !== 'MATERIAL' && (
          <button className="btn" onClick={() => navigate(`/courses/${course.id}/coursework/${cw.id}/review`)}>
            Работы учеников
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => navigate(`/courses/${course.id}/coursework/${cw.id}/edit`)}>
          Изменить
        </button>
      </div>
    </div>
  );
}

export function CourseworkDetailPage() {
  const { courseId, courseworkId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [cw, setCw] = useState<Coursework | null>(null);

  useEffect(() => {
    Promise.all([
      get<{ course: Course }>(`/api/courses/${courseId}`),
      get<{ coursework: Coursework }>(`/api/coursework/${courseworkId}`),
    ])
      .then(([c, w]) => {
        setCourse(c.course);
        setCw(w.coursework);
      })
      .catch((e) => {
        toast.error(e);
        navigate(`/courses/${courseId}?tab=classwork`);
      });
  }, [courseId, courseworkId]);

  if (!course || !cw) return <Spinner />;

  return (
    <div className="content-narrow">
      <div className="mb-16">
        <Link to={`/courses/${course.id}?tab=classwork`} className="small muted">
          ← {course.name} · Задания
        </Link>
        <div className="row mt-8">
          <h1>{cw.title}</h1>
          <span className="badge">{COURSEWORK_TYPE_LABEL[cw.type]}</span>
          {cw.state === 'DRAFT' && <span className="badge badge-warn">Черновик</span>}
        </div>
        <div className="small muted mt-8">
          {cw.type !== 'MATERIAL' && <>{formatDue(cw.due_at)}{cw.max_points ? ` · ${cw.max_points} баллов` : ' · без оценки'}</>}
        </div>
      </div>
      {course.role === 'TEACHER' ? <TeacherView course={course} cw={cw} /> : <StudentView course={course} cw={cw} />}
    </div>
  );
}
