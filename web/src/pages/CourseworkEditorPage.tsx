// Редактор задания/теста/вопроса/материала.
// Слева — содержимое (название, описание, вложения, вопросы теста),
// справа — панель настроек (тема, баллы, срок, адресаты), как в Classroom.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiRequestError, del, get, patch, post, put } from '../api';
import { useBrand } from '../brand';
import {
  AttachmentList,
  AttachmentPicker,
  Field,
  Spinner,
  usePendingAttachments,
  useToast,
  removeSavedAttachment,
} from '../components/ui';
import type { Course, Coursework, CourseworkType, Member, QuizQuestion, Topic } from '../types';
import { COURSEWORK_TYPE_LABEL, fromLocalInput, shortName, toLocalInput } from '../utils';

interface EditableQuestion {
  key: string;
  type: 'SINGLE' | 'MULTI' | 'TEXT';
  text: string;
  options: string[];
  correctSingle: number;
  correctMulti: number[];
  correctText: string;
  points: number;
}

function newQuestion(): EditableQuestion {
  return {
    key: String(Date.now() + Math.random()),
    type: 'SINGLE',
    text: '',
    options: ['', ''],
    correctSingle: 0,
    correctMulti: [],
    correctText: '',
    points: 1,
  };
}

function QuestionEditor({
  q,
  index,
  onChange,
  onRemove,
}: {
  q: EditableQuestion;
  index: number;
  onChange: (q: EditableQuestion) => void;
  onRemove: () => void;
}) {
  const setOption = (i: number, value: string) => {
    const options = [...q.options];
    options[i] = value;
    onChange({ ...q, options });
  };

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row-between">
        <strong>Вопрос {index + 1}</strong>
        <div className="row">
          <select
            className="select"
            style={{ width: 200 }}
            value={q.type}
            onChange={(e) => onChange({ ...q, type: e.target.value as EditableQuestion['type'] })}
          >
            <option value="SINGLE">Один вариант</option>
            <option value="MULTI">Несколько вариантов</option>
            <option value="TEXT">Короткий ответ</option>
          </select>
          <input
            className="input"
            type="number"
            min={0}
            style={{ width: 90 }}
            value={q.points}
            onChange={(e) => onChange({ ...q, points: Number(e.target.value) })}
            title="Баллы за вопрос"
          />
          <button type="button" className="icon-btn" onClick={onRemove} aria-label="Удалить вопрос">
            ×
          </button>
        </div>
      </div>
      <textarea
        className="textarea"
        style={{ minHeight: 56 }}
        placeholder="Текст вопроса"
        value={q.text}
        onChange={(e) => onChange({ ...q, text: e.target.value })}
      />
      {q.type === 'TEXT' ? (
        <Field label="Верные ответы (через точку с запятой; регистр не учитывается)">
          <input
            className="input"
            value={q.correctText}
            onChange={(e) => onChange({ ...q, correctText: e.target.value })}
            placeholder="Например: 3; три"
          />
        </Field>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {q.options.map((opt, i) => (
            <div key={i} className="row">
              {q.type === 'SINGLE' ? (
                <input
                  type="radio"
                  name={`correct-${q.key}`}
                  checked={q.correctSingle === i}
                  onChange={() => onChange({ ...q, correctSingle: i })}
                  title="Верный вариант"
                />
              ) : (
                <input
                  type="checkbox"
                  checked={q.correctMulti.includes(i)}
                  onChange={(e) =>
                    onChange({
                      ...q,
                      correctMulti: e.target.checked
                        ? [...q.correctMulti, i]
                        : q.correctMulti.filter((x) => x !== i),
                    })
                  }
                  title="Верный вариант"
                />
              )}
              <input
                className="input"
                value={opt}
                placeholder={`Вариант ${i + 1}`}
                onChange={(e) => setOption(i, e.target.value)}
              />
              {q.options.length > 2 && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    onChange({
                      ...q,
                      options: q.options.filter((_, x) => x !== i),
                      correctSingle: q.correctSingle === i ? 0 : q.correctSingle > i ? q.correctSingle - 1 : q.correctSingle,
                      correctMulti: q.correctMulti.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)),
                    })
                  }
                  aria-label="Убрать вариант"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {q.options.length < 20 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => onChange({ ...q, options: [...q.options, ''] })}
            >
              Добавить вариант
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Редактируемая рубрика: критерии × уровни.
interface EditableCriterion {
  key: string;
  title: string;
  description: string;
  levels: { title: string; points: number }[];
}

function RubricEditor({
  criteria,
  onChange,
}: {
  criteria: EditableCriterion[];
  onChange: (next: EditableCriterion[]) => void;
}) {
  const update = (key: string, patch: Partial<EditableCriterion>) =>
    onChange(criteria.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  return (
    <div className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row-between">
        <h3>Рубрика оценивания</h3>
        {criteria.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>
            Убрать рубрику
          </button>
        )}
      </div>
      {criteria.map((c, ci) => (
        <div key={c.key} className="stack" style={{ gap: 6, borderTop: ci > 0 ? '1px solid var(--color-border)' : 'none', paddingTop: ci > 0 ? 12 : 0 }}>
          <div className="row">
            <input
              className="input"
              placeholder={`Критерий ${ci + 1} (например: Полнота решения)`}
              value={c.title}
              onChange={(e) => update(c.key, { title: e.target.value })}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => onChange(criteria.filter((x) => x.key !== c.key))}
              aria-label="Удалить критерий"
            >
              ×
            </button>
          </div>
          {c.levels.map((l, li) => (
            <div key={li} className="row" style={{ paddingLeft: 16 }}>
              <input
                className="input"
                placeholder={`Уровень ${li + 1} (например: Полностью)`}
                value={l.title}
                onChange={(e) =>
                  update(c.key, { levels: c.levels.map((x, i) => (i === li ? { ...x, title: e.target.value } : x)) })
                }
              />
              <input
                className="input"
                type="number"
                min={0}
                style={{ width: 90 }}
                title="Баллы уровня"
                value={l.points}
                onChange={(e) =>
                  update(c.key, { levels: c.levels.map((x, i) => (i === li ? { ...x, points: Number(e.target.value) } : x)) })
                }
              />
              {c.levels.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => update(c.key, { levels: c.levels.filter((_, i) => i !== li) })}
                  aria-label="Убрать уровень"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start', marginLeft: 16 }}
            onClick={() => update(c.key, { levels: [...c.levels, { title: '', points: 0 }] })}
          >
            Добавить уровень
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() =>
          onChange([
            ...criteria,
            { key: String(Date.now()), title: '', description: '', levels: [{ title: '', points: 1 }] },
          ])
        }
      >
        Добавить критерий
      </button>
    </div>
  );
}

export function CourseworkEditorPage() {
  const { courseId, courseworkId } = useParams();
  const [params] = useSearchParams();
  const brand = useBrand();
  const toast = useToast();
  const navigate = useNavigate();

  const isEdit = !!courseworkId;
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<Course | null>(null);
  const [existing, setExisting] = useState<Coursework | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [students, setStudents] = useState<Member[]>([]);

  const [type, setType] = useState<CourseworkType>((params.get('type') as CourseworkType) || 'ASSIGNMENT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxPoints, setMaxPoints] = useState<string>('10');
  const [dueAt, setDueAt] = useState('');
  const [topicId, setTopicId] = useState<string>('');
  const [allowLate, setAllowLate] = useState(true);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [questions, setQuestions] = useState<EditableQuestion[]>([newQuestion()]);
  const [showScore, setShowScore] = useState(true);
  // Снимок исходного теста: PUT отправляется только при реальных изменениях,
  // чтобы не задеть ответы учеников лишним сохранением
  const [quizSnapshot, setQuizSnapshot] = useState('');
  const [rubric, setRubric] = useState<EditableCriterion[]>([]);
  const [hadRubric, setHadRubric] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = usePendingAttachments();

  useEffect(() => {
    const loads: Promise<void>[] = [
      get<{ course: Course }>(`/api/courses/${courseId}`).then((r) => setCourse(r.course)),
      get<{ topics: Topic[] }>(`/api/courses/${courseId}/topics`).then((r) => setTopics(r.topics)),
      get<{ members: Member[] }>(`/api/courses/${courseId}/members`).then((r) =>
        setStudents(r.members.filter((m) => m.role === 'STUDENT')),
      ),
    ];
    if (isEdit) {
      loads.push(
        get<{ coursework: Coursework }>(`/api/coursework/${courseworkId}`).then((r) => {
          const cw = r.coursework;
          setExisting(cw);
          setType(cw.type);
          setTitle(cw.title);
          setDescription(cw.description ?? '');
          setMaxPoints(cw.max_points !== null ? String(cw.max_points) : '');
          setDueAt(toLocalInput(cw.due_at));
          setTopicId(cw.topic_id ? String(cw.topic_id) : '');
          setAllowLate(!!cw.allow_late);
          setShowScore(!!cw.quiz_show_score);
          setAssigneeIds(cw.assigneeIds ?? []);
          if (cw.rubric && cw.rubric.criteria.length > 0) {
            setHadRubric(true);
            setRubric(
              cw.rubric.criteria.map((c) => ({
                key: String(c.id),
                title: c.title,
                description: c.description ?? '',
                levels: c.levels.map((l) => ({ title: l.title, points: l.points })),
              })),
            );
          }
          if (cw.type === 'QUIZ') {
            return get<{ questions: QuizQuestion[] }>(`/api/coursework/${cw.id}/quiz`).then((qr) => {
              if (qr.questions.length > 0) {
                const loaded = qr.questions.map((q) => ({
                  key: String(q.id),
                  type: q.type,
                  text: q.text,
                  options: q.options ?? ['', ''],
                  correctSingle: q.type === 'SINGLE' ? Number(q.correct) : 0,
                  correctMulti: q.type === 'MULTI' ? (q.correct as number[]) : [],
                  correctText: q.type === 'TEXT' ? (q.correct as string[]).join('; ') : '',
                  points: q.points,
                }));
                setQuestions(loaded);
                setQuizSnapshot(JSON.stringify({ q: loaded.map(({ key, ...rest }) => rest), s: !!cw.quiz_show_score }));
              }
            });
          }
          return undefined;
        }),
      );
    }
    Promise.all(loads)
      .then(() => setLoading(false))
      .catch((e) => {
        toast.error(e);
        navigate(`/courses/${courseId}?tab=classwork`);
      });
  }, [courseId, courseworkId]);

  const quizPayload = useMemo(
    () =>
      questions.map((q) => ({
        type: q.type,
        text: q.text,
        options: q.type === 'TEXT' ? undefined : q.options,
        correct:
          q.type === 'SINGLE'
            ? q.correctSingle
            : q.type === 'MULTI'
              ? q.correctMulti
              : q.correctText.split(';').map((s) => s.trim()).filter(Boolean),
        points: q.points,
      })),
    [questions],
  );

  if (loading || !course) return <Spinner />;

  const isMaterial = type === 'MATERIAL';
  const isQuiz = type === 'QUIZ';

  const save = async (state: 'PUBLISHED' | 'DRAFT' | 'SCHEDULED') => {
    setBusy(true);
    try {
      const body = {
        type,
        title,
        description,
        maxPoints: isMaterial || isQuiz || maxPoints === '' ? null : Number(maxPoints),
        dueAt: isMaterial ? null : fromLocalInput(dueAt),
        topicId: topicId ? Number(topicId) : null,
        allowLate,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        state,
        scheduledAt: state === 'SCHEDULED' ? fromLocalInput(scheduledAt) : undefined,
        attachments: pending.payload,
      };
      let cwId: number;
      if (isEdit) {
        await patch(`/api/coursework/${courseworkId}`, body);
        cwId = Number(courseworkId);
        if (state === 'PUBLISHED' && existing?.state !== 'PUBLISHED') {
          await post(`/api/coursework/${cwId}/publish`);
        }
      } else {
        const r = await post<{ coursework: Coursework }>(`/api/courses/${courseId}/coursework`, body);
        cwId = r.coursework.id;
      }
      if (isQuiz) {
        // PUT отправляется только если вопросы или настройка изменились:
        // полная замена вопросов недоступна после первых ответов учеников
        const current = JSON.stringify({ q: questions.map(({ key, ...rest }) => rest), s: showScore });
        if (current !== quizSnapshot) {
          try {
            await put(`/api/coursework/${cwId}/quiz`, { questions: quizPayload, showScore });
          } catch (e) {
            if (e instanceof ApiRequestError && e.status === 409) {
              toast.error(e);
            } else {
              throw e;
            }
          }
        }
      }
      if (brand.features.rubrics && !isMaterial && !isQuiz) {
        const validCriteria = rubric.filter((c) => c.title.trim() && c.levels.some((l) => l.title.trim()));
        if (validCriteria.length > 0) {
          await put(`/api/coursework/${cwId}/rubric`, {
            criteria: validCriteria.map((c) => ({
              title: c.title.trim(),
              description: c.description.trim() || undefined,
              levels: c.levels.filter((l) => l.title.trim()).map((l) => ({ title: l.title.trim(), points: l.points })),
            })),
          });
        } else if (hadRubric) {
          await del(`/api/coursework/${cwId}/rubric`);
        }
      }
      toast.success(
        state === 'PUBLISHED' ? 'Опубликовано' : state === 'SCHEDULED' ? 'Публикация запланирована' : 'Черновик сохранён',
      );
      navigate(`/courses/${courseId}?tab=classwork`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  const quizReady = !isQuiz || questions.every((q) => q.text.trim() && (q.type === 'TEXT' ? q.correctText.trim() : q.options.every((o) => o.trim())));
  const canSave = title.trim().length > 0 && quizReady;

  const toggleAssignee = (id: number) => {
    setAssigneeIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };

  return (
    <div>
      <div className="row-between mb-16">
        <h1>
          {isEdit ? 'Изменить' : 'Создать'}: {COURSEWORK_TYPE_LABEL[type]}
        </h1>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => navigate(`/courses/${courseId}?tab=classwork`)} disabled={busy}>
            Отмена
          </button>
          {(!isEdit || existing?.state === 'DRAFT') && (
            <button className="btn btn-secondary" onClick={() => void save('DRAFT')} disabled={busy || !canSave}>
              Сохранить черновик
            </button>
          )}
          {brand.features.scheduling && !isEdit && (
            <div className="row" style={{ gap: 6 }}>
              <input
                className="input"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ width: 210 }}
                title="Время отложенной публикации"
              />
              <button className="btn btn-secondary" onClick={() => void save('SCHEDULED')} disabled={busy || !canSave || !scheduledAt}>
                Запланировать
              </button>
            </div>
          )}
          <button className="btn" onClick={() => void save('PUBLISHED')} disabled={busy || !canSave}>
            {isEdit && existing?.state === 'PUBLISHED' ? 'Сохранить' : 'Назначить'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }} className="stack">
          <div className="card card-pad stack">
            <Field label="Название">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!isEdit} />
            </Field>
            <Field label={type === 'QUESTION' ? 'Вопрос и пояснение' : 'Инструкция (необязательно)'}>
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            {existing && existing.attachments.length > 0 && (
              <AttachmentList
                attachments={existing.attachments}
                onRemove={(id) =>
                  void removeSavedAttachment(id).then((ok) => {
                    if (ok) setExisting({ ...existing, attachments: existing.attachments.filter((a) => a.id !== id) });
                  })
                }
              />
            )}
            <AttachmentPicker pending={pending} />
          </div>

          {isQuiz && (
            <>
              {questions.map((q, i) => (
                <QuestionEditor
                  key={q.key}
                  q={q}
                  index={i}
                  onChange={(next) => setQuestions(questions.map((x) => (x.key === q.key ? next : x)))}
                  onRemove={() => setQuestions(questions.filter((x) => x.key !== q.key))}
                />
              ))}
              <div className="row">
                <button className="btn btn-secondary" onClick={() => setQuestions([...questions, newQuestion()])}>
                  Добавить вопрос
                </button>
                <span className="small muted">
                  Сумма баллов теста: {questions.reduce((s, q) => s + (Number.isFinite(q.points) ? q.points : 0), 0)}
                </span>
              </div>
            </>
          )}

          {brand.features.rubrics && !isMaterial && !isQuiz && (
            rubric.length > 0 ? (
              <RubricEditor criteria={rubric} onChange={setRubric} />
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  setRubric([{ key: String(Date.now()), title: '', description: '', levels: [{ title: '', points: 1 }] }])
                }
              >
                Добавить рубрику оценивания
              </button>
            )
          )}
        </div>

        <div style={{ flex: '0 0 280px' }} className="card card-pad stack" >
          <Field label="Тема (раздел)">
            <select className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">Без темы</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          {!isMaterial && !isQuiz && (
            <Field label="Баллы (пусто — без оценки)">
              <input
                className="input"
                type="number"
                min={1}
                value={maxPoints}
                onChange={(e) => setMaxPoints(e.target.value)}
              />
            </Field>
          )}
          {isQuiz && (
            <label className="checkbox-row">
              <input type="checkbox" checked={showScore} onChange={(e) => setShowScore(e.target.checked)} />
              Показывать баллы сразу после сдачи
            </label>
          )}
          {!isMaterial && (
            <>
              <Field label="Срок сдачи">
                <input className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </Field>
              <label className="checkbox-row">
                <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
                Принимать после срока
              </label>
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>
                  Кому назначено
                </div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  {assigneeIds.length === 0 ? 'Всем ученикам курса' : `Выбрано: ${assigneeIds.length}`}
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
                  {students.map((s) => (
                    <label key={s.id} className="checkbox-row" style={{ padding: '3px 0' }}>
                      <input
                        type="checkbox"
                        checked={assigneeIds.includes(s.id)}
                        onChange={() => toggleAssignee(s.id)}
                      />
                      <span className="small">{shortName(s)}</span>
                    </label>
                  ))}
                  {students.length === 0 && <span className="small faint">В курсе пока нет учеников</span>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
