# Bàn giao Gói 2: Backend & Bộ Kiểm thử Hợp đồng (HANDOVER.md)
**Người bàn giao**: N2 (Backend & Testing Engineer)  
**Người nhận**: N1 (Nhóm trưởng / DevOps & CI Engineer)  
**Thời điểm bàn giao**: 09/11/2026  
**Mục tiêu**: Bàn giao toàn bộ mã nguồn backend, Prisma ORM, dữ liệu seed và 14 Contract Tests xanh 100%, kèm công thức cố ý gây lỗi hợp đồng để N1 thiết lập CI Quality Gate.

---

## 1. Danh mục Thành phần Bàn giao
Toàn bộ mã nguồn và cấu hình nằm trong thư mục `backend/`:
- `compose.yaml`: Chạy PostgreSQL 16 cho môi trường local dev/test.
- `prisma/schema.prisma`: Schema quan hệ gồm `User`, `Class`, `ClassTA`, `Lab`, `SubmissionReview`.
- `prisma/seed.ts`: Bộ fixtures dữ liệu mẫu chuẩn cho 14 test cases.
- `src/`: Express + TypeScript, middleware RFC 9457 Problem Details (`application/problem+json`), xác thực Bearer token, kiểm tra quyền sở hữu và logic publish nguyên tử.
- `tests/contract/publish.contract.spec.ts`: Bộ 14 tests bằng Vitest + Supertest.

---

## 2. Bảng Đối chiếu 14 Contract Tests (Mục 6 Rubric PA#2)

| Mã test | Kịch bản kiểm thử | Trạng thái |
|:---:|---|:---:|
| **CT-01** | TA của lớp phụ trách publish lab đã hoàn tất review $\rightarrow$ `200 OK`, cập nhật `PUBLISHED`, lưu `publishedAt` | ✅ Đã kiểm thử |
| **CT-02** | Admin publish lab đã hoàn tất review $\rightarrow$ `200 OK`, cập nhật `PUBLISHED` | ✅ Đã kiểm thử |
| **CT-03** | Thiếu header `Authorization` $\rightarrow$ `401 Unauthorized` RFC 9457 Problem Details | ✅ Đã kiểm thử |
| **CT-04** | Bearer token không hợp lệ hoặc hết hạn $\rightarrow$ `401 Unauthorized` RFC 9457 | ✅ Đã kiểm thử |
| **CT-05** | Sinh viên gọi publish $\rightarrow$ `403 Forbidden` ngay lập tức (trước khi query tìm lab) | ✅ Đã kiểm thử |
| **CT-06** | TA của Lớp B gọi publish lab của Lớp A $\rightarrow$ `403 Forbidden` (vi phạm quyền sở hữu) | ✅ Đã kiểm thử |
| **CT-07** | UUID hợp lệ nhưng lab không tồn tại trong DB $\rightarrow$ `404 Lab Not Found` RFC 9457 | ✅ Đã kiểm thử |
| **CT-08** | Lab còn review `VIOLATION` hoặc `UNSURE` chưa duyệt $\rightarrow$ `409 Conflict` (Reviews Pending) | ✅ Đã kiểm thử |
| **CT-09** | Lab còn review `PASS` được chọn mẫu 10% chưa duyệt $\rightarrow$ `409 Conflict` (Reviews Pending) | ✅ Đã kiểm thử |
| **CT-10** | `labId` không phải định dạng UUID v4 $\rightarrow$ `400 Bad Request` RFC 9457 | ✅ Đã kiểm thử |
| **CT-11** | Gọi lại sau khi đã publish $\rightarrow$ `200 OK`, có header `Idempotent-Replayed: true`, giữ nguyên `publishedAt` gốc | ✅ Đã kiểm thử |
| **CT-12** | Concurrency: Hai request publish đồng thời (`Promise.all`) $\rightarrow$ Cả hai `200 OK`, trạng thái nhất quán, 1 timestamp | ✅ Đã kiểm thử |
| **CT-13** | Sinh viên gọi lab đã publish $\rightarrow$ Vẫn bị từ chối `403 Forbidden` (Security check đi trước Idempotency) | ✅ Đã kiểm thử |
| **CT-14** | Client gửi kèm body lạ/không mong muốn $\rightarrow$ Bỏ qua body thừa an toàn, trả về `200 OK` | ✅ Đã kiểm thử |

---

## 3. Các Lệnh Chuẩn Hóa cho CI (Dành cho N1)
Để cấu hình workflow GitHub Actions, N1 dùng các lệnh sau trong thư mục `backend/`:
```bash
npm run typecheck       # Kiểm tra lỗi type TypeScript (tsc --noEmit)
npm test                # Chạy 14 contract tests không tương tác (vitest run)
npm run build           # Biên dịch ra thư mục dist
```

---

## 4. 🧪 Công thức Tạo Lỗi Hợp đồng Cố ý (Deliberate Break Recipe)
*(Dành cho N1 thực hiện kịch bản PR đỏ $\rightarrow$ xanh theo yêu cầu tiêu chí "Contract tests thực sự bắt lỗi" và "CI chặn merge" trong Rubric)*

### 💥 Cách gây lỗi (Break the implementation):
Trong file `backend/src/services/lab.service.ts`, tại dòng kiểm tra pending reviews (Bước 7):
```typescript
// SỬA TẠM ĐỂ GÂY LỖI: Comment đoạn chặn pending reviews
/*
if (pendingCount > 0) {
  throw new PublishError('REVIEWS_PENDING', ...);
}
*/
```
- **Hậu quả khi chạy test**: Test case `CT-08` và `CT-09` sẽ **thất bại (ĐỎ)** ngay lập tức vì API trả về `200 OK` thay vì `409 Conflict`.
- **Hành động của N1**: Push commit lỗi này lên một branch PR $\rightarrow$ CI chạy và báo **FALED (ĐỎ)** $\rightarrow$ Bằng chứng PR đỏ bị chặn merge.
- **Hành động phục hồi (Fix xanh)**: Bỏ comment đoạn code trên $\rightarrow$ Commit fix $\rightarrow$ CI chuyển sang **PASSED (XANH)** $\rightarrow$ Hoàn tất bằng chứng cho `PA2.md`.

