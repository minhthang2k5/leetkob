# Kế hoạch thực hiện phần Người 1 PA3

Cập nhật ngày 23/11/2026 theo `main@314db5a` và commit contract `007b3b5`. Đã hoàn thành phase 1 (sandbox) và phase 2 (bộ test), dừng trước phase 3 (worker). Lượt đầy đủ đạt 72/72 test sandbox và 176/176 test trên mọi workspace; xem [báo cáo kiểm chứng](../../sandbox/VERIFICATION.md).

Người 1 phụ trách sandbox, worker, bộ test bài nộp và bảo mật, đóng gói, deploy Azure, tag và video. Luồng cần hoàn thành là: bài nộp `QUEUED` → worker nhận bài → sandbox compile/chạy test → bài `ACCEPTED` được checker kiểm tra ràng buộc → lưu kết quả để TA review và publish.

## 1. Nền móng sử dụng và phạm vi công việc

Sử dụng ngay npm workspaces, `@leetkob/shared`, schema/migration PA3, API nộp bài/review/publish, script seed tài khoản và các job CI hiện có. Không tạo lại package, kiểu tạm, schema hoặc API đã được Minh Thắng triển khai.

| Phần | Nền móng đã có | Công việc Người 1 thực hiện |
|---|---|---|
| Sandbox | Package, cấu hình, `DEFAULT_LIMITS`, chữ ký `judge()` | Docker image, runner thật, so sánh output, giới hạn và cleanup |
| Worker | Package, `WorkerDeps`, `defaultDeps` | Claim job Postgres, điều phối chấm, lưu kết quả, retry và khôi phục |
| Database | `Submission`, `TestCase`, `ConstraintVerdict`, `ModelCall` | Code đọc/ghi theo schema hiện tại |
| CI | Job sandbox/checker/frontend/eval và tag `pa3` | Bộ test thật và setup image để các lệnh hiện có chạy được |
| Deploy | Script seed 5 tài khoản | Dockerfile, Compose production, Azure, backup, tài liệu và demo |

Nguồn chuẩn: [contract publish](../contract/publish.md), [contract PA3](../contract/pa3-interfaces.md), [kiểu dùng chung](../../shared/src/index.ts), [schema Prisma](../../backend/prisma/schema.prisma) và [quy tắc repo](../../AGENTS.md).

Làm implementation trên nhánh `feat/sandbox-worker`. Thay đổi phần của chủ khác phải được người đó review; thay đổi contract/schema, dependency, CI, push/PR và deploy tuân thủ quy trình của repo. Không thêm Redis hoặc một hệ thống hàng đợi khác.

## 2. Hoàn thiện sandbox

### Interface và kết quả

Thay placeholder `judge()` hiện tại, giữ chữ ký và kiểu chính thức từ `@leetkob/shared`:

```ts
judge(
  code: string,
  tests: TestCase[],
  limits?: Partial<Limits>
): Promise<JudgeOutcome>
```

- Compile C++17 bằng `g++ -std=c++17 -O2` trong container; cố định phiên bản và ghi nhận digest image.
- Compile một lần; chạy mỗi test trong container mới để cô lập dữ liệu giữa các test.
- Truyền source, executable và input qua stream; không ghép code SV vào shell command. Expected output được giữ ở phía judge.
- Chạy test theo thứ tự đầu vào, dừng ở test đầu tiên thất bại.
- Trả đủ `result`, `testsPassed`, `testsTotal`, `compileOutput`, `durationMs`.
- `compileOutput` tối đa 4 KB, chỉ có khi `COMPILE_ERROR`. Giới hạn output khi chạy là 64 KB; kiểm tra hai giới hạn riêng.
- Lỗi bài SV trả `JudgeOutcome`; lỗi Docker/hạ tầng mới `throw` để worker retry.
- Hỗ trợ đủ `ACCEPTED`, `WRONG_ANSWER`, `TIME_LIMIT`, `MEMORY_LIMIT`, `RUNTIME_ERROR`, `COMPILE_ERROR`, `OUTPUT_LIMIT`.

### So sánh output theo contract mới

Chỉ bỏ khoảng trắng cuối mỗi dòng và dòng trống cuối output. Giữ nguyên khoảng trắng bên trong và cấu trúc dòng; không dùng cách tách token trong plan cũ.

| Expected | Actual | Kết quả |
|---|---|---|
| `"1 2\n"` | `"1 2   \n\n"` | Giống |
| `"1 2\n"` | `"1  2\n"` | Khác |
| `"1 2\n"` | `"1\n2\n"` | Khác |

### Cách ly và giới hạn

Giữ `DEFAULT_LIMITS` cho mỗi lần chạy chương trình SV: 2 giây CPU, 5 giây wall, 256 MB RAM, 64 process, 64 KB output. Theo làm rõ contract đã được người dùng duyệt, compile có budget riêng 10 giây CPU/20 giây wall; RAM, swap, pids, output và các cờ cách ly vẫn áp dụng. Compile và chạy đều được giám sát; không tự đổi giới hạn hoặc fixture để làm test qua.

- Chạy UID `1000`, `--network none`, memory bằng memory-swap, giới hạn pids.
- Dùng `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`.
- Cho phép tmpfs `/work` riêng có giới hạn như đã thống nhất. Không gắn thư mục host hoặc Docker socket; không dùng `--privileged`, `-e`, `--env-file` cho sandbox.
- Không chuyển danh tính, model key, env backend hoặc secret vào image/lệnh chạy sandbox.
- Kill toàn bộ container khi hết wall time; giới hạn thu stdout/stderr ngay khi đọc để không làm đầy RAM/log host.
- Phân loại lỗi theo exit status, tín hiệu và bằng chứng OOM/timeout thực tế; không mặc định exit `137` là hết RAM.
- Cleanup trong `finally`. Khi khởi động lại, chỉ dọn container mồ côi thuộc job/lượt xử lý đã hết hạn; không xóa container của worker khác.

## 3. Bộ test bài nộp và bảo mật

### Bài làm sinh viên thực tế

Tạo 6 lab riêng: thống kê mảng, sắp xếp, tìm kiếm nhị phân, đảo chuỗi đệ quy, mảng động và GCD. Mỗi lab có đề, giới hạn input, lời giải tham chiếu, bộ input/output và tối thiểu 6 bài nộp hoàn chỉnh: hai bài đúng, hai bài sai logic, một bài lỗi compile, một bài lỗi khi chạy. Tổng tối thiểu 36 bài; bổ sung các biến thể vượt tài nguyên phù hợp.

| Trường hợp | Ví dụ bài làm |
|---|---|
| Accepted | Hai cách giải khác nhau, đúng cả input nhỏ và biên |
| Wrong Answer | Binary search bỏ sót phần tử cuối |
| Sai trường hợp biên | Khởi tạo max bằng `0`, sai khi mảng toàn số âm |
| Compile Error | Bài hoàn chỉnh nhưng sai tên biến hoặc chữ ký hàm |
| Runtime Error | Truy cập vượt biên bằng thao tác có biểu hiện lỗi ổn định |
| Time Limit | Thuật toán bậc hai không đáp ứng input lớn hợp lệ |
| Memory Limit | Cách tăng mảng hoặc tổ chức bảng DP gây dùng RAM quá mức |
| Output Limit | Quên xóa phần in debug trong vòng lặp |

- Tính expected output độc lập với implementation đang kiểm tra; kiểm chứng ví dụ nhỏ bằng tay. Mỗi fixture ghi lỗi và input làm lộ lỗi.
- Sinh input lớn bằng seed cố định, nằm trong giới hạn đề và API. Không tăng kích thước input vượt contract để ép xuất hiện lỗi.
- Không dùng chương trình chỉ trả mã lỗi hoặc in chuỗi đặc biệt để giả lập verdict.
- Không mặc định undefined behavior chắc chắn gây segmentation fault.
- Có bài Accepted dùng tài nguyên tương đối lớn để phát hiện sandbox giới hạn sai.
- Không sửa fixture, label hoặc nới giới hạn chỉ để implementation qua test. Giữ nguyên dev set công bố; không lấy ID/code dev set làm test checker hoặc hard rule.

### Chín nhóm thử nghiệm bảo mật

Đây là bộ 9 nhóm tự đề xuất, không khẳng định là danh sách chính thức của rubric gốc.

| # | Nhóm | Bằng chứng kiểm tra |
|---|---|---|
| 1 | CPU chạy không dừng | Bài bị kết thúc bởi giới hạn |
| 2 | Chờ hoặc ngủ kéo dài | Wall timeout vẫn có hiệu lực |
| 3 | Bộ nhớ 1 GiB | Có thao tác ghi và đọc lại vùng nhớ thực sự sử dụng; bị giới hạn |
| 4 | Output liên tục | Output lưu lại bị giới hạn; host không tăng RAM vô hạn |
| 5 | Tạo nhiều process | Pids limit có hiệu lực và cleanup hết process con |
| 6 | Truy cập mạng | Không kết nối được endpoint thử nghiệm được kiểm soát |
| 7 | Ghi filesystem | Không ghi được ngoài vùng cho phép; ghi hợp lệ trong `/work` vẫn hoạt động |
| 8 | Đọc dữ liệu host hoặc secret | Không thấy canary ngoài sandbox, env backend hay Docker socket |
| 9 | Nâng quyền | Không đổi sang root hoặc thực hiện thao tác cần quyền |

Các probe kiểm tra hành vi bị chặn thực sự. Một probe có thể kết thúc bình thường sau khi thao tác bị từ chối; không ép mọi probe phải trả cùng một verdict. Không thử kết nối hoặc tấn công hệ thống bên ngoài phạm vi kiểm soát.

Sau mỗi timeout/OOM/output limit phải chấm thành công một bài hợp lệ để xác nhận cleanup và khả năng phục hồi.

### Test contract và môi trường

- Fail-fast: qua test 1, sai test 2 trong tổng 3 test → `testsPassed=1`, `testsTotal=3`, không chạy test 3.
- Kiểm tra đủ các trường hợp whitespace, output 64 KB, compile diagnostics 4 KB, source/input Unicode và giới hạn byte của API.
- Chạy Docker thật trong integration test; mock chỉ dùng cho unit test điều phối.
- Setup test chuẩn bị image trước khi chạy vì CI hiện gọi trực tiếp `npm test -w @leetkob/sandbox`.
- Thiếu Docker phải báo prerequisite thất bại rõ ràng, không skip rồi báo xanh.

## 4. Hoàn thiện worker trên database hiện tại

### Nhận và xử lý job

Tiếp tục dùng `WorkerDeps`/`defaultDeps`; checker giả được inject trong test khi Người 2 chưa hoàn thành implementation thật. Repository Postgres được triển khai ngay theo schema hiện có; không cần đợi schema hoặc xây một kho dữ liệu giả như giai đoạn sản phẩm riêng.

```text
Claim Submission QUEUED
    → RUNNING, tăng attempts
    → đọc test theo TestCase.position
    → judge()
    → nếu ACCEPTED: checkSubmission()
    → lưu kết quả, verdict và model log
    → JUDGED
```

- Claim bằng transaction ngắn với `FOR UPDATE SKIP LOCKED`, ưu tiên bài cũ. Job chỉ mang `submissionId`.
- Không giữ transaction trong lúc compile/chạy bài hoặc gọi model.
- Chỉ truyền statement, constraints và code gốc cho checker; checker tự xử lý comment. Không truyền danh tính hoặc deduction.
- Lưu kết quả sandbox và thời gian chấm vào các field hiện có của `Submission`.
- Upsert verdict bằng unique key `(submissionId, constraintId)`; không đặt lại thông tin TA đã review khi xử lý lại.
- Chọn mẫu PASS bằng hash ổn định theo seed, ngưỡng 10%; retry không đổi mẫu.
- Hoàn tất dữ liệu trong transaction có kiểm tra quyền sở hữu lượt xử lý. Dùng `attempts` làm dấu nhận diện để worker cũ không ghi đè worker mới.
- Lỗi hạ tầng được nhận lại tối đa 3 lần tổng cộng; hết lượt chuyển `FAILED`. Wrong Answer/Compile Error vẫn là `JUDGED`, không retry như lỗi hạ tầng.
- Shutdown ngừng claim bài mới, thu hồi sandbox và để job chưa hoàn tất được khôi phục.
- Không tuyên bố lời gọi model luôn đúng một lần qua mọi tình huống crash; mục tiêu là có thể xử lý lại mà không nhân đôi bộ verdict.

Khai báo Prisma client trực tiếp cho worker, cùng phiên bản repo, theo quy trình duyệt dependency/lockfile của nhóm; không dựa vào dependency tình cờ được hoist từ backend.

### Test worker bắt buộc

- Hai worker không cùng sở hữu một lượt xử lý.
- Tắt worker → nộp qua API thật → nhận `202/QUEUED` → bật lại → có một bộ verdict.
- Crash giữa chừng → thu hồi và xử lý lại, không nhân đôi verdict.
- Worker cũ hoàn thành muộn → không ghi đè worker mới.
- Docker hỏng → retry rồi `FAILED` đúng số lượt.
- Non-Accepted không gọi checker; Accepted lưu đủ verdict/evidence/call log.
- Mẫu PASS ổn định qua retry; thông tin TA review được giữ nguyên.
- Chỉ dùng `TEST_DATABASE_URL`, kiểm tra tên DB kết thúc `_test`. Không chạy song song các suite cùng reset một DB.

### Các điểm phối hợp trước tích hợp production

| Điểm | Điều cần thống nhất | Chủ phối hợp |
|---|---|---|
| Cap model theo lab | Contract yêu cầu checker biết chi phí đã dùng, nhưng `CheckOptions` chưa có cách truyền. Worker tổng hợp từ `ModelCall`; chốt interface trước khi nối model thật. | Minh Thắng và Người 2 |
| Job chạy quá 2 phút | Contract mới quy định thu hồi theo `lockedAt`, chưa quy định heartbeat. Lab có tối đa 50 test; làm rõ lease/heartbeat trước khi triển khai gia hạn. | Minh Thắng |
| Publish khi còn bài đang chấm | Code đếm verdict cần review; chưa quy định chặn bài `QUEUED/RUNNING`. Chốt chính sách và test tương ứng. | Minh Thắng |

Không tự sửa contract/backend để giải quyết các điểm trên. Chúng không chặn sandbox và phần nhận/lưu job cơ bản, nhưng phải được xử lý trước khi xác nhận E2E production hoàn chỉnh.

## 5. Deploy Azure và bàn giao

### Hạ tầng đã chọn

- Azure for Students; Ubuntu 24.04 LTS x86-64, Docker Engine và Compose.
- Mục tiêu `Standard_B2als_v2`, 2 vCPU/4 GiB RAM, Southeast Asia; xác minh quota/capacity và giá trước khi tạo. Không tự chọn VM đắt hơn nếu thiếu quota.
- Một worker xử lý một bài tại một thời điểm; chỉ tăng concurrency sau khi đo tài nguyên trên VM thật.
- Compose gồm reverse proxy phục vụ frontend static, backend, worker và PostgreSQL.
- Frontend và `/v1` cùng origin; dùng DNS label Azure và HTTPS để chưa cần mua domain.
- Chỉ mở HTTP/HTTPS; SSH giới hạn IP quản trị; PostgreSQL không public.
- Chỉ worker có Docker socket. Sandbox SV không nhận socket, thư mục host hoặc secret.
- Model key deploy chỉ cấp cho worker khi cần gọi checker thật; không đưa vào image, frontend hoặc log.

### Build và tài khoản theo repo mới

- Cài workspace bằng root lockfile; frontend cài/build với lockfile riêng.
- Build shared/sandbox/checker trước backend và worker. Dockerfile worker phải build worker riêng vì root `npm run build` chưa bao gồm worker.
- Chạy migration chính thức của Minh Thắng, không tự tạo schema.
- Dùng `npm run db:seed:accounts -w backend` với đủ `SEED_PASSWORD_*`; không dùng password hoặc tài khoản mock.
- Pin image phát hành theo commit; có healthcheck, restart policy và log rotation.

### Chi phí và dữ liệu

Azure for Students cấp $100 credit dùng trong tối đa 12 tháng, không phải $100 mỗi tháng hoặc VM miễn phí liên tục 12 tháng. Hết credit sớm có thể làm subscription bị vô hiệu hóa.

- Trước provisioning, ghi dự toán VM + disk + IP + backup, mức tiêu mỗi ngày và số ngày chạy theo credit còn lại.
- Giữ spending limit, không tự nâng sang Pay-As-You-Go. Cảnh báo tại 50%, 75%, 90% credit; cảnh báo ngân sách không phải giới hạn chi tiêu tự động.
- Backup DB hằng ngày, giữ 7 bản; có bản ngoài VM trước khi nộp và sau thay đổi dữ liệu quan trọng.
- Kiểm tra restore trên database riêng; có hướng dẫn dựng lại trên VM khác.
- Rollback về image trước; chỉ restore DB theo quy trình đã kiểm tra, không tự đảo migration.

Nguồn Azure: [điều kiện Students](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p), [cấu hình Basv2](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/basv2-series), [spending limit](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/spending-limit).

### Thứ tự thực hiện và nghiệm thu

- [x] Phase 1: sandbox chấm bài thật, đúng contract, giới hạn và cleanup trong runner.
- [x] Phase 2: 39 bài SV và 9 nhóm bảo mật chạy qua Docker thật; 72/72 test sandbox đạt.
- [ ] Worker nối Postgres thật với checker giả, có retry và khôi phục.
- [ ] Nối checker thật và giải quyết các điểm contract cần phối hợp.
- [ ] Azure chạy HTTPS và E2E: đăng nhập → tạo lab → nộp → chấm → checker → review → publish.
- [ ] Xác nhận SV không thấy verdict/deduction trước publish, TA lớp khác bị từ chối và restart không mất bài/nhân đôi verdict.
- [ ] Backup/restore và quy trình rollback được kiểm chứng.
- [x] Chạy bốn quality gates từ root: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`; 176/176 test đạt ngày 23/11/2026.
- [ ] Chạy kiểm tra frontend riêng tại giai đoạn tích hợp và deploy.
- [ ] CI trên tag `pa3` đạt; bàn giao hướng dẫn deploy, báo cáo test và video không quá 5 phút.

Không gọi model thật trong unit/contract test. Chỉ đánh dấu hoàn thành sau khi đã chạy và ghi nhận kết quả; không thay đổi fixture để làm test xanh.
