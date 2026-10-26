# Medusa Admin gốc trên Next.js + MongoDB — 25/10/2026

## Giao diện

Next.js phục vụ giao diện Medusa gốc tại `/app/*`. Bản build tiếng Việt lịch sử trong `apps/backend/admin-build` được giữ để đối chiếu. Bản đang phục vụ được build bằng cùng Medusa Dashboard 2.21.1, với các trang mở rộng Yarnly dịch sang tiếng Anh.

- Build từ nguồn bằng `node apps/backend/scripts/build-english-admin.cjs` (chạy tại thư mục backend: `node scripts/build-english-admin.cjs`). Script không khởi động Medusa và không kết nối PostgreSQL.
- 393 file của bản build mới được đưa vào `apps/storefront/public/app`; manifest lưu SHA-256 từng file. Vercel dùng bản này khi chỉ có thư mục storefront.
- Không dựng lại sidebar, table, drawer hoặc thay thư viện giao diện gốc.
- Sidebar ẩn **Marketplace Orders, Promotions, Price Lists** bằng API layout gốc; giữ Orders, Products, Inventory, Customers, Payouts, Artisans và Settings. Tùy chỉnh layout cá nhân được lưu trong MongoDB.
- `/vn/quan-tri` và `/app` chuyển đến `/app/orders`.
- Storefront, seller, admin Yarnly, lỗi API và nội dung email hệ thống đã dịch sang tiếng Anh. HTML dùng `lang="en"`; định dạng ngày/số dùng tiếng Anh, tiền vẫn VND và múi giờ Việt Nam.
- Không dịch dữ liệu đã lưu: tên/mô tả sản phẩm, nội dung shop, địa chỉ, tên tỉnh hoặc đường dẫn cũ. Những dữ liệu này có thể vẫn hiển thị tiếng Việt theo yêu cầu.

Đây là khôi phục giao diện gốc kèm những thay đổi người dùng yêu cầu. Chưa có đủ bằng chứng để tuyên bố toàn bộ nghiệp vụ Medusa tương đương 100%.

## Lớp tương thích API

`src/server/original-admin.ts` phục vụ các URL mà bundle gốc gọi:

- `/auth/user/emailpass`, `/auth/session`: tài khoản admin trong MongoDB; cookie HttpOnly; rate limit; kiểm tra origin của thao tác ghi; thu hồi phiên khi đăng xuất.
- `/admin/users/me`, feature flags, thông tin store và các danh sách cấu hình từ dữ liệu đã chuyển/archived.
- `/admin/products`: đọc danh sách/chi tiết, tạo/sửa sản phẩm, variant, giá, options và xoá mềm sản phẩm. Giá tính cho storefront được cập nhật cùng giá variant.
- `/admin/uploads`: nhận multipart đúng cách SDK Medusa gửi, kiểm tra ảnh bằng luồng ký PUT/xác nhận S3 hiện có. Giới hạn mỗi request/ảnh 4 MB cho Vercel.
- `/admin/customers`: danh sách/chi tiết và thông tin cơ bản.
- Native Orders fulfillment: mở form với quan hệ kho/phương thức thật, fulfill từng phần, hủy trước khi giao và hoàn tồn kho/reservation, tạo shipment, đánh dấu giao; trạng thái đồng bộ với seller. Chi tiết: `FULFILLMENT-QA.md`.
- `/admin/orders`: danh sách/chi tiết. Trạng thái thanh toán được chuyển từ payment collection thật sang enum mà Medusa Admin cần.
- Sửa tùy chọn variant theo payload SDK dạng object; thêm/xóa variant; không cho xóa khi còn reservation; giữ ID giá trị option khi đổi tiêu đề. Gán tag/sales channel/type lấy từ archive thật hoặc dữ liệu mới.
- `/admin/layouts/*`: lưu, đọc, đặt lại layout cá nhân/default; cấu hình sidebar ẩn ba mục đã chọn.
- `/admin/inventory-items`: tồn kho tổng theo variant; không giảm dưới số đang giữ cho đơn.
- Collections, categories, types, tags, sales channels, locations, shipping profiles: dữ liệu đã chuyển hoặc archive thực tế; không bơm dữ liệu mẫu.
- `/admin/marketplace/*`: chuyển đến cùng các handler MongoDB đã kiểm thử, giữ màn hình và thao tác Nghệ nhân/Đơn sàn/Đối soát gốc.

Các luồng Medusa nâng cao chưa nối đầy đủ (ví dụ import/export theo workflow, promotion/price list/tax accounting, trả/đổi hàng nhiều bước, quản lý credential/RBAC, phân bổ nhiều kho) trả lỗi rõ ràng khi chưa hỗ trợ. Không trả thành công giả hoặc proxy ngầm sang Render. **Không coi đây là khôi phục 100% nghiệp vụ của Medusa.**

Giao diện seller đã dịch sang tiếng Anh; việc phục hồi giao diện seller cũ chưa được xác nhận tương đương.

## Những thay đổi trước đó được giữ

- Phí ship vùng 18.000/22.000 đồng; không tạo vận đơn GHN mới. Nhập mã vận đơn thủ công vẫn hoạt động ở Đơn sàn.
- Form tạo shop có ô tỉnh/thành lấy hàng bắt buộc. Adapter vẫn đọc tỉnh ở cuối địa chỉ cho các client cũ và kiểm tra tên tỉnh hợp lệ. Không gán tỉnh mặc định.
- Email vẫn tắt theo yêu cầu; sự kiện được xếp outbox.
- Tài khoản test admin và seller đã cấp giữ nguyên.

## Kiểm thử

- `original-admin-assets.test.mjs`: hash của 393 file bản build tiếng Anh khớp manifest.
- `english-interface.test.mjs`: rà literal giao diện/thông báo ở frontend, backend MongoDB và admin extension; ngoại lệ chỉ dành cho hai handle catalogue cũ và dữ liệu tỉnh.
- `original-admin.integration.mjs`: database QA riêng, cookie login/logout, phân quyền, bộ lọc mảng kiểu SDK, tạo/sửa sản phẩm/variant/giá và xác minh storefront đọc giá mới, form nghệ nhân gốc, lỗi rõ ràng cho API chưa hỗ trợ.
- `original-admin-uploads.integration.mjs`: multipart upload PNG 1 pixel, URL public đúng bytes, seller không được upload bằng API admin; dọn đúng object QA.
- Unit tests, production build, TypeScript và HTTP smoke đạt.
- Giữ kiểm thử nghiệp vụ admin trước đó (`admin-parity.integration.mjs`) cho xác nhận/từ chối thanh toán, giao/huỷ/hoàn tiền, đối soát và khoá/mở shop.

## Cách test

1. Đóng/tải lại tab admin cũ sau build, mở `http://localhost:8000/app` và đăng nhập bằng tài khoản admin đã cấp.
2. Products: mở sản phẩm, xem Media, Options, Variants, Metadata và các hộp thoại nguyên bản. Chỉ sửa sản phẩm test khi kiểm thử ghi dữ liệu.
3. Artisans: chuyển tab, mở Create artisan. Điền tên tỉnh/thành lấy hàng thật vào ô Pickup province / city.
4. Đơn sàn: kiểm tra 5 tab; chỉ thao tác thanh toán/giao/huỷ/hoàn tiền trên đơn test.
5. Đối soát: xem kỳ, phí, tài khoản và cấu hình; nút Đã chuyển chỉ ghi nhận giao dịch, không chuyển tiền ngân hàng.
6. Những thao tác chưa hỗ trợ sẽ báo lỗi cụ thể; không hiểu việc có menu/màn hình gốc là nghiệp vụ đã hoàn tất.

## Chính sách thanh toán — 26/10/2026

Đơn hàng mới bắt buộc chuyển khoản. Checkout chỉ hiển thị Bank transfer; giỏ cũ chọn COD được giao diện chọn lại chuyển khoản. API cập nhật payment_method và hoàn tất giỏ đều từ chối COD/phương thức khác. Đơn mới có payment_method=bank_transfer, payment_status=awaiting_transfer, suborder=pending_payment và hạn chuyển khoản 10 phút. Không thay đổi đơn COD đã tồn tại hoặc dữ liệu mô tả sản phẩm/shop.

Kiểm thử bổ sung: render checkout với giỏ cũ chọn COD, chặn API COD và giỏ cũ, không tạo đơn/reservation khi bị từ chối, phí vùng, bank-transfer pending state, chống oversell và retry. Atlas đã chạm giới hạn collection; các kiểm thử tái sử dụng database QA có sẵn qua QA_DATABASE_NAME, không xóa database hoặc tạo thêm collection. Không dùng biến này với database website.
