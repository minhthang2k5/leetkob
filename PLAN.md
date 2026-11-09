# Kế hoạch thực hiện và phân công PA2 LeeTKOB

Ngày lập: 08/11/2026. Hạn nộp theo tài liệu: 22:00 ngày 11/11/2026.

Tài liệu tổng hợp các quyết định nhóm trưởng đã chốt và phân công cho nhóm 3 người. Đây là kế hoạch thực hiện, không phải xác nhận các công việc đã hoàn thành. Các mục bổ sung để triển khai được ghi rõ là đề xuất hoặc cần xác nhận.

## 1. Mục tiêu và phạm vi PA2

Hoàn thành backend tối thiểu có một endpoint LeeTKOB, contract rõ ràng, contract tests và CI thực sự chặn merge khi kiểm tra thất bại. Kèm quy tắc dùng AI, quyền thao tác, quản lý secret và bằng chứng nộp bài.

PA2 chưa yêu cầu frontend, API đăng nhập hoàn chỉnh, tích hợp LLM thật, queue hay sandbox chấm C++. Các phần đó thuộc lộ trình sản phẩm các mốc sau. Trong PA2, dùng dữ liệu mẫu để biểu diễn lab và trạng thái review.

| Tiêu chí rubric | Điểm tối đa |
| --- | ---: |
| Rules file | 15 |
| Permissions và secrets | 10 |
| Một lệnh cho mỗi check | 10 |
| CI chặn merge | 20 |
| Contract của một endpoint LeeTKOB | 25 |
| Contract tests thực sự bắt lỗi | 15 |
| AI-LOG.md | 5 |
| **Tổng** | **100** |

## 2. Các quyết định đã chốt

| Nội dung | Quyết định |
| --- | --- |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| Truy cập database | Prisma; quản lý schema và migration |
| Môi trường database | Docker Compose; database phát triển và database test riêng |
| Endpoint trọng tâm | `POST /labs/{labId}/publish` |
| ID lab | UUID |
| Xác thực PA2 | Token tạo sẵn cho tài khoản mẫu; chưa làm API đăng nhập |
| Truyền token | Header `Authorization: Bearer <token>` |
| Kiểm tra quyền | Backend xác minh token; lấy vai trò và phạm vi lớp từ database |
| Request body | Không cần body |
| Kiểm thử | Vitest + Supertest; test dữ liệu dùng PostgreSQL riêng |
| Git và CI | GitHub + GitHub Actions |
| Quy trình | Branch riêng → PR → checks xanh → ít nhất một người khác approve → merge |
| Branch chính | Bảo vệ `main`; không push trực tiếp hoặc bỏ qua checks |
| CI cho bản nộp | Chạy khi push tag `pa2`, ngoài checks trên PR |

### 2.1. Phân quyền Publish

| Người gọi | Quyền theo lựa chọn của nhóm |
| --- | --- |
| TA thuộc lớp chứa lab | Được Publish nếu các review bắt buộc hoàn tất |
| TA của lớp khác | Không được Publish |
| Admin | Nhóm đề xuất được Publish mọi lab; vẫn phải qua điều kiện review |
| Sinh viên | Không được Publish |
| Chưa đăng nhập | Không được Publish |

**Quyền admin chưa được xác nhận từ yêu cầu sản phẩm.** Brief nói rõ TA duyệt và Publish nhưng chưa mô tả admin Publish. Nhóm trưởng cần kiểm tra FAQ hoặc hỏi product owners công khai theo hướng dẫn trong brief. Ghi nguồn xác nhận vào repository trước khi coi đây là hành vi chính thức.

### 2.2. Điều kiện Publish

- TA/admin chỉ gọi Publish thành công khi mọi review bắt buộc của lab đã hoàn tất.
- Review bắt buộc gồm tất cả `violation`, `unsure` và mẫu ngẫu nhiên 10% kết quả `pass` cần TA duyệt theo brief.
- Còn review bắt buộc chưa hoàn tất: trả `409 REVIEWS_PENDING`.
- Không dùng phương án công bố từng bài hoặc công bố một phần trong contract PA2 đã chốt.
- Không tự thêm điều kiện “mọi bài đang chấm phải xong” vào contract: nhóm đã không chốt điều kiện đó; quan hệ giữa bài đang xử lý và trạng thái sẵn sàng Publish cần được làm rõ nếu triển khai ngoài dữ liệu mẫu PA2.

### 2.3. Gọi lại an toàn

- Lần Publish đầu tiên ghi nhận trạng thái và thời gian công bố do backend tạo.
- Gọi lại sau khi đã Publish vẫn trả `200 OK` với dữ liệu đã lưu.
- Không thay đổi `publishedAt`, không tạo lần công bố hoặc tác dụng phụ trùng.
- Cần bảo đảm cả hai request đồng thời cũng không tạo tác dụng phụ hai lần.

### 2.4. Request và response thành công

```http
POST /labs/550e8400-e29b-41d4-a716-446655440000/publish
Authorization: Bearer <token>
```

Không cần request body. Client không gửi vai trò, ID người Publish hoặc thời gian Publish.

Response `200 OK`, dạng JSON:

```json
{
  "labId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PUBLISHED",
  "publishedAt": "2026-11-08T06:00:00.000Z"
}
```

`publishedAt` là thời gian UTC định dạng ISO 8601. Gọi lại trả nguyên thời gian công bố lần đầu.

### 2.5. Các lỗi đã chốt

| Tình huống | HTTP status | Code |
| --- | ---: | --- |
| Thiếu token, token sai hoặc hết hạn | 401 | `UNAUTHORIZED` |
| Sinh viên gọi Publish | 403 | `FORBIDDEN` |
| TA không phụ trách lớp chứa lab | 403 | `FORBIDDEN` |
| Lab không tồn tại | 404 | `LAB_NOT_FOUND` |
| Còn review bắt buộc chưa hoàn tất | 409 | `REVIEWS_PENDING` |
| `labId` sai định dạng UUID | 400 | `INVALID_REQUEST` |

Lỗi theo problem details RFC 9457. Contract phải liệt kê từng `type`, status, trường và quy tắc; kiểm thử cả body, không chỉ status. `code` là trường mở rộng.

```json
{
  "type": "urn:leetkob:problem:reviews-pending",
  "title": "Required reviews are incomplete",
  "status": 409,
  "detail": "The lab still has required reviews pending.",
  "instance": "/labs/550e8400-e29b-41d4-a716-446655440000/publish",
  "code": "REVIEWS_PENDING"
}
```

Đề xuất triển khai: lỗi dùng `Content-Type: application/problem+json`. Các URI `type` còn lại, thứ tự ưu tiên lỗi khi một request sai nhiều điều kiện và cách xử lý body ngoài dự kiến cần được ghi vào contract trước khi viết test tương ứng.

## 3. Quyền thao tác của AI đã thống nhất

| Mức quyền | Phạm vi |
| --- | --- |
| Được tự làm | Đọc và sửa code trong task; viết test theo contract; cập nhật tài liệu; chạy kiểm tra |
| Phải hỏi trước | Thêm dependency; thay đổi contract/schema database; push code; merge PR; triển khai; thay đổi bảo vệ branch |
| Không được làm | Đưa secret vào Git/sandbox; gọi model thật trong unit test; sửa test/dữ liệu eval/nhãn chỉ để check xanh; bỏ qua checks để merge |

Việc sửa test để phản ánh một thay đổi contract đã được nhóm thống nhất là hợp lệ. Không sửa test để che lỗi implementation.

Rules file cần ngắn, có bốn mục: stack, commands, conventions, never. Để đạt mức rubric cao nhất, ít nhất hai quy tắc cần liên hệ được với sự cố thật qua commit hoặc AI-LOG. Không bịa sự cố hay ghi công việc chưa làm thành đã làm.

## 4. Phân công theo hình thức tuần tự và bàn giao

Phương án này thay thế cách chia song song trước đây. Mỗi người làm trọn một gói chính, hoàn thành và bàn giao rồi người tiếp theo bắt đầu. Giữ nguyên các quyết định kỹ thuật ở mục 2 và quyền AI ở mục 3.

Chưa có tên/MSSV thành viên; dùng N1, N2, N3 để nhóm điền sau.

| Thứ tự | Người | Gói công việc chính | Đầu vào | Đầu ra |
| --- | --- | --- | --- | --- |
| 0 | N1 — nhóm trưởng | Chuẩn bị repository, bộ khung CI tối thiểu và bảo vệ main | Kế hoạch, stack đã chốt | Repo dùng chung và quy trình bàn giao qua PR |
| 1 | N3 — thành viên 3 | Contract và đặc tả các tình huống kiểm thử | Quyết định ở mục 2, brief/rubric, mẫu IA3 và FAQ | Contract hoàn chỉnh, checklist test, biên bản bàn giao |
| 2 | N2 — thành viên 2 | Toàn bộ backend, database và test chạy được | Gói contract đã bàn giao | API, Docker/Prisma, token mẫu, unit tests và contract tests xanh, hướng dẫn chạy |
| 3 | N1 — nhóm trưởng | Công cụ, CI đầy đủ, kiểm tra độc lập và chuẩn bị nộp | Gói code/test của N2 | Required checks, bằng chứng đỏ → xanh, rules, README, PA2.md và bản nộp |
| 4 | N3 — thành viên 3 | Hoàn thiện báo cáo tự chấm | Link và kết quả kiểm tra N1 đã cung cấp | SELF_ASSESSMENT_REPORT.md; N1 dùng tổng điểm để đóng ZIP |

**Thay đổi trách nhiệm quan trọng:** N2 nhận cả unit tests và contract tests bằng Vitest + Supertest. N3 viết đặc tả/checklist test nhưng không phụ trách triển khai bộ test. N1 xác minh test độc lập và chứng minh chúng thực sự bắt lỗi trên CI.

Bước 0 là ngoại lệ chuẩn bị ngắn để các gói sau đi qua PR được bảo vệ. CI ban đầu chỉ kiểm tra những gì bộ khung đã có; phải bổ sung đủ bốn checks khi code/test được bàn giao, không dùng check giả hoặc luôn thành công. Không tuyên bố gate hoàn chỉnh trước thời điểm đó.

## 5. Nhiệm vụ chi tiết và điều kiện bàn giao

### 5.1. N3 làm gói 1 contract

| Mã | Nhiệm vụ | Điều kiện hoàn thành |
| --- | --- | --- |
| N3-01 | Đọc brief/rubric và lấy mẫu CONTRACT.md IA3 | Xác định đúng các mục cần có; ghi rõ nếu chưa nhận được mẫu |
| N3-02 | Đối chiếu quyết định sản phẩm và FAQ | Dùng quyết định mục 2; đánh dấu quyền admin chưa xác nhận; N1 xử lý câu hỏi sản phẩm trước khi chốt hành vi chính thức |
| N3-03 | Viết docs/contract/publish.md | Đủ role/ownership, request, response, field rules, mọi problem type/status, idempotency và cách thay đổi contract |
| N3-04 | Chốt tình huống biên | Ghi thứ tự ưu tiên lỗi, gọi lặp/đồng thời, quyền với lab đã Publish và xử lý request ngoài dự kiến |
| N3-05 | Viết checklist test | Mỗi quy tắc/lỗi có dữ liệu đầu vào và kết quả mong đợi; dùng mục 6 làm nền |
| N3-06 | Bàn giao gói 1 | PR tài liệu được review; có commit tham chiếu, checklist và các vấn đề còn mở |

Gói bàn giao N3 → N2:

- Contract tại docs/contract/publish.md và checklist test, đề xuất đặt tại docs/contract/publish-test-cases.md.
- Ví dụ request/response và dữ liệu cần có cho TA đúng lớp, TA khác lớp, admin, sinh viên, lab pending và lab đã Publish.
- Danh sách quyết định đã chốt, câu hỏi còn mở, nguồn FAQ nếu có.
- AI-LOG phần N3 và link PR/commit bàn giao.

N2 chỉ bắt đầu triển khai phần phụ thuộc khi contract đủ rõ. Nếu quyền admin hoặc mẫu IA3 chưa được xác nhận, bàn giao phải nêu rõ phần còn thiếu; không tự nhận đã hoàn thành. Nếu phát hiện mâu thuẫn, ghi câu hỏi và chờ chốt đúng phần bị ảnh hưởng thay vì tự đổi nghiệp vụ.

### 5.2. N2 làm gói 2 backend và toàn bộ test

| Mã | Nhiệm vụ | Điều kiện hoàn thành |
| --- | --- | --- |
| N2-01 | Dựng Express + TypeScript | App tách khỏi listen; chạy local và import được bằng Supertest |
| N2-02 | Schema Prisma và migration | Có user/role, class, phân công TA, lab, review bắt buộc, trạng thái/thời gian Publish |
| N2-03 | PostgreSQL, Docker Compose và seed | Database dev/test riêng; có lệnh dựng lại dữ liệu mẫu; ghi phiên bản |
| N2-04 | Token mẫu và xác thực | Xác minh token; role/phạm vi lớp lấy từ DB; không tin quyền do client tự gửi; không commit signing secret hoặc token truy cập thật |
| N2-05 | Triển khai Publish và lỗi | Tuân thủ contract đã bàn giao; không tự thêm điều kiện nghiệp vụ |
| N2-06 | Bảo đảm idempotency | Dùng transaction/cơ chế phù hợp; gọi lặp và đồng thời không đổi publishedAt hoặc trùng tác dụng phụ |
| N2-07 | Dựng Vitest + Supertest | npm test chạy không tương tác, chuẩn bị/dọn dữ liệu test riêng, trả exit code đúng |
| N2-08 | Viết unit tests và contract tests | Bao phủ mục 6, body/schema, từng loại lỗi, ownership, gọi lặp/đồng thời; không chỉ kiểm tra status |
| N2-09 | Chuẩn bị hướng dẫn và môi trường | README đủ cài/chạy/migrate/seed/test; .env.example liệt kê biến không có giá trị bí mật; lockfile được lưu |
| N2-10 | Bàn giao gói 2 | API chạy được, npm test xanh, type check cơ bản chạy được, có kết quả và PR/commit bàn giao |

Gói bàn giao N2 → N1:

- Toàn bộ src/, prisma/, compose.yaml, tests/, scripts cần thiết, package.json và lockfile.
- Phiên bản runtime/database; danh sách biến; lệnh cài, khởi động DB, migrate, seed, tạo token, chạy app và tests.
- Kết quả chạy tests, ánh xạ test tới từng mục contract, các hạn chế còn tồn tại.
- Gợi ý một thay đổi implementation có thể dùng để chứng minh contract break; chưa tạo CI break nếu chưa có CI đầy đủ.
- AI-LOG phần N2 và link PR/commit bàn giao.

Không làm toàn bộ hệ thống đăng nhập hoặc chấm C++ ở PA2. N2 tự xử lý trọn gói backend/test; chỉ quay lại N3/N1 khi có quyết định sản phẩm hoặc contract cần thay đổi.

### 5.3. N1 làm bước chuẩn bị và gói 3 công cụ CI nộp bài

| Mã | Nhiệm vụ | Điều kiện hoàn thành |
| --- | --- | --- |
| N1-00 | Bootstrap trước gói 1/2 | Repo public, quyền cộng tác, bộ khung CI có kiểm tra thật tối thiểu và bảo vệ main sớm; ghi thời điểm cấu hình |
| N1-01 | Tiếp nhận gói N2 | Clone mới; làm theo hướng dẫn và tái hiện API/test; lập danh sách lỗi bàn giao nếu có |
| N1-02 | Hoàn thiện lint, format và typecheck | Mỗi check một lệnh; scripts có exit code đúng; không làm đổi nghiệp vụ để sửa lỗi công cụ |
| N1-03 | CI đầy đủ cho PR/tag pa2 | Cài từ lockfile, PostgreSQL test/migration, chạy đủ bốn lệnh local giống CI |
| N1-04 | Hoàn thiện bảo vệ main | Đúng tên required checks, ít nhất một approval từ người khác; không bypass; lưu bằng chứng |
| N1-05 | Rules, permissions và secrets | AGENTS.md bốn mục; ba mức quyền; kiểm tra .env/.env.example và toàn bộ lịch sử Git; quy tắc dựa sự cố thật |
| N1-06 | Xác minh contract tests độc lập | Đọc đối chiếu contract với test và code; thử contract break trên PR để xác minh test không bỏ sót quy tắc đã cam kết |
| N1-07 | Tạo bằng chứng gate | PR đỏ thực sự bị chặn; commit sửa implementation làm xanh; không sửa test/contract để che lỗi |
| N1-08 | README và PA2.md | Hướng dẫn clone mới đầy đủ; links repo/settings, blocked PR, commit/PR xanh, contract break và CI tag |
| N1-09 | Bàn giao bằng chứng cho N3 | Có bảng links, kết quả kiểm tra và phần chưa đạt để N3 tự chấm |
| N1-10 | Kiểm tra và nộp cuối | Sau báo cáo tự chấm: kiểm tra clone mới, chọn commit nộp, tag pa2, CI tag xanh, ZIP có .git và tên đúng tổng điểm |

N1 có thể tự tạo commit cố ý phá implementation và commit sửa trên cùng PR sau khi tiếp nhận code/test. Một thành viên khác chỉ cần review/approve theo quy trình; không cần cả nhóm cùng triển khai lỗi. Không merge commit lỗi. Phần cập nhật link CI tag trong PA2.md cần được chuẩn bị trước để bản nộp chứa đủ bằng chứng và tag cuối trỏ đúng commit nộp.

Đề xuất ESLint cho lint và Prettier cho format; đây là chi tiết chưa chốt riêng. Việc thêm dependency tuân thủ quyền AI mục 3.

### 5.4. N3 quay lại làm gói 4 báo cáo tự chấm

- Nhận links và kết quả kiểm tra từ N1 sau gói 3.
- Viết SELF_ASSESSMENT_REPORT.md có đủ 7 tiêu chí, điểm từng mục và bằng chứng trực tiếp.
- Nêu ngắn phần chưa hoàn thành; không chấm theo mục tiêu hoặc công việc chưa có bằng chứng.
- Gửi tổng điểm và file cho N1 để kiểm tra, đưa vào commit nộp và đặt tên ZIP.

### 5.5. Quy tắc bàn giao để giảm phối hợp liên tục

1. Người đang giữ gói chính làm độc lập, ghi câu hỏi còn mở trong tài liệu bàn giao.
2. Bàn giao bằng PR/commit có hướng dẫn chạy, kết quả kiểm tra, phạm vi hoàn thành, vấn đề còn thiếu và AI-LOG.
3. Người nhận đọc tài liệu và kiểm tra một lượt trước khi nhận gói; phản hồi tập trung nếu thiếu.
4. Lỗi thuộc gói cũ trả về người phụ trách sửa, rồi bàn giao lại; không cần cùng sửa thường xuyên.
5. Thay đổi contract cần nhóm trưởng chốt và N3 cập nhật tài liệu trước khi N2 đổi logic/test tương ứng.
6. Không tự approve PR của mình. Đề xuất N1 review gói contract/backend, N2 hoặc N3 review PR của N1.
7. Quyền sửa package.json và lockfile chuyển từ N2 sang N1 ở lần bàn giao code/test; không sửa chồng nhau.
8. Mỗi người ghi AI-LOG và bằng chứng của mình. N1 tổng hợp, không viết thay lịch sử sử dụng AI chưa được xác nhận.

Hình thức này giảm phối hợp hằng ngày, không loại bỏ review và nghiệm thu bàn giao. Phần code/test dồn vào N2 nên khối lượng không hoàn toàn bằng nhau; N3 nhận thêm báo cáo tự chấm và kiểm tra độ đầy đủ tài liệu để cân đối.

## 6. Checklist contract tests

N3 đặc tả các tình huống trong gói 1; N2 triển khai toàn bộ tests trong gói 2; N1 chạy lại và xác minh bằng contract break trong gói 3.

| Mã | Trường hợp | Kết quả cần kiểm tra |
| --- | --- | --- |
| CT-01 | TA đúng lớp, review hoàn tất | 200; đủ trường; PUBLISHED; publishedAt hợp lệ và được lưu |
| CT-02 | Admin, review hoàn tất | 200 theo đề xuất nhóm; hoàn thiện test chính thức sau xác nhận quyền admin |
| CT-03 | Thiếu token | 401; đúng problem type/code và body |
| CT-04 | Token không hợp lệ hoặc hết hạn | 401; không thay đổi DB |
| CT-05 | Sinh viên gọi API | 403; không thay đổi DB |
| CT-06 | TA thuộc lớp khác | 403; không công bố lab ngoài quyền |
| CT-07 | UUID hợp lệ nhưng lab không tồn tại | 404 LAB_NOT_FOUND |
| CT-08 | Còn violation/unsure chưa duyệt | 409 REVIEWS_PENDING; chưa Publish |
| CT-09 | Còn pass được chọn vào mẫu review chưa duyệt | 409 REVIEWS_PENDING |
| CT-10 | labId sai UUID | 400 INVALID_REQUEST với người gọi hợp lệ |
| CT-11 | Gọi lại sau Publish | 200; body nhất quán; publishedAt không đổi; không thêm tác dụng phụ |
| CT-12 | Hai request Publish đồng thời | Kết quả nhất quán; chỉ một thời điểm/lần chuyển trạng thái thực sự |
| CT-13 | Người không có quyền gọi lab đã Publish | Vẫn kiểm tra quyền; không trả thành công chỉ vì lab đã Publish |

CT-12, CT-13 là kiểm tra bổ sung đề xuất để chứng minh cam kết phân quyền và idempotency. Khi request vi phạm nhiều điều kiện, kết quả theo thứ tự xử lý đã ghi trong contract.

## 7. Các lệnh kiểm tra và pipeline

Các lệnh đã thống nhất:

```text
npm run lint
npm run format:check
npm run typecheck
npm test
```

N2 bàn giao script test và type check cơ bản; N1 hoàn thiện lint, format, typecheck và thống nhất toàn bộ scripts khi nhận gói 2. `npm test` phải kết thúc với exit code phản ánh kết quả, không chạy watch mode trong CI. CI không nuốt lỗi bằng cấu hình luôn thành công. Các bước cài đặt, migrate và seed phải được tài liệu hóa riêng; README chỉ rõ DB test cần khởi động trước khi chạy test local.

Pipeline dự kiến:

1. Checkout mã nguồn; thiết lập cùng phiên bản Node.js với local.
2. Cài dependencies theo lockfile.
3. Chuẩn bị PostgreSQL dành riêng cho CI và chạy migration/fixtures cần thiết.
4. Chạy nguyên bốn lệnh kiểm tra ở trên.
5. Các checks đó là required checks của main.

Docker Compose phục vụ database local; CI có thể dùng PostgreSQL service container cùng phiên bản. Chưa chốt phiên bản Node.js, PostgreSQL, Prisma và cách ký token; chọn tương thích khi triển khai, ghi rõ và giữ nhất quán.

## 8. Lịch tuần tự và các mốc bàn giao

Lịch đề xuất theo hạn 11/11, không phải xác nhận tiến độ. Chỉ chuyển sang gói sau khi đầu ra cần thiết của gói trước đã được nghiệm thu.

| Thời gian đề xuất | Người chính | Công việc | Mốc bàn giao |
| --- | --- | --- | --- |
| 08/11 đầu đợt | N1 | Bước 0: repo, CI tối thiểu có ý nghĩa, bảo vệ main và quyền cộng tác | Repo sẵn sàng nhận PR |
| 08/11 | N3 | Contract hoàn chỉnh, checklist, đối chiếu IA3/FAQ | Gói 1 cho N2; N1 review |
| 09/11 | N2 | Backend, database, token mẫu, toàn bộ unit/contract tests và hướng dẫn | Gói 2 cho N1; npm test xanh |
| 10/11 | N1 | Checks đầy đủ, CI, rules/permissions, kiểm tra độc lập, PR đỏ → xanh và contract break | Gói bằng chứng cho N3 |
| 11/11 đầu ngày | N3 | Báo cáo tự chấm dựa trên bằng chứng | Tổng điểm và báo cáo cho N1 |
| 11/11 trước hạn | N1 | Kiểm tra cuối, commit/tag, CI tag, ZIP và nộp | Nộp trước 22:00; đề xuất dự phòng ít nhất 2 giờ |

Người chưa tới lượt không phải viết phần phụ thuộc. Họ chỉ cần tham gia review ngắn khi có PR hoặc xử lý câu hỏi còn mở. Nếu gói trước trễ hoặc chưa đạt điều kiện, cập nhật lịch bàn giao thay vì giả định gói sau có thể hoàn tất như cũ.

## 9. Bằng chứng CI cần thu thập

| Bằng chứng | Cách tạo | Nơi ghi |
| --- | --- | --- |
| Main được bảo vệ | Bật required checks và approval; lưu ảnh/link settings | PA2.md |
| PR đỏ bị chặn merge | PR có lỗi thật hoặc lỗi cố ý được mô tả; CI required thất bại | PA2.md, PR/CI |
| Commit sửa làm xanh | Sửa implementation/config đúng nguyên nhân; giữ lịch sử CI đỏ | PA2.md |
| Contract break bị bắt | Ví dụ bỏ kiểm tra pending review trên branch; contract/test giữ nguyên; CI đỏ; sau đó khôi phục logic | PA2.md, AI-LOG nếu có AI hỗ trợ |
| CI cho bản nộp | Push tag pa2 vào commit đã chọn; workflow chạy và thành công | PA2.md |

Không merge commit đang phá contract. Có thể dùng cùng một PR để chứng minh gate và contract tests nếu các links thể hiện đầy đủ hai yêu cầu. Không bịa links, screenshot hoặc lịch sử lỗi.

## 10. File dự kiến và người chịu trách nhiệm

| File hoặc nhóm file | Chủ trì |
| --- | --- |
| AGENTS.md và tài liệu permissions | N1 |
| README.md, PA2.md, .gitignore | N1; N2 bổ sung hướng dẫn backend/DB |
| .env.example | N2 liệt kê biến; N1 rà soát |
| package.json, lockfile, cấu hình TypeScript/test | N2 khởi tạo; bàn giao N1 hoàn thiện checks; không sửa đồng thời |
| .github/workflows/ci.yml | N1 |
| compose.yaml | N2 |
| prisma/schema.prisma, migrations và seed | N2 |
| src/ cho app, auth, quyền, Publish và lỗi | N2 |
| docs/contract/publish.md và checklist tình huống test | N3 |
| tests/ cho contract, Vitest/Supertest và fixtures | N2 viết trọn gói; N1 xác minh độc lập |
| tests/ cho logic nghiệp vụ | N2 |
| AI-LOG.md | Cả ba |
| SELF_ASSESSMENT_REPORT.md | N3 tổng hợp; cả nhóm duyệt |
| PA2_TEAM_PLAN.md | Kế hoạch này; nhóm trưởng theo dõi |

Tên file cấu hình/cấu trúc thư mục là đề xuất tổ chức, ngoại trừ các đường dẫn được đề/rubric yêu cầu cụ thể.

## 11. Các điểm còn cần xử lý

- [ ] N1/N3 lấy mẫu CONTRACT.md của IA3 để đối chiếu đúng các mục.
- [ ] N1 xác nhận quyền Publish mọi lab của admin qua FAQ/product owners; ghi nguồn và ngày xác nhận. Nếu không được chấp thuận, cập nhật contract/code/test về quyền theo brief.
- [ ] Cả nhóm điền tên, MSSV và URL repository.
- [ ] N1/N2 chọn phiên bản runtime/database/dependencies và tài liệu hóa.
- [ ] N3 chốt các problem type, thứ tự lỗi và trường hợp biên trước bàn giao; N2 chọn cơ chế token phù hợp rồi ghi rõ trong hướng dẫn và contract nếu cần.
- [ ] N1/N2 ghi kế hoạch model, chi phí lab và spending cap theo yêu cầu tài liệu. PA2 không gọi model thật trong tests; không ghi đã có cap khi chưa cấu hình hoặc chưa có bằng chứng. Nếu chưa chọn provider, nêu trạng thái và phần còn thiếu trung thực.
- [ ] N1 rà toàn bộ lịch sử Git về secret. Nếu đã lộ secret: rotate, xử lý và ghi AI-LOG theo rubric; xóa file hiện tại không đủ.

## 12. Checklist hoàn thành và nộp bài

- [ ] Contract đủ rõ để người ngoài viết client, đúng bố cục IA3.
- [ ] Endpoint chạy đúng các quyết định, không có frontend bắt buộc ở PA2.
- [ ] Database dev/test tách biệt; không xóa dữ liệu dev khi chạy test.
- [ ] Auth, ownership, review pending, lỗi, gọi lặp/đồng thời được kiểm thử.
- [ ] Lint, format, typecheck, tests cùng xanh local và CI.
- [ ] Main được bảo vệ; có một approval từ người khác; không push trực tiếp sau khi bật bảo vệ.
- [ ] Có bằng chứng required CI thực sự chặn merge và commit sửa xanh.
- [ ] Có bằng chứng deliberate contract break bị CI bắt.
- [ ] Rules file có bốn phần và hai quy tắc truy được tới vấn đề thật nếu yêu cầu mức điểm cao nhất.
- [ ] Quyền AI được ghi rõ; .env.example đầy đủ và không có secret trong lịch sử Git.
- [ ] AI-LOG có tool/task và Changed/Rejected thực tế.
- [ ] PA2.md đủ link repo, settings/ảnh, PR đỏ, commit/PR xanh, contract break và CI tag.
- [ ] SELF_ASSESSMENT_REPORT.md đủ 7 dòng tiêu chí, bằng chứng từng dòng, tổng điểm và phần chưa làm được; không tự chấm theo mục tiêu chưa hoàn thành.
- [ ] Thử clone mới, làm theo README và chạy checks thành công.
- [ ] Repository public; tag pa2 trỏ đúng commit nộp và đã được push.
- [ ] CI cho tag pa2 xanh và phản ánh đúng bản nộp.
- [ ] ZIP chứa repository bao gồm .git và các tài liệu bắt buộc; loại dữ liệu/secret local, dependency cài sẵn và output thừa.
- [ ] MSSV tăng dần, điểm trong tên ZIP khớp tổng tự chấm.
- [ ] Một thành viên nộp bằng tài khoản StudentID@student.hcmus.edu.vn trước hạn.

Mẫu tên ZIP:

```text
<StudentID1>-<StudentID2>-<StudentID3>_<total>.zip
```

Điểm tự chấm phải dựa trên bằng chứng. Thiếu SELF_ASSESSMENT_REPORT.md bị trừ 10 điểm theo rubric; chênh lệch tự chấm quá mức còn có điều chỉnh trung thực.

## 13. Nguồn yêu cầu

- LeeTKOB - class project brief.docx trong thư mục PA2: sản phẩm, nguyên tắc review/Publish và các mốc.
- PA#2 rubric - Harness and quality gate.docx trong thư mục PA2: tiêu chí, bằng chứng và cách nộp.
- requirement.txt trong thư mục PA2: mô tả checkpoint; đoạn cuối bị ngắt nên đối chiếu rubric để lấy đầy đủ yêu cầu nộp.
- Các lựa chọn nhóm trưởng đã xác nhận trong cuộc trao đổi ngày 08/11/2026; cập nhật phân công sang làm tuần tự và bàn giao theo yêu cầu mới.

Nếu lựa chọn của nhóm chưa được yêu cầu sản phẩm xác nhận, giữ nhãn đề xuất và đối chiếu FAQ. Nếu FAQ mâu thuẫn brief, brief được ưu tiên cho tới khi giảng viên thay đổi.
