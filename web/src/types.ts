// Типы данных API (зеркало серверных ответов).

export interface User {
  id: number;
  email: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  global_role: 'USER' | 'ADMIN';
}

export type CourseRole = 'TEACHER' | 'STUDENT';

export interface Course {
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
  role: CourseRole | null;
  teachers: { last_name: string; first_name: string; middle_name: string | null }[];
  studentsCount: number;
}

export interface Topic {
  id: number;
  course_id: number;
  name: string;
  position: number;
}

export type CourseworkType = 'ASSIGNMENT' | 'QUIZ' | 'QUESTION' | 'MATERIAL';
export type PostState = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
export type SubmissionState = 'ASSIGNED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED';

export interface Attachment {
  id: number;
  kind: 'FILE' | 'LINK';
  title: string | null;
  url: string | null;
  file_name: string | null;
  mime: string | null;
  size: number | null;
}

export interface SubmissionSummary {
  id: number;
  state: SubmissionState;
  grade: number | null;
  draft_grade: number | null;
  turned_in_at: string | null;
  returned_at: string | null;
}

export interface Coursework {
  id: number;
  course_id: number;
  topic_id: number | null;
  type: CourseworkType;
  title: string;
  description: string | null;
  max_points: number | null;
  due_at: string | null;
  state: PostState;
  scheduled_at: string | null;
  allow_late: number;
  quiz_show_score: number;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
  counters?: { assigned: number; turnedIn: number; graded: number } | null;
  mySubmission?: SubmissionSummary | null;
  topic?: { id: number; name: string } | null;
  rubric?: Rubric | null;
  assigneeIds?: number[];
}

export interface Rubric {
  id: number;
  criteria: {
    id: number;
    title: string;
    description: string | null;
    levels: { id: number; title: string; points: number }[];
  }[];
}

export interface Submission extends SubmissionSummary {
  coursework_id: number;
  student_id: number;
  answer_text: string | null;
  late: boolean;
  attachments: Attachment[];
  rubricGrades: { criterion_id: number; level_id: number; points: number }[];
  student?: PersonRef;
  events?: { event: string; payload: string | null; actor_id: number; created_at: string }[];
  quizAnswers?: QuizAnswer[];
}

export interface PersonRef {
  id: number;
  email?: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
}

export interface Announcement {
  id: number;
  course_id: number;
  text: string;
  state: PostState;
  scheduled_at: string | null;
  pinned: number;
  created_at: string;
  author: PersonRef;
  commentsCount: number;
  attachments: Attachment[];
}

export interface Comment {
  id: number;
  scope: 'ANNOUNCEMENT' | 'COURSEWORK' | 'SUBMISSION';
  scope_id: number;
  text: string;
  created_at: string;
  author: PersonRef;
}

export interface Member extends PersonRef {
  role: CourseRole;
  joined_at: string;
}

export interface QuizQuestion {
  id: number;
  type: 'SINGLE' | 'MULTI' | 'TEXT';
  text: string;
  options: string[] | null;
  points: number;
  position: number;
  correct?: unknown;
}

export interface QuizAnswer {
  questionId: number;
  answer: unknown;
  awarded: number | null;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: number;
  created_at: string;
}

export interface TodoItem {
  courseworkId: number;
  courseId: number;
  courseName: string;
  courseColor: string;
  title: string;
  type: CourseworkType;
  dueAt: string | null;
  maxPoints?: number | null;
  submissionState?: SubmissionState;
  grade?: number | null;
  missing?: boolean;
  turnedIn?: number;
  graded?: number;
  assigned?: number;
}

export interface BrandConfig {
  product: {
    name: string;
    shortName: string;
    tagline: string;
    company: string;
    supportEmail: string;
    logoText: string;
  };
  theme: {
    colorPrimary: string;
    colorPrimaryHover: string;
    colorAccent: string;
    colorDanger: string;
    fontFamily: string;
    radius: string;
    courseColors: Record<string, string>;
  };
  features: Record<string, boolean>;
  limits: { maxUploadSizeMb: number; maxAttachmentsPerPost: number };
}
