// RFC 9457 problem details, as the PA#2 contract defines them (docs/contract/publish.md §2).

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  errors?: { parameter?: string; pointer?: string; detail: string }[];
  /** From the Retry-After header of a 429 (contract B.5), in seconds. */
  retryAfter?: number;
}

export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }

  get code(): string {
    return this.problem.code;
  }

  get status(): number {
    return this.problem.status;
  }
}

/** Builds a Problem from any failed response body, even one that is not problem details. */
export function toProblem(status: number, body: unknown, instance?: string): Problem {
  if (body && typeof body === 'object' && 'code' in body && 'type' in body) {
    const b = body as Partial<Problem>;
    return {
      type: String(b.type),
      title: String(b.title ?? 'Request failed'),
      status: typeof b.status === 'number' ? b.status : status,
      detail: b.detail,
      instance: b.instance ?? instance,
      code: String(b.code),
      errors: b.errors
    };
  }
  return {
    type: 'about:blank',
    title: 'Request failed',
    status,
    detail:
      status === 0 ? 'Không kết nối được máy chủ.' : `The server answered ${status}.`,
    instance,
    code: status === 0 ? 'NETWORK_ERROR' : 'UNEXPECTED_RESPONSE'
  };
}

/** What the person should read, in the interface's voice: what happened and what to do. */
export function describeProblem(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : 'Đã có lỗi xảy ra. Tải lại trang.';
  }
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'Sai tên đăng nhập hoặc mật khẩu.';
    case 'UNAUTHORIZED':
      return 'Phiên đăng nhập đã hết. Đăng nhập lại.';
    case 'FORBIDDEN':
      return 'Bạn không có quyền với mục này (khác lớp, hoặc không đúng vai trò).';
    case 'LAB_NOT_FOUND':
      return 'Lab này không tồn tại hoặc đã bị xoá.';
    case 'CLASS_NOT_FOUND':
      return 'Lớp này không tồn tại.';
    case 'SUBMISSION_NOT_FOUND':
      return 'Không tìm thấy bài nộp này.';
    case 'VERDICT_NOT_FOUND':
      return 'Verdict này không còn nữa. Tải lại hàng đợi review.';
    case 'LAB_PUBLISHED':
      return 'Lab đã công bố điểm: không nộp thêm và không sửa review được nữa.';
    case 'RATE_LIMITED': {
      const minutes = Math.max(1, Math.ceil((err.problem.retryAfter ?? 60) / 60));
      return `Bạn đã nộp 5 lần trong 10 phút. Thử lại sau khoảng ${minutes} phút.`;
    }
    case 'ROUTE_NOT_FOUND':
      return 'Máy chủ chưa có chức năng này. Kiểm tra backend đã cập nhật chưa.';
    case 'REVIEWS_PENDING':
      return 'Còn verdict chưa được review. Review hết rồi mới công bố điểm được.';
    case 'INVALID_REQUEST': {
      const first = err.problem.errors?.[0];
      return first
        ? first.detail
        : (err.problem.detail ?? 'Kiểm tra lại các ô đang báo lỗi.');
    }
    case 'NETWORK_ERROR':
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    default:
      return err.problem.detail ?? err.problem.title;
  }
}
