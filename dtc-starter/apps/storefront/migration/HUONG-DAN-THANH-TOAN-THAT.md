# Bật thanh toán PayOS cho Yarnly trên Vercel

PayOS tạo trang thanh toán có QR chuyển khoản. Yarnly chỉ chuyển đơn sang **đã thanh toán** sau khi nhận được webhook PayOS hợp lệ, chữ ký được xác minh và số tiền khớp với đơn.

## 1. Lấy thông tin kênh PayOS

Đăng nhập [my.payos.vn](https://my.payos.vn), hoàn tất xác minh tài khoản, tạo kênh thanh toán và liên kết tài khoản ngân hàng nhận tiền. Lấy `Client ID`, `API Key` và `Checksum Key` của chính kênh đó.

Tài liệu: [Bắt đầu với PayOS](https://payos.vn/docs/) · [Node.js SDK](https://payos.vn/docs/sdks/back-end/node/)

## 2. Cấu hình Vercel

Trong Vercel > Project > Settings > Environment Variables, thêm cho môi trường Production:

| Biến | Giá trị |
| --- | --- |
| `PAYMENT_MODE` | `bank` |
| `PAYOS_CLIENT_ID` | Client ID của kênh PayOS |
| `PAYOS_API_KEY` | API Key của kênh PayOS |
| `PAYOS_CHECKSUM_KEY` | Checksum Key của kênh PayOS |
| `MONGODB_API_PREVIEW` | `true` |
| `NEXT_PUBLIC_YARNLY_BACKEND_MODE` | `mongodb` |
| `STOREFRONT_URL` | `https://exe201-rho.vercel.app/vn` |

Giữ nguyên các biến MongoDB, `AUTH_SECRET` và cấu hình còn lại. Ba khóa PayOS là biến server-only; tuyệt đối không đặt tiền tố `NEXT_PUBLIC_` và không gửi khóa qua chat. Sau khi lưu, redeploy Production.

Đơn đã tạo trước khi bật `PAYMENT_MODE=bank` vẫn giữ chế độ thanh toán cũ. Hãy tạo một đơn mới sau khi deploy.

## 3. Đăng ký webhook PayOS

Trong kênh PayOS, cấu hình webhook URL:

`https://exe201-rho.vercel.app/api/payments/payos`

PayOS sẽ gửi webhook mẫu để kiểm tra URL. Endpoint trả HTTP 200 cho webhook có chữ ký hợp lệ; webhook mẫu hoặc giao dịch không khớp đơn sẽ được ghi nhận để đối soát, không tự đánh dấu thanh toán.

Tài liệu: [Webhook PayOS](https://payos.vn/docs/du-lieu-tra-ve/webhook/) · [Xác nhận URL webhook](https://payos.vn/docs/api/)

## 4. Kiểm tra một giao dịch nhỏ

1. Tạo đơn mới trên website. Khung thanh toán sẽ tự tạo link PayOS.
2. Chọn **Open PayOS and scan QR**, quét QR bằng ứng dụng ngân hàng và xác nhận chuyển khoản.
3. Trở lại trang đơn. Trang tự làm mới trạng thái; sau webhook thành công, đơn sẽ chuyển sang đã thanh toán.
4. Nếu chưa cập nhật, kiểm tra nhật ký webhook trong PayOS và collection MongoDB `outbox`, lọc `type: "bank_receipt"`. Trường `data.requires_review: true` cho biết giao dịch cần đối soát thủ công.

PayOS hiện không có sandbox riêng; hãy thử bằng số tiền nhỏ. Không chuyển lần hai chỉ vì trang chưa cập nhật. Trang return/cancel của trình duyệt không được dùng làm bằng chứng thanh toán; giao dịch đến muộn, sai số tiền hoặc link cũ cần được kiểm tra thủ công.
