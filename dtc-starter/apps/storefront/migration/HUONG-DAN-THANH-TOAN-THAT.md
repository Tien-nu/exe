# Bật thanh toán chuyển khoản thật cho Yarnly

Hiện bản local đang dùng `PAYMENT_MODE=simulation`. Quét QR hiện tại không tạo giao dịch ngân hàng. Các bước dưới đây chuyển **đơn mới** sang thanh toán thật bằng đúng tài khoản đã lưu ở Admin > Payouts. Không cần mở tài khoản ngân hàng khác.

## 1. Liên kết ngân hàng với SePay

Đăng ký/đăng nhập SePay, vào phần Tài khoản ngân hàng và liên kết chính tài khoản nhận tiền đang hiển thị trên website. Làm theo hướng dẫn riêng của ngân hàng được SePay hỗ trợ, và kiểm tra giao dịch mới có xuất hiện trong SePay.

Hướng dẫn chính thức: https://docs.sepay.vn/them-tai-khoan-ngan-hang.html

## 2. Chuẩn bị website HTTPS công khai

Deploy bản Next.js này lên Vercel để có URL dạng `https://ten-project.vercel.app` hoặc tên miền riêng. SePay cần gọi được URL này từ Internet. `localhost` hoặc IP Wi-Fi `10.x`, `192.168.x` không dùng được cho webhook nhận tiền thật.

## 3. Cấu hình biến môi trường

Trong Vercel > Project > Settings > Environment Variables, cấu hình cho đúng môi trường đang deploy:

| Biến | Giá trị |
| --- | --- |
| `PAYMENT_MODE` | `bank` |
| `SEPAY_WEBHOOK_API_KEY` | Chuỗi ngẫu nhiên riêng, tối thiểu 32 ký tự |
| `MONGODB_API_PREVIEW` | `true` |
| `NEXT_PUBLIC_YARNLY_BACKEND_MODE` | `mongodb` |

Giữ các biến MongoDB, `AUTH_SECRET` và cấu hình website hiện có. Không tạo bản biến `NEXT_PUBLIC_SEPAY_WEBHOOK_API_KEY`. Không gửi khóa hoặc URI chứa mật khẩu qua chat. Có thể tạo khóa riêng bằng `openssl rand -hex 32` trên máy của bạn, rồi tự sao chép vào Vercel và SePay.

Nếu cũng muốn chạy chế độ thật tại local, sửa các biến tương ứng trong `apps/storefront/.env.local` và khởi động lại server. Sau khi đổi biến trên Vercel, **Redeploy** để áp dụng.

`QR_PAYMENT_BASE_URL` chỉ phục vụ luồng mô phỏng trước đây, không phải URL webhook SePay và không cần dùng cho chế độ `bank`.

## 4. Tạo webhook SePay

Trong SePay > Webhooks > Thêm webhook:

- Tên: `Yarnly payment`.
- Sự kiện: **Có tiền vào**.
- Tài khoản áp dụng: đúng tài khoản ngân hàng đã lưu trên website.
- URL: `https://TEN-MIEN-CUA-BAN/api/payments/sepay` (thay bằng tên miền thật).
- Phương thức xác thực: **API Key**.
- API Key: đúng giá trị `SEPAY_WEBHOOK_API_KEY` ở Vercel.
- Dùng JSON và giao dịch thật; không dùng Test mode để xác nhận tiền thật.
- Chưa đặt bộ lọc mã thanh toán nếu chưa cấu hình đúng tiền tố `YARNLY`; lọc sai có thể khiến giao dịch không được gửi đến website.

Tài liệu chính thức: https://docs.sepay.vn/tich-hop-webhooks.html

Endpoint xác thực header `Authorization: Apikey ...`; bạn chỉ điền giá trị khóa vào ô API Key của SePay, không đặt khóa vào URL webhook.

## 5. Kiểm thử bằng một đơn mới

1. Tạo đơn sau khi `PAYMENT_MODE=bank` đã được áp dụng. Đơn mô phỏng cũ không tự biến thành đơn thanh toán thật.
2. Kiểm tra QR có đúng tài khoản nhận, tổng tiền gồm phí ship và nội dung `YARNLY <số đơn>`.
3. Bạn tự dùng ứng dụng ngân hàng quét QR và **xác nhận chuyển tiền**. Quét mã mà chưa xác nhận trong ứng dụng ngân hàng chưa tạo giao dịch.
4. Chuyển đúng số tiền/nội dung trong thời hạn 10 phút của đơn.
5. Kiểm tra SePay đã ghi nhận tiền vào, rồi xem Nhật ký webhook: HTTP 200 và `{"success":true}`.
6. Kiểm tra đơn website và Admin Orders chuyển sang đã thanh toán. Seller chỉ nhận đơn sau bước xác nhận thành công.

Nút Gửi thử của SePay chỉ kiểm tra kết nối, không chứng minh đã nhận tiền thật. Không chuyển lại lần hai chỉ vì giao diện chưa cập nhật; xem giao dịch ngân hàng và log webhook trước.

## Nếu chưa tự cập nhật

- Không có giao dịch trong SePay: kiểm tra liên kết ngân hàng và tài khoản nhận.
- Không có lần gọi webhook: kiểm tra sự kiện, tài khoản và bộ lọc mã.
- HTTP 401: khóa SePay và Vercel không khớp.
- HTTP 503: thiếu cấu hình hoặc website không kết nối được Atlas.
- HTTP 200 nhưng đơn chưa trả tiền: xem `outbox`, lọc `{"type":"bank_receipt","data.requires_review":true}`. Có thể sai số tiền, mã đơn, tài khoản, đơn đã hết hạn hoặc là đơn mô phỏng cũ.

Giao dịch sai hoặc đến trễ phải được đối soát thủ công. Hệ thống không tự hoàn tiền. Kiểm tra thời gian chạy tác vụ hủy đơn hết hạn theo cấu hình cron đã chọn cho Vercel Hobby.
