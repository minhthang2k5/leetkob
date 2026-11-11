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
  REVIEWS_PENDING: {
    slug: 'reviews-pending',
    status: 409,
    code: 'REVIEWS_PENDING',
    title: 'Required reviews are pending'
  },
  INTERNAL: {
    slug: 'internal',
    status: 500,
    code: 'INTERNAL_ERROR',
    title: 'Internal server error'
  }
} as const;
