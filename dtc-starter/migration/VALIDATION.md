> Biểu phí hiện tại: nội tỉnh 18.000₫/kiện, ngoại tỉnh 22.000₫/kiện, không dùng GHN để lấy địa chỉ hoặc tính phí. Chế độ địa chỉ mẫu đã gỡ. Các ghi chú demo/GHN phía dưới là lịch sử triển khai.

# Kết quả kiểm thử — 25/10/2026

Phạm vi: bản Next.js + MongoDB Atlas chạy local/staging. Chưa deploy/cutover production.

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript toàn bộ storefront và server | Pass, không bỏ qua lỗi |
| Unit/security/migration | 38 pass |
| MongoDB tích hợp: checkout, đồng thời/tồn kho, nghệ nhân/làm riêng, GHN mock | 4 pass |
| QA riêng: admin catalog, địa chỉ, timer, payout, outbox, cron auth | 1 pass |
| Supabase S3 thật: signed PUT, CORS, HEAD/content, finalize, retry, URL công khai, chặn thiếu auth | 1 pass, ảnh thử được xóa |
| Check-storage độc lập | Pass: upload/read/public/delete |
| Production build | Pass; trang sản phẩm/collection/category được xây dựng từ Atlas |
| Production local HTTP smoke | 14 kiểm tra HTTP pass; search adapter thật và sort giá pass |
| Đối chiếu migration | 8.450 dòng nguồn = 8.450 dòng archive; ID/hash/actor, tiền đơn và tồn kho đã đối chiếu |
| Giao diện đã xem/thử | Danh mục, sản phẩm, thêm giỏ, đăng nhập khách → checkout, đăng nhập admin, chuyển giỏ sau đăng nhập, ô tìm kiếm |
| Email thật | Chưa chạy theo yêu cầu; worker với delivery disabled được test |
| GHN lấy hàng thật | Không chạy; create/cancel/webhook được test bằng mock, API địa chỉ thật đã trả dữ liệu |
| Vercel preview, lịch gọi bên ngoài và callback GHN trên domain thật | Chưa chạy |
| Lint | Không tuyên bố đã pass; build vẫn bỏ lint theo cấu hình cũ |

Đã sửa lỗi: tính phí GHN trước khi giỏ có địa chỉ; POST không body của SDK; lời gọi nội bộ qua HTTP trong SSR/build; kiểm tra kiểu ES2022 và khai báo runtime scrypt; bổ sung sort tương thích InstantSearch; chặn sửa đơn trong lúc thao tác GHN chưa đối soát xong. SSR MongoDB đánh dấu không cache để giá/trạng thái/tồn kho được đọc mới.

Lần chạy đầu ngày 25/10 bị TLS do IP đầu ra đổi; sau khi người dùng thêm IP Access List, check kết nối và các bài tích hợp đều chạy đạt. Các kết quả thất bại do hạ tầng không được ghi nhận là pass trước khi chạy lại.

Kiểm thử tích hợp dùng fixture riêng; bài timer/payout/outbox dùng database QA duy nhất và dọn dữ liệu của bài, không drop database. Dữ liệu PostgreSQL nguồn không bị ghi. Chưa gửi email hoặc yêu cầu shipper thật.

Luồng chuyển khoản hiện giữ hành vi mô phỏng tự xác nhận của bản cũ; chưa phải đối soát ngân hàng thật. Không dùng kết quả test này để khẳng định thanh toán ngân hàng production đã được tích hợp.

Xem [hướng dẫn tự test](HUONG-DAN-KIEM-THU.md) cho lệnh chạy và checklist theo vai trò.

## Hồi quy payment và địa chỉ mẫu

- Đã sửa việc checkout trả `null` khi GHN quote/provider lỗi: giữ form địa chỉ, hiển thị cảnh báo và nút thử lại.
- Không chuyển sang payment nếu chưa lưu được phương thức giao hàng; không tiếp tục review khi chưa có phí.
- Sửa việc chọn COD/chuyển khoản làm timestamp giỏ thay đổi và vô hiệu báo giá dù nội dung kiện không đổi.
- Thêm 4 test UI/action, 2 test giới hạn demo và 1 test tích hợp địa chỉ mẫu → phí → chọn thanh toán → đặt đơn trong QA riêng.
- GHN thật kiểm tra bằng mã hành chính công khai và giá/trọng lượng giả đã trả yêu cầu cập nhật địa chỉ kho. Không dùng giỏ khách thật cho kiểm tra này.
- Chế độ demo staging dùng địa chỉ có nhãn mẫu, phí minh họa 25.000₫/kiện và chặn vận đơn thật; không âm thầm dùng phí minh họa cho production.

Kiểm tra HTTP payment bằng tài khoản/giỏ giả tạm thời: form địa chỉ, lựa chọn thanh toán, hướng dẫn tính lại phí và banner địa chỉ mẫu xuất hiện; fixture được dọn sau kiểm tra.

## Phí khu vực và bắt buộc tỉnh gửi

- 38 unit test pass; 6 MongoDB integration pass (storage chạy riêng).
- Kiểm tra nội tỉnh 18.000₫, ngoại tỉnh 22.000₫, nhiều nghệ nhân cộng theo kiện; phát hiện tỉnh gửi đổi sau báo giá và yêu cầu tính lại.
- Test checkout chặn toàn bộ `fetch` ra ngoài: vẫn báo giá/đặt đơn được, xác nhận không phụ thuộc GHN.
- Đăng ký/cập nhật shop thiếu tỉnh hoặc tỉnh không hợp lệ bị từ chối trước khi ghi hồ sơ; quản trị bổ sung tỉnh cho shop cũ, kiểm tra auth.
- Tên tỉnh cũ được đối chiếu về tỉnh hiện tại theo NQ 202/2025/QH15; không tự đoán tỉnh cho shop cũ thiếu dữ liệu.
- Build production và TypeScript đạt.
