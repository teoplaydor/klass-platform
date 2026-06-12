// Вкладка «Участники»: преподаватели и ученики, приглашение по email.
import { useEffect, useState } from 'react';
import { del, get, post } from '../../api';
import { useUser } from '../../auth';
import { Avatar, Empty, Field, Menu, Modal, Spinner, useToast } from '../../components/ui';
import type { Course, Member } from '../../types';
import { fullName, plural } from '../../utils';

function InviteModal({
  course,
  role,
  onClose,
  onInvited,
}: {
  course: Course;
  role: 'TEACHER' | 'STUDENT';
  onClose: () => void;
  onInvited: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await post(`/api/courses/${course.id}/invite`, { email, role });
      toast.success('Участник добавлен и получил уведомление');
      onInvited();
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={role === 'TEACHER' ? 'Пригласить преподавателя' : 'Пригласить ученика'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || !email.includes('@')}>
            Пригласить
          </button>
        </>
      }
    >
      <p className="muted small mb-16">
        Пользователь должен быть зарегистрирован на платформе. Ученики также могут присоединиться
        самостоятельно по коду курса: <strong>{course.enrollment_code}</strong>
      </p>
      <Field label="Электронная почта">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

export function PeopleTab({ course }: { course: Course }) {
  const user = useUser();
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invite, setInvite] = useState<'TEACHER' | 'STUDENT' | null>(null);

  const isTeacher = course.role === 'TEACHER';

  const load = () =>
    get<{ members: Member[] }>(`/api/courses/${course.id}/members`)
      .then((r) => setMembers(r.members))
      .catch(toast.error);

  useEffect(() => {
    void load();
  }, [course.id]);

  if (!members) return <Spinner />;

  const remove = async (m: Member) => {
    try {
      await del(`/api/courses/${course.id}/members/${m.id}`);
      toast.success('Участник удалён из курса');
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const teachers = members.filter((m) => m.role === 'TEACHER');
  const students = members.filter((m) => m.role === 'STUDENT');

  const Section = ({ title, list, role }: { title: string; list: Member[]; role: 'TEACHER' | 'STUDENT' }) => (
    <div className="mb-16">
      <div className="row-between" style={{ padding: '0 4px 8px' }}>
        <h2 style={{ color: 'var(--color-primary)' }}>
          {title}{' '}
          <span className="small muted" style={{ fontWeight: 400 }}>
            {list.length} {plural(list.length, 'человек', 'человека', 'человек')}
          </span>
        </h2>
        {isTeacher && course.state === 'ACTIVE' && (
          <button className="btn btn-secondary btn-sm" onClick={() => setInvite(role)}>
            Пригласить
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <Empty>Пока никого нет.</Empty>
      ) : (
        <div className="card">
          {list.map((m) => (
            <div key={m.id} className="list-row">
              <Avatar person={m} />
              <div style={{ flex: 1 }}>
                <div>{fullName(m)}</div>
                {isTeacher && <div className="small faint">{m.email}</div>}
              </div>
              {isTeacher && m.id !== user.id && m.id !== course.owner_id && (
                <Menu items={[{ label: 'Удалить из курса', onClick: () => void remove(m), danger: true }]} />
              )}
              {m.id === course.owner_id && <span className="badge badge-primary">Владелец</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <Section title="Преподаватели" list={teachers} role="TEACHER" />
      <Section title="Ученики" list={students} role="STUDENT" />
      {invite && (
        <InviteModal
          course={course}
          role={invite}
          onClose={() => setInvite(null)}
          onInvited={() => {
            setInvite(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
