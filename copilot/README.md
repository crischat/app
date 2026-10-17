# Interview Copilot

Trợ lý phỏng vấn/cuộc gọi chạy theo thời gian thực trên trình duyệt: nghe Google Meet và mic, chép lời, dịch, gợi ý câu trả lời từ CV và kinh nghiệm của bạn, đọc màn hình.
Địa chỉ: **https://crischat.github.io/app/copilot/** (dùng Chrome hoặc Edge trên máy tính)

## Cách hoạt động

| Nguồn | Lấy bằng | Gán nhãn |
|---|---|---|
| Micro | `getUserMedia` | **Tôi** |
| Âm thanh tab Google Meet | `getDisplayMedia` (chia sẻ tab, bật "Chia sẻ âm thanh của thẻ") | **Người phỏng vấn** |
| Hình ảnh tab Meet | cùng lần chia sẻ tab | dùng cho "Đọc màn hình" |

- App tự cắt câu khi người nói ngừng khoảng 0,9 giây. Mỗi câu được gửi cho **Gemini** chép lời nguyên văn và dịch (Việt ↔ Anh). Độ trễ khoảng 2–4 giây.
- Khi người phỏng vấn hỏi xong, AI gợi ý (Gemini hoặc Claude, chọn trong Cài đặt) trả lời dần từng chữ, gồm: câu hỏi kèm bản dịch, câu trả lời tiếng Anh để nói theo, ý chính tiếng Việt, dẫn chứng lấy từ hồ sơ, gợi ý nếu bị hỏi tiếp.
- Ngữ cảnh gửi kèm gồm: CV, JD, kinh nghiệm bổ sung, câu trả lời đã chuẩn bị, phong cách trả lời, và tóm tắt 5 buổi gần nhất.
- Khi kết thúc buổi, AI tóm tắt buổi và lưu vào Lịch sử. Các tóm tắt này thành "trí nhớ" cho các buổi sau.

## Phím tắt khi đang chạy

- `Ctrl + Enter`: gợi ý ngay, không chờ hết câu.
- `Ctrl + Shift + S`: đọc màn hình (đề bài, code, slide).
- Ô "Gõ câu hỏi…": dùng khi AI nghe sót câu hỏi.

## Lưu trữ & bảo mật

- Hồ sơ, lịch sử và cài đặt nằm trong localStorage của trình duyệt.
- Key Gemini/Claude và kết nối Google dùng chung với Master Data Pro (cùng domain).
- Sao lưu và khôi phục qua Google Drive: thư mục `Master Data Pro/Interview Copilot/` gồm `copilot-state.json` và biên bản `.md` của từng buổi.
- App không lưu file ghi âm. Âm thanh chỉ được gửi tới Gemini để chép lời.
- Không bao giờ ghi API key vào code: repo này công khai.

## Lời khuyên khi dùng

- Đeo tai nghe để mic không thu lại tiếng người phỏng vấn.
- Mở tool ở **cửa sổ riêng**. Nếu bạn chia sẻ màn hình trong cuộc gọi, chỉ chia sẻ tab hoặc cửa sổ khác.
- Gói Gemini miễn phí giới hạn số lần gọi mỗi phút. Buổi dài, nói liên tục có thể bị chậm; dùng gói trả phí sẽ ổn định hơn.
- Một số công ty cấm dùng công cụ AI khi phỏng vấn, và một số nơi yêu cầu báo trước khi chép lời cuộc gọi. Bạn tự cân nhắc.

## Mã nguồn

```
copilot/
├─ index.html      giao diện 5 tab
├─ css/copilot.css
└─ js/
   ├─ audio.js     thu âm, cắt câu (VAD), xuất WAV 16 kHz, chụp khung hình
   └─ copilot.js   phiên trực tiếp, chép lời, gợi ý, hồ sơ, chuẩn bị, lịch sử, cài đặt
```

Phần dùng chung lấy từ `../masterdata/js/`: `util.js`, `parsers.js` (đọc CV PDF/Word), `drive.js`, `ai.js` (Claude/Gemini, có streaming, gửi ảnh và âm thanh).
