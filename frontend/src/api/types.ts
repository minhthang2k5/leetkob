// Shapes the UI expects from the backend. Kept in step with frontend/API.md;
// once N2 freezes docs/contract/*.md, the contract wins and this file follows it.

export type Role = 'ADMIN' | 'TA' | 'STUDENT';

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
}

export interface ClassSummary {
  id: string;
  code: string;
  name: string;
}

export interface Me {
  user: User;
  classes: ClassSummary[];
}

export type LabStatus = 'DRAFT' | 'PUBLISHED';

export interface LabSummary {
  id: string;
  classId: string;
  title: string;
  status: LabStatus;
  publishedAt: string | null;
  createdAt: string;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export type ConstraintKind = 'BAN_LIST' | 'SEMANTIC';

export interface Constraint {
  id: string;
  code: string;
  text: string;
  deduction: number;
  kind: ConstraintKind;
}

export interface Lab extends LabSummary {
  statement: string;
  tests: TestCase[];
  constraints: Constraint[];
}

export interface NewLab {
  title: string;
  statement: string;
  tests: TestCase[];
  constraints: { code: string; text: string; deduction: number }[];
}

export type SubmissionStatus = 'QUEUED' | 'RUNNING' | 'JUDGED' | 'FAILED';

export type JudgeResult =
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT'
  | 'MEMORY_LIMIT'
  | 'RUNTIME_ERROR'
  | 'COMPILE_ERROR'
  | 'OUTPUT_LIMIT';

export interface Submission {
  id: string;
  labId: string;
  studentName?: string;
  createdAt: string;
  judgedAt: string | null;
  status: SubmissionStatus;
  result: JudgeResult | null;
  testsPassed: number | null;
  testsTotal: number | null;
  compileOutput: string | null;
}

export type VerdictValue = 'PASS' | 'VIOLATION' | 'UNSURE';
export type VerdictSource = 'HARD_RULE' | 'MODEL' | 'GUARDRAIL';
export type ReviewDecision = 'CONFIRMED' | 'OVERRIDDEN_PASS' | 'OVERRIDDEN_VIOLATION';

export interface EvidenceLine {
  line: number;
  text: string;
}

export interface Verdict {
  id: string;
  constraintId: string;
  constraintCode: string;
  constraintText: string;
  deduction: number;
  verdict: VerdictValue;
  source: VerdictSource;
  evidence: EvidenceLine[];
  reason: string | null;
  requiresReview: boolean;
  isSampled: boolean;
  isReviewed: boolean;
  decision: ReviewDecision | null;
  reviewNote: string | null;
}

export interface ReviewItem {
  submission: Submission;
  code: string;
  verdicts: Verdict[];
}

export interface ReviewQueue {
  labId: string;
  labStatus: LabStatus;
  pendingCount: number;
  items: ReviewItem[];
}

export interface PublishReceipt {
  labId: string;
  status: 'PUBLISHED';
  publishedAt: string;
}

/** Every call the UI makes. The real client and the mock both implement it. */
export interface Api {
  login(username: string, password: string): Promise<{ token: string; user: User }>;
  me(): Promise<Me>;
  listLabs(classId: string): Promise<LabSummary[]>;
  createLab(classId: string, lab: NewLab): Promise<Lab>;
  getLab(labId: string): Promise<Lab>;
  submit(labId: string, code: string): Promise<Submission>;
  listSubmissions(labId: string): Promise<Submission[]>;
  getSubmission(submissionId: string): Promise<Submission>;
  getReviewQueue(labId: string): Promise<ReviewQueue>;
  review(verdictId: string, decision: ReviewDecision, note?: string): Promise<Verdict>;
  publish(labId: string): Promise<PublishReceipt>;
}
