// RFC 9457 problem details, as the PA#2 contract defines them (docs/contract/publish.md §2).

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  errors?: { parameter?: string; pointer?: string; detail: string }[];
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
    case 'UNAUTHORIZED':
      if (err.problem.instance?.endsWith('/auth/login')) {
        return 'Sai tên đăng nhập hoặc mật khẩu.';
      }
      return 'Phiên đăng nhập đã hết. Đăng nhập lại.';
    case 'FORBIDDEN':
      return 'Mục này thuộc một lớp bạn không tham gia.';
    case 'LAB_NOT_FOUND':
      return 'Lab này không tồn tại hoặc đã bị xoá.';
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
