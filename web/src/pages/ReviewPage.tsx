// Проверка работ (преподаватель): слева список учеников со статусами,
// справа выбранная работа — ответ, вложения, тест, оценка, возврат,
// приватные комментарии и банк комментариев.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { del, get, post, put } from '../api';
import { useBrand } from '../brand';
import { Avatar, Empty, Spinner, useToast } from '../components/ui';
import { AttachmentList } from '../components/ui';
import { Comments } from '../components/Comments';
import type { Course, Coursework, PersonRef, QuizQuestion, Rubric, Submission } from '../types';
import {
  SUBMISSION_STATE_LABEL,
  formatDateTime,
  formatDue,
  shortName,
} from '../utils';

interface ReviewItem {
  student: PersonRef;
  submission: Submission;
}

function CommentBankPanel({ onPick }: { onPick: (text: string) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const load = () =>
    get<{ items: { id: number; text: string }[] }>('/api/comment-bank')
      .then((r) => setItems(r.items))
      .catch(() => {});

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    try {
      await post('/api/comment-bank', { text });
      setText('');
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (id: number) => {
    await del(`/api/comment-bank/${id}`).catch(() => {});
    void load();
  };

  return (
    <div className="card card-pad">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} style={{ padding: 0 }}>
        Банк комментариев {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="stack mt-8" style={{ gap: 8 }}>
          {items.length === 0 && <span className="small faint">Сохраняйте часто используемые комментарии.</span>}
          {items.map((i) => (
            <div key={i.id} className="row" style={{ alignItems: 'flex-start' }}>
              <a className="small" style={{ flex: 1, cursor: 'pointer' }} onClick={() => onPick(i.text)}>
                {i.text}
              </a>
              <button className="icon-btn" style={{ width: 22, height: 22, fontSize: 13 }} onClick={() => void remove(i.id)} aria-label="Удалить">
                ×
              </button>
            </div>
          ))}
          <div className="row">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Новый комментарий" />
            <button className="btn btn-sm" onClick={() => void add()} disabled={!text.trim()}>
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Оценка по рубрике: выбор уровня по каждому критерию, сумма — в черновик.
function RubricPanel({
  rubric,
  submission,
  onGraded,
}: {
  rubric: Rubric;
  submission: Submission;
  onGraded: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Record<number, number>>({});

  useEffect(() => {
    const initial: Record<number, number> = {};
    for (const g of submission.rubricGrades) initial[g.criterion_id] = g.level_id;
    setSelected(initial);
  }, [submission.id, submission.rubricGrades.length]);

  const pick = async (criterionId: number, levelId: number) => {
    const next = { ...selected, [criterionId]: levelId };
    setSelected(next);
    try {
      await put(`/api/submissions/${submission.id}/rubric`, { grades: next });
      onGraded();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <h3>Рубрика оценивания</h3>
      {rubric.criteria.map((c) => (
        <div key={c.id}>
          <div className="small" style={{ fontWeight: 500, marginBottom: 4 }}>
            {c.title}
            {c.description && <span className="faint"> — {c.description}</span>}
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {c.levels.map((l) => (
              <button
                key={l.id}
                className={selected[c.id] === l.id ? 'btn btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => void pick(c.id, l.id)}
              >
                {l.title} · {l.points}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="small faint">Сумма выбранных уровней записывается в черновик оценки.</p>
    </div>
  );
}

export function ReviewPage() {
  const { courseId, courseworkId } = useParams();
  const brand = useBrand();
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [cw, setCw] = useState<Coursework | null>(null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [gradeInput, setGradeInput] = useState('');
  const [privateComment, setPrivateComment] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedId = params.get('student') ? Number(params.get('student')) : null;

  const load = useCallback(async () => {
    const [c, w, s] = await Promise.all([
      get<{ course: Course }>(`/api/courses/${courseId}`),
      get<{ coursework: Coursework }>(`/api/coursework/${courseworkId}`),
      get<{ submissions: ReviewItem[] }>(`/api/coursework/${courseworkId}/submissions`),
    ]);
    setCourse(c.course);
    setCw(w.coursework);
    setItems(s.submissions);
    if (w.coursework.type === 'QUIZ') {
      const q = await get<{ questions: QuizQuestion[] }>(`/api/coursework/${courseworkId}/quiz`);
      setQuestions(q.questions);
    }
    return s.submissions;
  }, [courseId, courseworkId]);

  useEffect(() => {
    load()
      .then((list) => {
        if (!selectedId && list.length > 0) {
          // По умолчанию открываем первого сдавшего, иначе первого в списке
          const first = list.find((i) => i.submission.state === 'TURNED_IN') ?? list[0];
          setParams({ student: String(first.student.id) }, { replace: true });
        }
      })
      .catch(toast.error);
  }, [load]);

  const current = items?.find((i) => i.student.id === selectedId) ?? null;

  useEffect(() => {
    if (current) {
      setGradeInput(
        current.submission.draft_grade !== null
          ? String(current.submission.draft_grade)
          : current.submission.grade !== null
            ? String(current.submission.grade)
            : '',
      );
    }
  }, [selectedId, items]);

  if (!course || !cw || !items) return <Spinner />;

  const select = (id: number) => setParams({ student: String(id) });

  const idx = current ? items.findIndex((i) => i.student.id === current.student.id) : -1;
  const prev = idx > 0 ? items[idx - 1] : null;
  const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;

  const saveDraftGrade = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await post(`/api/submissions/${current.submission.id}/grade`, {
        draftGrade: gradeInput === '' ? null : Number(gradeInput),
      });
      await load();
      toast.success('Черновик оценки сохранён');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const returnWork = async () => {
    if (!current) return;
    setBusy(true);
    try {
      // Сбой отправки комментария не должен блокировать возврат работы
      if (privateComment.trim() && brand.features.privateComments) {
        try {
          await post('/api/comments', {
            scope: 'SUBMISSION',
            scopeId: current.submission.id,
            text: privateComment.trim(),
          });
          setPrivateComment('');
        } catch (e) {
          toast.error(e);
        }
      }
      await post(`/api/submissions/${current.submission.id}/return`, {
        grade: gradeInput === '' ? undefined : Number(gradeInput),
      });
      toast.success('Работа возвращена ученику');
      await load();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const answerMap = new Map((current?.submission.quizAnswers ?? []).map((a) => [a.questionId, a]));

  return (
    <div>
      <div className="mb-16">
        <Link to={`/courses/${course.id}?tab=classwork`} className="small muted">
          ← {course.name} · Задания
        </Link>
        <div className="row mt-8">
          <h1>{cw.title}</h1>
          <span className="small muted">{formatDue(cw.due_at)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 280px' }} className="card">
          {items.length === 0 && <Empty>В курсе нет учеников.</Empty>}
          {items.map((i) => (
            <div
              key={i.student.id}
              className="list-row"
              style={{
                cursor: 'pointer',
                background: i.student.id === selectedId ? 'var(--color-primary-soft)' : undefined,
              }}
              onClick={() => select(i.student.id)}
            >
              <Avatar person={i.student} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small" style={{ fontWeight: 500 }}>
                  {shortName(i.student)}
                </div>
                <div className="small faint">
                  {SUBMISSION_STATE_LABEL[i.submission.state]}
                  {i.submission.late ? ' · с опозданием' : ''}
                </div>
              </div>
              <span className="small" style={{ fontWeight: 600 }}>
                {i.submission.state === 'RETURNED' && i.submission.grade !== null
                  ? i.submission.grade
                  : i.submission.draft_grade !== null
                    ? `(${i.submission.draft_grade})`
                    : ''}
              </span>
            </div>
          ))}
        </div>

        {current ? (
          <div style={{ flex: 1, minWidth: 0 }} className="stack">
            <div className="row-between">
              <div className="row">
                <h2>{shortName(current.student)}</h2>
                <span className="badge">{SUBMISSION_STATE_LABEL[current.submission.state]}</span>
                {current.submission.late && <span className="badge badge-warn">С опозданием</span>}
              </div>
              <div className="row">
                <button className="btn btn-secondary btn-sm" disabled={!prev} onClick={() => prev && select(prev.student.id)}>
                  ← Предыдущий
                </button>
                <button className="btn btn-secondary btn-sm" disabled={!next} onClick={() => next && select(next.student.id)}>
                  Следующий →
                </button>
              </div>
            </div>

            <div className="card card-pad stack" style={{ gap: 10 }}>
              {current.submission.turned_in_at && (
                <div className="small muted">Сдано: {formatDateTime(current.submission.turned_in_at)}</div>
              )}
              {current.submission.answer_text ? (
                <p className="pre-wrap">{current.submission.answer_text}</p>
              ) : (
                !cw.max_points && cw.type !== 'QUIZ' && <span className="faint small">Без текстового ответа</span>
              )}
              <AttachmentList attachments={current.submission.attachments} />
              {cw.type === 'QUIZ' && questions.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  {questions.map((q, qi) => {
                    const a = answerMap.get(q.id);
                    const answerLabel =
                      a?.answer === null || a?.answer === undefined
                        ? '—'
                        : q.options
                          ? Array.isArray(a.answer)
                            ? (a.answer as number[]).map((i) => q.options![i]).join(', ')
                            : q.options[Number(a.answer)]
                          : String(a.answer);
                    return (
                      <div key={q.id} className="row-between" style={{ alignItems: 'flex-start' }}>
                        <div className="small" style={{ flex: 1 }}>
                          <span className="muted">{qi + 1}.</span> {q.text}
                          <div>Ответ: <strong>{answerLabel}</strong></div>
                        </div>
                        <span className={a?.awarded ? 'badge badge-ok' : 'badge badge-danger'}>
                          {a?.awarded ?? 0} из {q.points}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card card-pad stack" style={{ gap: 10 }}>
              <div className="row">
                <span className="field-label" style={{ width: 140 }}>
                  Оценка {cw.max_points ? `(из ${cw.max_points})` : ''}
                </span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  style={{ width: 110 }}
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => void saveDraftGrade()} disabled={busy}>
                  Сохранить черновик
                </button>
                <button className="btn btn-sm" onClick={() => void returnWork()} disabled={busy}>
                  Вернуть с оценкой
                </button>
              </div>
              {brand.features.privateComments && (
                <textarea
                  className="textarea"
                  style={{ minHeight: 60 }}
                  placeholder="Приватный комментарий ученику (отправится при возврате)"
                  value={privateComment}
                  onChange={(e) => setPrivateComment(e.target.value)}
                />
              )}
            </div>

            {brand.features.rubrics && cw.rubric && cw.rubric.criteria.length > 0 && (
              <RubricPanel rubric={cw.rubric} submission={current.submission} onGraded={() => void load()} />
            )}

            {brand.features.privateComments && (
              <CommentBankPanel onPick={(text) => setPrivateComment((v) => (v ? `${v}\n${text}` : text))} />
            )}

            {brand.features.privateComments && (
              <div className="card card-pad">
                <Comments
                  scope="SUBMISSION"
                  scopeId={current.submission.id}
                  canComment={course.state === 'ACTIVE'}
                  canModerate
                  title="Приватная переписка с учеником"
                  compact
                />
              </div>
            )}
          </div>
        ) : (
          <Empty>Выберите ученика из списка.</Empty>
        )}
      </div>
    </div>
  );
}
