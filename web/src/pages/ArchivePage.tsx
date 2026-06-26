// Архив курсов: просмотр, восстановление, окончательное удаление (владелец).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { del, get, post } from '../api';
import { courseColor, useBrand } from '../brand';
import { useUser } from '../auth';
import { Empty, Menu, Spinner, useToast } from '../components/ui';
import type { Course } from '../types';

export function ArchivePage() {
  const brand = useBrand();
  const user = useUser();
  const toast = useToast();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Course | null>(null);

  const load = () =>
    get<{ courses: Course[] }>('/api/courses?state=ARCHIVED')
      .then((r) => setCourses(r.courses))
      .catch(toast.error);

  useEffect(() => {
    void load();
  }, []);

  if (!courses) return <Spinner />;

  const restore = async (id: number) => {
    try {
      await post(`/api/courses/${id}/restore`);
      toast.success('Курс восстановлен');
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (id: number) => {
    try {
      await del(`/api/courses/${id}`);
      toast.success('Курс удалён безвозвратно');
      setConfirmDelete(null);
      void load();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="content-narrow">
      <h1 className="mb-16">Архив</h1>
      {courses.length === 0 ? (
        <Empty>Архивированных курсов нет.</Empty>
      ) : (
        <div className="course-grid">
          {courses.map((c) => (
            <div key={c.id} className="card course-card">
              <div className="course-card-head" style={{ background: courseColor(brand, c.theme_color), opacity: 0.7 }}>
                <div className="row-between">
                  <div>
                    <div className="course-card-title">
                      <Link to={`/courses/${c.id}`}>{c.name}</Link>
                    </div>
                    <div className="course-card-section">{c.section}</div>
                  </div>
                  {c.role === 'TEACHER' && (
                    <Menu
                      items={[
                        { label: 'Восстановить', onClick: () => void restore(c.id) },
                        ...(c.owner_id === user.id
                          ? [{ label: 'Удалить навсегда', onClick: () => setConfirmDelete(c), danger: true }]
                          : []),
                      ]}
                    />
                  )}
                </div>
              </div>
              <div className="course-card-body">
                <span className="badge badge-warn">В архиве — только просмотр</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-head">
              <h2>Удалить курс?</h2>
            </div>
            <div className="modal-body">
              <p>
                Курс «{confirmDelete.name}» и все его задания, работы и оценки будут удалены безвозвратно.
                Это действие нельзя отменить.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button className="btn btn-danger" onClick={() => void remove(confirmDelete.id)}>
                Удалить навсегда
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
