// Ветка комментариев: используется в ленте, заданиях и приватной переписке по сдаче.
import { useEffect, useState, type FormEvent } from 'react';
import { del, get, post } from '../api';
import { useBrand } from '../brand';
import { useUser } from '../auth';
import { Avatar, useToast } from './ui';
import type { Comment } from '../types';
import { formatDateTime, shortName } from '../utils';

export function Comments({
  scope,
  scopeId,
  canComment,
  canModerate,
  title,
  compact,
}: {
  scope: 'ANNOUNCEMENT' | 'COURSEWORK' | 'SUBMISSION';
  scopeId: number;
  canComment: boolean;
  canModerate: boolean;
  title?: string;
  compact?: boolean;
}) {
  const brand = useBrand();
  const user = useUser();
  const toast = useToast();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    get<{ comments: Comment[] }>(`/api/comments?scope=${scope}&scopeId=${scopeId}`)
      .then((r) => setComments(r.comments))
      .catch(() => setComments([]));

  useEffect(() => {
    void load();
  }, [scope, scopeId]);

  if (!brand.features.comments) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await post('/api/comments', { scope, scopeId, text });
      setText('');
      await load();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await del(`/api/comments/${id}`);
      await load();
    } catch (err) {
      toast.error(err);
    }
  };

  const list = comments ?? [];

  return (
    <div className={compact ? '' : 'mt-16'}>
      {title && list.length + (canComment ? 1 : 0) > 0 && (
        <div className="small muted" style={{ fontWeight: 500, marginBottom: 8 }}>
          {title}
        </div>
      )}
      <div className="stack" style={{ gap: 10 }}>
        {list.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: 'flex-start' }}>
            <Avatar person={c.author} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small">
                <strong>{shortName(c.author)}</strong>{' '}
                <span className="faint">{formatDateTime(c.created_at)}</span>
              </div>
              <div className="pre-wrap small">{c.text}</div>
            </div>
            {(canModerate || c.author.id === user.id) && (
              <button className="icon-btn" style={{ width: 26, height: 26, fontSize: 14 }} onClick={() => void remove(c.id)} aria-label="Удалить комментарий">
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {canComment && (
        <form className="row mt-8" onSubmit={submit}>
          <input
            className="input"
            placeholder="Написать комментарий…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn btn-sm" disabled={busy || !text.trim()}>
            Отправить
          </button>
        </form>
      )}
    </div>
  );
}
