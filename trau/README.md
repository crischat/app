# Trâu Đi Cày

Một con trâu AI được giao 2.000.000đ vốn thật. Mỗi tháng nó phải lãi ít nhất 600.000đ để tự trả phí Claude Pro.

- Trang: `/app/trau/` (tĩnh, GitHub Pages, không gọi API)
- Sổ cái: `data/so-cai.json`. Đây là nguồn sự thật duy nhất.
- Bộ não: Claude Pro (Claude Code hoặc claude.ai). Không tốn thêm tiền API.

## Khác bản "AI Sống Còn" thế nào

Bản gốc cầm tiền đánh future đòn bẩy, mua vé số và xin donate. Trâu thì **cày**: tự làm ra sản phẩm, dịch vụ rồi bán.

Lý do: 600k trên 2 triệu là 30% mỗi tháng. Không có cách đầu tư nào đạt mức đó đều đặn mà không có nguy cơ mất trắng. Cách thực tế duy nhất là bán sức lao động, ở đây là sức của Claude cộng với nghề kho và master data của chủ.

## Cách cho trâu đi cày (mỗi ngày hoặc vài ngày một lần)

Mở Claude Code trong `C:\dev\Cris\app` và gõ:

> Trâu ơi, đi cày

Claude sẽ làm theo quy trình dưới đây.

### Quy trình của Claude

1. **Đọc sổ.** Mở `trau/data/so-cai.json`, tính ví, lãi tháng, số ngày còn lại và số tiền cần kiếm mỗi ngày.
2. **Báo tình hình.** Nói 2–3 câu: đang vượt hay chậm tiến độ, ruộng nào đang ra tiền.
3. **Nhận tin từ chủ.** Hỏi chủ có khoản thu/chi mới không. Chỉ ghi vào `so` khi chủ đưa đủ số tiền và bằng chứng (mã đơn, ảnh CK, tên khách).
4. **Chọn 1–3 việc** có khả năng ra tiền sớm nhất. Ưu tiên ruộng đang có khách, rồi tới việc không tốn vốn.
5. **Làm luôn phần việc của trâu.** Ví dụ: viết template, viết bài đăng bán hàng, soạn ebook, làm sạch file của khách. Lưu sản phẩm vào `trau/kho/<ruong>/`.
6. **Cập nhật sổ.** Sửa `viec` (dang/xong + ketQua), thêm một dòng `nhatKy`. Nếu bỏ một ruộng thì thêm `baiHoc`.
7. **Giao việc cho chủ.** Liệt kê rõ những việc chỉ người mới làm được: đăng bài, nhắn khách, nhận tiền, chi tiền.
8. **Không commit, không push** trừ khi chủ bảo.

### Luật cứng (Claude không được phá)

- Không future, đòn bẩy, crypto, vé số, cá cược, và không "đầu tư" vốn vào bất cứ thứ gì.
- Claude không tự chuyển, nhận hay rút tiền. Mọi giao dịch đều do chủ làm.
- Khoản chi trên `duyetTren` (100k) phải được chủ đồng ý trong chat trước.
- Khi ví xuống dưới `dayVon` (1,4 triệu), dừng mọi khoản chi.
- Không bịa doanh thu. Khoản không có bằng chứng thì không ghi.
- Rút tiền trả Claude ghi là `"loai": "rut"`. Khoản này không trừ vào lãi.

## Cấu trúc sổ

```json
{
  "trangThai": "chuan-bi | dang-cay",
  "batDau": "YYYY-MM-DD",
  "vonGoc": 2000000, "mucTieuThang": 600000, "dayVon": 1400000, "duyetTren": 100000,
  "ruong": [{ "id", "icon", "ten", "mota", "gia", "kenh", "trangThai": "dang-cay | gieo-ma | bo-hoang" }],
  "so":    [{ "ngay", "loai": "thu | chi | rut", "soTien", "ruong", "ghiChu", "bangChung" }],
  "viec":  [{ "ngay", "ruong", "viec", "trangThai": "cho | dang | xong", "ketQua" }],
  "nhatKy":[{ "ngay", "text" }],
  "baiHoc":[{ "ngay", "text" }]
}
```

Ví = `vonGoc + thu − chi − rut`. Lãi tháng = `thu − chi` trong tháng.

Chủ cũng có thể ghi sổ ngay trên trang (tab Sổ cái). Khoản ghi ở đó là nháp, chỉ lưu trên máy. Bấm "Tải sổ mới" rồi thay file `data/so-cai.json`.

> Sổ nằm trong repo public nên ai cũng xem được. Đừng ghi số tài khoản ngân hàng hay thông tin cá nhân của khách vào sổ.
