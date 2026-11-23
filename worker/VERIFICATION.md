# Kiểm chứng bước 4 — worker Postgres

Ngày chạy: **23/11/2026**, múi giờ Asia/Bangkok, nhánh `feat/sandbox-worker`. Nền backend `main@314db5a`, sandbox `51fa920`. Contract lease và cost context đã được người dùng duyệt và commit riêng tại `01d2f4e` trước implementation.

## Kết quả thực tế

| Lệnh từ root | Kết quả |
|---|---|
| `npm run lint` | Đạt trên mọi workspace |
| `npm run format:check` | Đạt trên mọi workspace |
| `npm run typecheck` | Đạt, gồm build thư viện |
| `npm test` | Exit 0; 207 test đạt, 21 test file đạt, không skip |

| Workspace | Test đạt |
|---|---:|
| shared | 3 |
| sandbox | 72 |
| checker | 12 |
| worker | 32 |
| backend | 88 |
| **Tổng** | **207** |

Lượt đầy đủ bắt đầu lúc 22:35:42. Sandbox chạy 351,55 giây; worker bắt đầu 22:41:40, chạy 47,40 giây; backend bắt đầu 22:42:28, chạy 38,40 giây. Chỉ dùng `leetkob_test`, không dùng database dev. Kiểm tra `docker ps --all --filter label=leetkob.sandbox=true` sau suite trả danh sách rỗng.

Đã chạy format bằng `npm run format --workspaces --if-present` và format thêm fixture CJS. Root hiện không có script `format`, nên lệnh workspace là cách gọi các formatter sẵn có, không thêm script hoặc dependency. Lỗi lint ban đầu do `throw` trực tiếp trong `finally` được sửa bằng helper cleanup; lượt lint sau sửa đạt.

## 32 test worker chứng minh điều gì

**23 test queue/persistence trên PostgreSQL thật:** nhiều kết nối tranh cùng job; tám claimant trên hai lab chỉ tạo hai RUNNING job; thứ tự test lấy từ position; heartbeat trong lúc judge chưa xong; lease hết hạn không được hồi sinh; lượt bỏ dở thứ ba thành FAILED; retry lỗi hạ tầng đúng ba lần và không lưu exception thô; sáu kết quả không Accepted đều JUDGED mà không gọi checker; loại worker cũ hoàn thành muộn; transaction rollback khi ghi dở; giữ review TA có sẵn và review vừa commit trong lúc worker chờ row lock; chi phí đã commit được truyền cho checker kế tiếp; replay request id không nhân đôi log; từ chối checker trả thiếu verdict; drain khi shutdown và bỏ reply checker đến muộn; cấu hình model-on thiếu adapter bị từ chối.

**5 test tích hợp process/Docker/API thật:**

1. Không có worker → API HTTP thật trả 202/QUEUED, attempts vẫn 0 → khởi động tiến trình Node worker → GCC/Docker chấm bài sắp xếp hoàn chỉnh → một bộ verdict → dừng sạch.
2. SIGKILL tiến trình sau khi judge thật hoàn tất, khi checker đang giữ → DB vẫn RUNNING ở attempt 1 → đặt thời điểm lease vào quá khứ để kích hoạt chính SQL thu hồi, không chờ hai phút → worker mới chấm lại ở attempt 2, chỉ một bộ verdict.
3. Bài nộp được judge thật Accepted → fake checker trả VIOLATION có dòng evidence lấy từ source → SV không thấy verdict/deduction → TA có pending review → publish trả 409 → TA review → publish 200.
4. Hai sandbox thật có label của attempt mồ côi và attempt còn lease → startup reconcile chỉ dọn attempt mồ côi, giữ attempt sống → hủy và cleanup cả hai.
5. Shutdown khi sandbox thật đang hoạt động → hết grace test → container bị hủy, job về QUEUED với mã WORKER_STOPPED, không còn container của job.

**3 test sampling** kiểm tra tính ổn định theo seed/id/constraint, không phụ thuộc thứ tự, phân bố gần 10% trên tập lớn. **1 test wiring** xác nhận defaultDeps dùng export thật từ sandbox/checker.

Queue tests điều khiển các điểm chờ để tái hiện tranh chấp; chúng không giả vờ chấm C++. Bộ process dùng bài hoàn chỉnh từ fixture sorting của sandbox. Constraint checking được inject fake rõ ràng vì checker của Người 2 chưa triển khai. Không gọi model thật hoặc dùng key; các request id `fake` chỉ thuộc fixture và không phải bằng chứng provider.

## Phạm vi và phần còn lại

- Đã triển khai worker, retry/lease/fencing, persistence, sampling, shutdown và dọn container theo attempt; không thay schema/backend/CI hoặc fixture C++ đã có.
- Prisma client được khai báo trực tiếp cho worker theo phê duyệt, cùng range như backend; lockfile giữ nguyên bản 5.22.0, không nâng dependency.
- Checker thật vẫn là placeholder: chạy CLI hiện tại với bài Accepted sẽ retry/FAILED cho đến khi Người 2 triển khai `checkSubmission()`. CLI không tự chèn fake; model-on còn cần nối adapter của Người 2.
- Minh Thắng còn cần chốt chính sách publish khi có QUEUED/RUNNING. Luồng review/publish được kiểm chứng ở trên bắt đầu sau khi chấm hoàn tất; không chứng minh chính sách chặn publish trong lúc chấm.
- Crash sau model call nhưng trước commit có thể tạo chi phí chưa được ghi và lời gọi lặp lại khi phục hồi. Không tuyên bố provider exactly-once hoặc cap billing tuyệt đối qua crash.
- `node scripts/check-eval-data.mjs` trả warning vì `eval/leetkob-eval` chưa được copy vào repo; chưa kiểm chứng SHA-256 của dev set. Không sửa hoặc tạo dữ liệu eval.
- Chưa chạy CI từ xa, frontend, model evaluation, deploy Azure, backup/restore, tag hoặc video trong bước này.
