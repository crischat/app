# Warehouse Office

Văn phòng ảo của Warehouse Data Management Supervisor. Bạn dùng nó để giao task cho Leader và Clerk, nhận bài nộp, nhờ Claude chấm điểm và xem KPI theo tháng/năm. Việc cấp trên giao thì đi theo luồng: Gemini làm nháp, Claude chốt, bạn gửi lên.

- Link chạy: https://crischat.github.io/app/office/
- App **không dùng API AI** và không tốn thêm phí. Gemini dùng gói Gemini Pro qua một Gem. Claude dùng gói Claude qua kết nối Google Drive.
- Mọi dữ liệu nằm trên **Google Drive `/DIY/Warehouse/`**. Laptop không giữ gì: đổi máy chỉ cần mở link và kết nối Drive.

## Bảo mật

- **Bắt buộc đăng nhập Google.** Ai mở link cũng chỉ thấy màn hình đăng nhập, không thấy dữ liệu.
- **Chỉ email chủ app được vào.** Danh sách nằm ở `S.OWNERS` trong `js/store.js`, lưu dạng SHA-256 để repo công khai không lộ email. Tài khoản khác đăng nhập sẽ bị thu hồi quyền ngay.
- **Lớp khoá thật nằm ở Google**, không nằm ở trang web: dữ liệu ở Drive của bạn, chỉ đọc được bằng token đăng nhập của chính bạn. OAuth Client đang ở chế độ *Testing*, nên chỉ email có trong *Test users* mới đăng nhập được. Hãy giữ danh sách Test users chỉ có email của bạn.
- Không dùng Firebase. Với kiểu dữ liệu nằm trên Drive như thế này, Firebase không chặn thêm được gì: mã nguồn trang vẫn công khai trên GitHub, còn dữ liệu thì Google đã khoá sẵn.

## Cấu trúc trên Drive

```
/DIY/Warehouse/
  data/          office.json (dữ liệu app) + office-backup-YYYY-MM-DD.json mỗi ngày
  Cấp trên/      C-xxx <tiêu đề>/  yeu-cau, file liên quan, gemini-ban-nhap-…, claude-chot-…
                 Viec-cap-tren (nhap tay)  ← Google Sheet để điền việc cấp trên
  Nhân viên/     <tên>/T-xxx <tên task>/  yeu-cau, giao-…, nop-lanN-…, cham-diem-….json
  Reports/       KPI xuất ra Google Sheet
  Hệ thống/      HUONG-DAN-GEM, HUONG-DAN-CLAUDE
```

Chỉ app được ghi `office.json`. Claude chỉ **tạo file mới**: `cham-diem-<mã task>.json` (điểm) và `claude-chot-<mã việc>` (kết quả chốt). Mỗi lần đồng bộ, app tìm các file này theo tên và thư mục cha rồi cập nhật điểm và trạng thái. App tự đồng bộ khi bạn quay lại tab, và cứ 3 phút một lần.

## Luồng làm việc

**Giao task cho nhân viên**
1. Bấm vào bàn nhân viên, chọn "+ Giao task". Ghi rõ đầu ra và tiêu chí đạt, vì Claude chấm dựa trên phần này.
2. Khi nhân viên gửi bài (qua email/Teams), kéo file vào ô của task. File Excel/Word được lưu thêm một bản Google để AI đọc chắc chắn.
3. Bấm "Nhờ Claude chấm", copy câu lệnh, dán vào Claude (bật kết nối Google Drive). Claude tạo file điểm, app tự cập nhật.
4. Muốn chấm lại thì bấm "Kiểm tra lại". Bạn luôn sửa được điểm cuối bằng nút "Sửa điểm".

**Việc cấp trên giao**: "+ Thêm việc", hoặc điền vào Sheet nhập tay rồi bấm "Nhập từ Sheet".
1. "Gửi Gemini": Gem làm theo 3 bước (làm, tự soát lỗi, sửa) rồi xuất ra Docs/Sheets tên `gemini-ban-nhap-C-xxx`. Bạn chuyển file đó vào thư mục việc.
2. "Nhờ Claude chốt": Claude soát, sửa lỗi của Gemini và tạo `claude-chot-C-xxx`.
3. Bạn gửi cấp trên, rồi bấm "Đã gửi cấp trên".

**Bàn của bạn (Supervisor)**: gõ việc cần xử lý rồi gửi Gemini làm. Nếu muốn Claude soát, dán câu trả lời của Gemini vào ô phụ và bấm "Gửi Claude kiểm tra".

## Chấm điểm và KPI

| Phần | Điểm | Ai chấm |
|---|---|---|
| Chất lượng / độ chính xác | 40 | Claude |
| Đầy đủ so với yêu cầu | 30 | Claude |
| Trình bày | 10 | Claude |
| Đúng hạn | 20 | App: trừ 5 điểm mỗi ngày trễ, tính theo lần nộp đầu |

- Mỗi lần nộp lại, tổng điểm bị trừ 10%.
- KPI là điểm trung bình có hệ số độ khó (Dễ 1, Vừa 1.5, Khó 2), tính theo ngày nộp lần đầu.
- Xếp loại: A ≥ 85, B ≥ 70, C ≥ 50, còn lại D.
- Xoá task chỉ là ẩn đi, không làm mất lịch sử.

## Cài đặt lần đầu

1. Google Cloud (project của OAuth Client ID trong `../masterdata/js/config.js`), vào Data Access và thêm scope `https://www.googleapis.com/auth/drive`. Email của bạn phải có trong Test users.
2. Mở app, bấm "Kết nối Drive". Google cảnh báo "chưa xác minh" thì chọn Nâng cao, rồi Tiếp tục, và tick quyền Drive.
3. Vào Cài đặt, mục 3: tạo Gem "Warehouse Supervisor" bằng hướng dẫn có sẵn, rồi dán link Gem vào app.
4. Vào Cài đặt, mục 2 (hoặc bấm "✎ Sửa thông tin" ở bàn từng người) để sửa họ tên, chức danh, phụ trách, giới tính Nam/Nữ, kiểu nhân vật, màu tóc, màu áo, màu da.

Chế độ thử với dữ liệu mẫu chỉ mở được khi chạy trên máy dev (localhost).

## Mã nguồn

Web tĩnh, không cần build. Dùng lại `../masterdata/js/{config,util}.js`.

- `js/store.js`: Google Drive (OAuth GIS, thư mục, tải file lên, `office.json`, phát hiện ghi đè lẫn nhau)
- `js/model.js`: dữ liệu, chấm điểm, KPI, đồng bộ file kết quả Claude/Gemini, CSV
- `js/prompts.js`: hướng dẫn Gem, hướng dẫn Claude, các câu lệnh soạn sẵn
- `js/chibi.js`: nhân vật SVG có hoạt hình
- `js/app.js`: giao diện

Sau khi sửa CSS/JS, nhớ tăng `?v=N` trong `index.html`.

## Yêu cầu & Issue (bản 2)

Trang "Yêu cầu & Issue" gom mọi việc vào một chỗ, chia theo 5 **nguồn**:

| Nguồn | Mã việc |
|---|---|
| Cấp trên | C-xxx |
| Phòng ban khác, nhà cung cấp/khách hàng, vận hành kho | R-xxx (yêu cầu), I-xxx (issue) |
| Nhân viên | I-xxx, gắn với nhân viên đó |

- Ưu tiên P1–P4. Nếu để trống hạn chót, app tự đặt theo ưu tiên: P1 trong ngày, P2 +2 ngày, P3 +5 ngày, P4 +14 ngày.
- Issue có thêm các ô: phạm vi, nguyên nhân, xử lý tạm, khắc phục lâu dài, mã liên quan (PO/ASN/GRN/SKU), cấp trên cần báo cáo.
- File được lưu ở `/DIY/Warehouse/Yêu cầu & Issue/` (việc cấp trên vẫn ở `Cấp trên/`).

## Hồ sơ, việc định kỳ, định biên

- **Hồ sơ:** sửa ở "✎ Sửa thông tin" trên bàn từng người, hoặc ở Cài đặt › Nhân sự. Gồm họ tên, chức danh, phụ trách, email, điện thoại, ngày vào làm, kỹ năng/ghi chú.
- **Việc định kỳ (daily task):** bàn nhân viên › thẻ "Việc định kỳ". Thêm từng việc, hoặc dán nhiều dòng theo dạng `Tên | ngày/tuần/tháng | phút`.
- **Đánh giá khối lượng:** thẻ "Đánh giá" trên bàn từng người, và trang KPI › "Khối lượng công việc & định biên".
  - Cách tính: tải = (giờ việc định kỳ + giờ task phát sinh) ÷ công suất (mặc định 7.5 giờ × 22 ngày).
  - Ngưỡng: dưới 50% là thiếu việc, 50–85% phù hợp, 85–105% đầy tải, trên 105% quá tải. Chưa nhập việc định kỳ thì app báo "Chưa đủ dữ liệu".
  - Nút "Nhờ Claude phân tích định biên" soạn sẵn câu lệnh kèm số liệu. Kết quả chỉ để tham khảo, không phải kết luận nhân sự.
- **Xuất bối cảnh:** Cài đặt › Nhân sự › "Xuất bối cảnh nhân sự". Nút này tải file `BOI-CANH-NHAN-SU.md` (không gồm email, số điện thoại) để tải lên Context của project Claude hoặc Knowledge của Gem. Nó cũng lưu một bản Google Doc vào `Hệ thống/`.

## Âm thanh và hiệu ứng

Ở góc phải dưới màn hình Văn phòng có các nút: 🔔 âm báo, ⌨️ tiếng gõ phím (khi có nhân viên đang làm việc), 🎵 nhạc nền lo-fi và ⛶ toàn màn hình. Mọi âm thanh đều tạo bằng Web Audio, không dùng file. Pháo giấy bắn khi có điểm mới từ Claude hoặc khi một việc được đánh dấu xong. App tắt hiệu ứng nếu máy bật chế độ giảm chuyển động.
