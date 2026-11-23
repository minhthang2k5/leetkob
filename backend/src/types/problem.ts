export interface ProblemErrorDetail {
  parameter?: string;
  pointer?: string;
  detail: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors?: ProblemErrorDetail[];
}

export const PROBLEM_TYPES = {
  INVALID_REQUEST: {
    slug: 'invalid-request',
    status: 400,
    code: 'INVALID_REQUEST',
    title: 'Invalid request'
  },
  UNAUTHORIZED: {
    slug: 'unauthorized',
    status: 401,
    code: 'UNAUTHORIZED',
    title: 'Unauthorized'
  },
  INVALID_CREDENTIALS: {
    slug: 'invalid-credentials',
    status: 401,
    code: 'INVALID_CREDENTIALS',
    title: 'Invalid credentials'
  },
  FORBIDDEN: {
    slug: 'forbidden',
    status: 403,
    code: 'FORBIDDEN',
    title: 'Forbidden'
  },
  NOT_FOUND: {
    slug: 'not-found',
    status: 404,
    code: 'LAB_NOT_FOUND',
    title: 'Lab not found'
  },
  ROUTE_NOT_FOUND: {
    slug: 'route-not-found',
    status: 404,
    code: 'ROUTE_NOT_FOUND',
    title: 'Route not found'
  },
  REVIEWS_PENDING: {
    slug: 'reviews-pending',
    status: 409,
    code: 'REVIEWS_PENDING',
    title: 'Required reviews are pending'
  },
  CLASS_NOT_FOUND: {
    slug: 'class-not-found',
    status: 404,
    code: 'CLASS_NOT_FOUND',
    title: 'Class not found'
  },
  SUBMISSION_NOT_FOUND: {
    slug: 'submission-not-found',
    status: 404,
    code: 'SUBMISSION_NOT_FOUND',
    title: 'Submission not found'
  },
  VERDICT_NOT_FOUND: {
    slug: 'verdict-not-found',
    status: 404,
    code: 'VERDICT_NOT_FOUND',
    title: 'Verdict not found'
  },
  LAB_PUBLISHED: {
    slug: 'lab-published',
    status: 409,
    code: 'LAB_PUBLISHED',
    title: 'Lab already published'
  },
  RATE_LIMITED: {
    slug: 'rate-limited',
    status: 429,
    code: 'RATE_LIMITED',
    title: 'Too many submissions'
  },
  INTERNAL: {
    slug: 'internal',
    status: 500,
    code: 'INTERNAL_ERROR',
    title: 'Internal server error'
  }
} as const;
