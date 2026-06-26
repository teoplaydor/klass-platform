// Минимальный UI-кит: модальные окна, меню, тосты, вложения.
// Все цвета и радиусы — через CSS-токены темы (см. theme.css).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiRequestError, del, uploadFile } from '../api';
import { BrandContext } from '../brand';
import type { Attachment, PersonRef } from '../types';
import { formatBytes, initials } from '../utils';

// Экран загрузки: ручка построчно «пишет» на листе (анимация в theme.css).
export function Spinner() {
  return (
    <div className="spinner-wrap" role="status" aria-label="Загрузка">
      <svg className="pen-loader" width="120" height="96" viewBox="0 0 120 96" xmlns="http://www.w3.org/2000/svg">
        <rect className="paper" x="14" y="10" width="92" height="76" rx="7" />
        <line className="ink ink-1" x1="30" y1="30" x2="86" y2="30" />
        <line className="ink ink-2" x1="30" y1="46" x2="90" y2="46" />
        <line className="ink ink-3" x1="30" y1="62" x2="72" y2="62" />
        <path
          className="pen"
          d="M 0 0 L 10 -14 L 13.5 -11.5 L 3.5 2.5 L -0.5 3.5 Z"
          transform="translate(30, 30)"
        />
      </svg>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Avatar({ person }: { person: PersonRef }) {
  return <span className="avatar">{initials(person)}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// ---------- Модальное окно ----------

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal-wide' : 'modal'}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Выпадающее меню ----------

export function Menu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Действия">
        ⋮
      </button>
      {open && (
        <div className="menu">
          {items.map((item) => (
            <button
              key={item.label}
              className={item.danger ? 'menu-item danger' : 'menu-item'}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Тосты ----------

interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

const ToastContext = createContext<{ show: (text: string, error?: boolean) => void }>({
  show: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, error }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={t.error ? 'toast error' : 'toast'}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const { show } = useContext(ToastContext);
  return {
    success: (text: string) => show(text),
    error: (e: unknown) =>
      show(e instanceof ApiRequestError || e instanceof Error ? e.message : 'Произошла ошибка', true),
  };
}

// ---------- Вложения ----------

export function AttachmentList({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove?: (id: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      {attachments.map((a) => (
        <span key={a.id} className="attachment-chip">
          {a.kind === 'LINK' ? (
            <a href={a.url ?? '#'} target="_blank" rel="noopener noreferrer">
              {a.title || a.url}
            </a>
          ) : (
            <a href={`/api/files/${a.id}`}>
              {a.file_name} <span className="faint">{formatBytes(a.size)}</span>
            </a>
          )}
          {onRemove && (
            <button className="icon-btn" style={{ width: 22, height: 22, fontSize: 14 }} onClick={() => onRemove(a.id)} aria-label="Убрать">
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

// Локальное состояние вложений до отправки формы:
// файлы сразу загружаются на сервер (получаем fileId), ссылки добавляются объектом.
export interface PendingAttachment {
  key: string;
  kind: 'FILE' | 'LINK';
  fileId?: number;
  url?: string;
  title?: string;
  label: string;
}

export function usePendingAttachments() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const addFile = async (file: File) => {
    setUploading(true);
    try {
      const { file: uploaded } = await uploadFile(file);
      setItems((list) => [
        ...list,
        { key: `f${uploaded.id}`, kind: 'FILE', fileId: uploaded.id, label: uploaded.file_name },
      ]);
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
    }
  };

  const addLink = (url: string, title: string) => {
    setItems((list) => [
      ...list,
      { key: `l${Date.now()}`, kind: 'LINK', url, title: title || undefined, label: title || url },
    ]);
  };

  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key));
  const reset = () => setItems([]);

  const payload = items.map((i) =>
    i.kind === 'FILE' ? { kind: 'FILE', fileId: i.fileId } : { kind: 'LINK', url: i.url, title: i.title },
  );

  return { items, uploading, addFile, addLink, remove, reset, payload };
}

export function AttachmentPicker({
  pending,
}: {
  pending: ReturnType<typeof usePendingAttachments>;
}) {
  const brand = useContext(BrandContext);
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const uploadsEnabled = brand?.features.fileUploads !== false;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {uploadsEnabled && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={pending.uploading}>
            {pending.uploading ? 'Загрузка…' : 'Прикрепить файл'}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLinkOpen(true)}>
          Добавить ссылку
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pending.addFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {pending.items.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {pending.items.map((i) => (
            <span key={i.key} className="attachment-chip">
              {i.label}
              <button
                type="button"
                className="icon-btn"
                style={{ width: 22, height: 22, fontSize: 14 }}
                onClick={() => pending.remove(i.key)}
                aria-label="Убрать"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {linkOpen && (
        <Modal
          title="Добавить ссылку"
          onClose={() => setLinkOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setLinkOpen(false)}>
                Отмена
              </button>
              <button
                className="btn"
                disabled={!url.trim()}
                onClick={() => {
                  pending.addLink(url.trim(), title.trim());
                  setUrl('');
                  setTitle('');
                  setLinkOpen(false);
                }}
              >
                Добавить
              </button>
            </>
          }
        >
          <Field label="Адрес (http/https)">
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Название (необязательно)">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

// Удаление сохранённого вложения с подтверждением через тост-ошибку.
export async function removeSavedAttachment(id: number): Promise<boolean> {
  try {
    await del(`/api/files/${id}`);
    return true;
  } catch {
    return false;
  }
}
