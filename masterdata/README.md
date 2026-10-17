# Master Data Pro

Web app phân tích chất lượng dữ liệu, chạy 100% trên trình duyệt (GitHub Pages).
Địa chỉ: **https://crischat.github.io/app/masterdata/**

## Chức năng theo tab

| Tab | Việc làm được |
|---|---|
| Nạp dữ liệu | Excel (.xlsx/.xls/.xlsb/.ods), CSV/TSV, JSON, **Google Sheets** (link), **PDF** (có lớp chữ), **Word** (.docx), **PowerPoint** (.pptx). Mỗi sheet/bảng thành 1 bảng riêng; phần chữ của tài liệu thành bảng "văn bản". Có thể chỉnh dòng tiêu đề. |
| Tổng quan | Điểm chất lượng 0–100, 5 chiều (Đầy đủ, Hợp lệ, Duy nhất, Nhất quán, Chính xác), biểu đồ lỗi theo nhóm, mức độ, cột; lỗi theo từng mục; khuyến nghị. |
| Danh sách lỗi | Lọc theo mức độ, nhóm, loại kiểm tra, cột, tìm kiếm; bấm dòng để xem bản ghi đầy đủ; xuất Excel. |
| Hồ sơ cột | Kiểu dữ liệu, vai trò nhận diện (Mã hàng, ĐVT, SĐT…), độ đầy, giá trị khác nhau, min/max/tổng, top giá trị. |
| Chuẩn hoá & làm sạch | Sửa tự động (khoảng trắng, Unicode, số/ngày dạng chữ, SĐT, viết hoa…), gộp biến thể ("HN / Hà Nội / ha noi"), xoá dòng trùng/dòng tổng; tải file sạch hoặc phân tích lại. |
| Đối chiếu 2 bảng | So khớp theo khoá (vd mã + kho): lệch giá trị, chỉ có ở A, chỉ có ở B, khoá trùng, tổng chênh lệch; xuất Excel. |
| Quy tắc kiểm tra | Ép miền dữ liệu (tồn kho / nhân sự), độ nhạy, quy tắc riêng (bắt buộc, duy nhất, regex, min/max, danh sách, độ dài, không ở tương lai). |
| Chuyên gia AI | Claude đọc bản tóm tắt (không phải toàn bộ file), phân tích nguyên nhân gốc rễ, lập kế hoạch xử lý; hỏi đáp tiếp. |
| Báo cáo | Báo cáo theo mục: xem trước, tải HTML, in/lưu PDF, Excel đầy đủ (Tổng quan, Lỗi theo mục, Chi tiết lỗi, Hồ sơ cột, Biến thể, Dữ liệu + lỗi), **lưu lên Google Drive**. |
| Lịch sử | Điểm chất lượng qua các lần quét, xuất Excel, sao lưu/khôi phục qua Drive. |
| Cài đặt & Drive | Google OAuth Client ID, thư mục Drive, tự động lưu; Claude API key; giao diện sáng/tối. |

## Các nhóm lỗi được kiểm tra

- **Cấu trúc**: dòng trống, dòng tổng lẫn trong dữ liệu, cột không tên, trùng tên cột, ô gộp, cột trống.
- **Thiếu dữ liệu**: ô trống ở cột khoá hoặc cột quan trọng, cột thưa.
- **Trùng lặp**: dòng trùng hoàn toàn, trùng khoá (tồn kho: mã + kho + lô), email/SĐT/CCCD dùng chung nhiều người.
- **Không khớp**: cùng mã khác tên/ĐVT/nhóm (so với giá trị đa số), một hàng nhiều mã, cùng mã NV khác thông tin.
- **Nhập không thống nhất**: viết tắt/có dấu/không dấu/hoa thường, đồng nghĩa (Cái/Chiếc/pcs, HCM/TPHCM/Sài Gòn, HCNS/Nhân sự), gõ sai 1–2 ký tự, lẫn định dạng ngày và dấu thập phân.
- **Định dạng**: số/ngày lưu dạng chữ, ngày không tồn tại, ngày kiểu Mỹ, email, SĐT Việt Nam, CCCD/CMND, MST, họ tên, font TCVN3, Unicode tổ hợp, ký tự ẩn.
- **Mẫu mã**: mã lệch mẫu chung, lẫn hoa/thường.
- **Bất thường**: giá trị lệch xa phân bố (IQR), đơn giá lệch bất thường trong cùng mã, số âm, đơn giá 0.
- **Logic tồn kho**: Tồn cuối = Đầu + Nhập − Xuất, Thành tiền = SL × Đơn giá, xuất vượt tồn, tồn âm, hết hạn/sắp hết hạn, số lẻ với đơn vị đếm.
- **Logic nhân sự**: tuổi, ngày vào làm, giới tính, ngày ở tương lai.
- **Văn bản** (Word/PDF/PPT): lẫn định dạng ngày/số, lặp từ, ngoặc không cân, dấu câu, thuật ngữ viết nhiều cách.

## Kết nối Google Drive (một lần)

1. Vào https://console.cloud.google.com/projectcreate và tạo project "Master Data Pro".
2. Vào **APIs & Services → Library**, bật **Google Drive API** và **Google Sheets API**.
3. Vào **OAuth consent screen**: chọn loại External, điền tên app và email; ở mục Test users thêm email Google của bạn.
4. Vào **Credentials → Create credentials → OAuth client ID**, chọn loại *Web application*.
   Ở **Authorized JavaScript origins** thêm `https://crischat.github.io`.
5. Copy Client ID, dán vào tab **Cài đặt & Drive**, bấm Lưu rồi Kết nối Google.
   Muốn mọi trình duyệt tự có sẵn Client ID thì dán vào `js/config.js`. Client ID là thông tin công khai, đưa lên repo được.

Cấu trúc trên Drive:

```
Master Data Pro/
├─ master-data-state.json          (cấu hình + lịch sử, không chứa API key)
└─ Báo cáo/
   └─ 2026-10-17 0930 - <tên file>/
      ├─ Báo cáo.html
      ├─ Báo cáo chi tiết.xlsx
      ├─ Nhận định AI.md           (nếu đã dùng AI)
      └─ Gốc - <file gốc>
```

App chỉ xin quyền `drive.file`, tức là chỉ thấy các file do chính app tạo, cộng thêm quyền `spreadsheets.readonly` để đọc Google Sheet theo link.

## Claude API key

Nhập ở tab Cài đặt. Key **chỉ lưu trên trình duyệt** (localStorage): không có trong repo, không được sao lưu lên Drive.
Mô hình mặc định là `claude-opus-5-5` (có thể chọn Sonnet 5.5 hoặc Haiku 5.5). Mỗi lần phân tích, app gửi thống kê, tối đa 3 ví dụ cho mỗi loại lỗi và 25 dòng mẫu (có thể tắt phần dòng mẫu).

## Cấu trúc mã nguồn

```
masterdata/
├─ index.html        khung giao diện 11 tab
├─ css/app.css       giao diện (sáng/tối, điện thoại)
└─ js/
   ├─ config.js      Google Client ID mặc định
   ├─ util.js        tiện ích: chuẩn hoá chuỗi, số, ngày, lưu trữ
   ├─ parsers.js     đọc Excel/CSV/JSON/Sheets/PDF/Word/PPT
   ├─ analyzer.js    bộ máy kiểm tra, chấm điểm, làm sạch, đối chiếu
   ├─ export.js      xuất Excel / HTML
   ├─ drive.js       Google Drive & Sheets API
   ├─ ai.js          Claude API
   ├─ samples.js     dữ liệu mẫu có cài lỗi
   └─ app.js         điều khiển giao diện
```

Chạy thử trên máy: trong thư mục `app`, chạy `python -m http.server 8765` rồi mở http://localhost:8765/masterdata/.
Khi sửa CSS/JS, tăng số `?v=` trong `index.html` để trình duyệt tải bản mới.
