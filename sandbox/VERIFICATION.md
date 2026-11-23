# Kiểm chứng sandbox phase 1 và phase 2

Ngày chạy: **23/11/2026**, múi giờ Asia/Bangkok. Nhánh: `feat/sandbox-worker`, nền `main@314db5a` và contract compiler budget `007b3b5`.

## Kết quả quality gates

Các lệnh dưới đây đã chạy từ root và trả exit code 0:

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | Đạt trên mọi workspace |
| `npm run format:check` | Đạt trên mọi workspace |
| `npm run typecheck` | Đạt trên mọi workspace, gồm build thư viện |
| `npm test` | 176 test đạt, 18 test file đạt; không có test bị skip trong lượt đầy đủ |

| Workspace | Test đạt |
|---|---:|
| shared | 3 |
| sandbox | 72 |
| checker | 12 |
| worker | 1 |
| backend | 88 |
| **Tổng** | **176** |

Worker chỉ có test wiring đã tồn tại; số test này không có nghĩa worker đã được triển khai. Checker cũng chỉ được kiểm tra theo phần đang có trong repo, không gọi model thật.

## Bằng chứng của bộ sandbox

Lượt đầy đủ bắt đầu lúc 22:00:06, chạy 288,03 giây: **4 test file, 72 test đạt**. Bộ backend tiếp theo chỉ chạy trên `leetkob_test` và cũng đạt 88/88.

- Sáu lab với 36 bài C++ hoàn chỉnh: mỗi lab có hai bài đúng, hai bài sai logic, một lỗi compile và một lỗi runtime.
- Ba bài sai về tài nguyên: quên reset cờ bubble sort, để lại debug output trong vòng lặp, nhầm mảng một chiều thành cấp phát n*n.
- Chín probe bảo mật: CPU, wall, RAM 1 GiB, output, process, network, filesystem, dữ liệu host và nâng quyền.
- Test chặn mạng kiểm tra không có interface ngoài loopback, đồng thời không kết nối được listener host có kiểm chứng hoạt động.
- Test RAM 1 GiB ghi và đọc lại từng trang qua volatile pointer; test 64 MiB hợp lệ vẫn Accepted.
- Xác nhận so sánh whitespace theo dòng, fail-fast, 64 KiB input/output/source, Unicode, byte UTF-8 không hợp lệ và cap compile diagnostics 4 KiB.
- Bài nộp tự exit bằng mã dành cho supervisor không giả được kết quả MEMORY_LIMIT.
- Hai test liên tiếp không nhìn thấy scratch file của nhau. Sau các bài vượt tài nguyên, một bài hợp lệ vẫn được chấm thành công.
- Inventory container có label sandbox ở cuối suite bằng inventory ban đầu; không có container test mới bị bỏ lại.

## Giới hạn được dùng thực sự

Mỗi chương trình SV chạy với **CPU 2s, wall 5s, RAM 256 MiB, pids 64, tổng stdout/stderr 65.536 byte**. Không tăng riêng CPU/wall cho hai test RAM; source và expected verdict của các test này được giữ nguyên sau khi reset máy.

Compile dùng budget riêng **CPU 10s/wall 20s**, cùng hạn RAM, swap, pids và các cờ cách ly. Thay đổi này đã được người dùng duyệt, ghi vào contract và commit riêng trước implementation. Lượt thử trước đó áp 2s cả cho GCC đã làm một số bài hợp lệ bị TIME_LIMIT; fixture không bị đổi để che lỗi này.

Môi trường kiểm chứng: Windows, Node v24.20.0, Docker Desktop Linux Engine 29.9.2, Linux cgroup v2, GCC 13 Bookworm được pin digest trong Dockerfile. Repo vẫn giữ cấu hình Node 20 và dependency hiện tại.

## Phạm vi bàn giao

Đã hoàn thành sandbox và bộ test của phase 1–2. Chưa triển khai vòng lặp worker, checker thật, deploy Azure, video, tag hoặc CI từ xa. Việc thu hồi container sau khi tiến trình Node bị kill cứng cần cơ chế liên kết job/lượt xử lý ở phase worker; runner hiện cleanup container của chính nó trong `finally`.
