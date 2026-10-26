> Cập nhật mới nhất: giao hàng tính theo tỉnh lấy hàng của từng nghệ nhân: **18.000₫/kiện nội tỉnh, 22.000₫/kiện ngoại tỉnh**. Checkout không gọi GHN và không dùng địa chỉ mẫu. Shop mới phải chọn tỉnh/thành phố; shop cũ thiếu tỉnh cần vào quản trị → Nghệ nhân → Bổ sung tỉnh/thành phố lấy hàng.

# Hướng dẫn kiểm thử Yarnly — Next.js + MongoDB

Cập nhật: 25/10/2026. Mã chuẩn: `Yarnly_deploy/dtc-starter`.

Bản này dùng MongoDB staging. Website production chưa được chuyển sang Vercel. Email đang tắt theo yêu cầu. Chỉ thao tác trên tài khoản, sản phẩm và đơn bạn tạo để thử; dữ liệu nhập từ PostgreSQL vẫn được giữ để đối chiếu.

## 1. Chạy website trên máy

Mở Terminal:

```sh
cd /Users/nguyenthithuytien/Downloads/EXE201/Yarnly_deploy/dtc-starter/apps/storefront
pnpm dev:mongodb
```

Mở http://localhost:8000/vn. Nếu cổng 8000 đang có bản thử chạy, dùng bản đang mở; không cần khởi động thêm server thứ hai.

Ba địa chỉ chính:

- Khách hàng: http://localhost:8000/vn/account
- Nghệ nhân: http://localhost:8000/vn/kenh-nghe-nhan/dang-nhap
- Quản trị: http://localhost:8000/vn/quan-tri

Dùng tài khoản cũ đã được chuyển từ PostgreSQL hoặc đăng ký khách hàng/nghệ nhân mới để thử. Tài khoản quản trị dùng email/mật khẩu quản trị cũ; đăng ký khách hàng không cấp quyền quản trị. Có thể dùng hai cửa sổ trình duyệt hoặc cửa sổ riêng tư để tránh nhầm tài khoản.

## 2. Kiểm tra cấu hình và chạy test tự động

Chạy trong thư mục storefront ở trên:

```sh
pnpm migration:check-db
pnpm migration:check-storage
pnpm typecheck
pnpm test:migration
pnpm test:integration
pnpm test:storage
```

Kết quả mong đợi:

| Lệnh | Nội dung | Kết quả mong đợi |
| --- | --- | --- |
| `migration:check-db` | Kết nối Atlas | `MongoDB connection succeeded.` |
| `migration:check-storage` | Tạo ảnh thử, kiểm tra đọc/URL công khai rồi xóa ảnh đó | `Storage check passed` và `Temporary test image removed` |
| `typecheck` | Kiểm tra kiểu toàn bộ frontend/backend mới | Thoát thành công, không có lỗi |
| `test:migration` | 38 kiểm thử quy tắc, phân quyền, dữ liệu và migration | 38 pass |
| `test:integration` | 6 kịch bản tích hợp MongoDB, gồm nhiều bước/assertion | 6 pass; bài storage được skip ở lệnh này |
| `test:storage` | Upload S3 thật, CORS, xác nhận ảnh, quyền truy cập và retry | 1 pass |

Kiểm thử tích hợp tự tạo dữ liệu giả rồi dọn đúng dữ liệu đó. Bài cron/đối soát dùng database QA riêng để không xử lý các đơn nhập từ PostgreSQL. Bài GHN tạo/huỷ vận đơn dùng mock, không gọi shipper thật. Bài storage chỉ tạo ảnh thử riêng rồi xóa ảnh đó.

Nếu Atlas báo `TLS_FAILED`, kiểm tra Network Access và thêm IP đầu ra hiện tại với `/32`; chờ Active rồi chạy lại. Không đổi hostname MongoDB thành IP máy tính và không tắt TLS.

Không gửi `.env.local`, URI hoặc mật khẩu vào chat. Khi cần gửi lỗi, chỉ gửi phần thông báo đã che thông tin nhạy cảm.

## 3. Khách hàng — danh mục và giỏ hàng

| Bước | Thao tác | Phải thấy |
| --- | --- | --- |
| 1 | Mở `/vn/home`, `/vn/store`, xem trang 2 | Danh mục, ảnh và giá được tải; phân trang không mất sản phẩm |
| 2 | Mở nút tìm kiếm, nhập `len`, `tui` hoặc tên sản phẩm | Có kết quả phù hợp; xóa từ khóa không gây lỗi |
| 3 | Chọn sắp xếp giá tăng/giảm | Thứ tự giá đổi đúng |
| 4 | Mở sản phẩm nhiều biến thể | Chọn màu/kích thước cập nhật giá và nút mua |
| 5 | Thêm một sản phẩm còn hàng | Số lượng giỏ tăng, tổng tiền bằng giá × số lượng |
| 6 | Đổi số lượng rồi xóa món | Tổng tiền cập nhật; giỏ trống hiển thị bình thường |
| 7 | Thêm hàng khi chưa đăng nhập rồi đăng nhập | Giỏ được gắn vào tài khoản; hàng trong giỏ được giữ |
| 8 | Thử mua nhiều hơn tồn kho | Bị từ chối; không tạo đơn hoặc bán vượt tồn |

Giỏ chưa có địa chỉ phải hiển thị “Tính sau khi nhập địa chỉ”; không được báo lỗi GHN khi chỉ thêm hàng.

## 4. Khách hàng — tài khoản và checkout

1. Đăng ký tài khoản thử, đăng xuất rồi đăng nhập lại. Kiểm tra tên, số điện thoại và địa chỉ trong tài khoản.
2. Thêm hai địa chỉ, chuyển địa chỉ mặc định. Chỉ một địa chỉ được mặc định; thử sửa và xóa địa chỉ.
3. Thêm sản phẩm còn hàng, vào checkout. Khi chưa đăng nhập, website đưa về trang đăng nhập và giữ giỏ.
4. Nhập họ tên, điện thoại, tỉnh/thành, phường/xã và số nhà; quận/huyện điền nếu có. Danh sách tỉnh/thành nằm trong ứng dụng, không cần dịch vụ vận chuyển.
5. Tiếp tục thanh toán. Phí theo khu vực phải xuất hiện sau khi có địa chỉ; đổi địa chỉ hoặc sản phẩm phải tính lại phí.
6. Chọn COD, đặt đơn thử. Tổng tiền trên đơn phải bằng tiền hàng cộng phí giao hàng. Tải lại trang xác nhận không tạo thêm đơn.
7. Vào lịch sử đơn, xem đơn vừa đặt. Hủy trước khi nghệ nhân nhận đơn: trạng thái phải đổi và lượng hàng giữ cho đơn được trả lại.
8. Thử chuyển khoản bằng một đơn thử riêng. Kiểm tra thông tin ngân hàng, số tiền, nội dung chuyển khoản và đồng hồ chờ.

**Lưu ý về chuyển khoản:** bản cũ có luồng mô phỏng tự xác nhận sau khoảng 15 giây; bản mới đang giữ hành vi này theo yêu cầu giữ chức năng. Đây không phải tích hợp đối soát giao dịch ngân hàng thật. Không cần chuyển tiền thật khi test.

Nếu sản phẩm thuộc nhiều nghệ nhân hoặc có món làm riêng, phí được chia theo kiện; kiểm tra tổng phí từng kiện khớp phí của đơn.

## 5. Nghệ nhân — gian hàng và sản phẩm

1. Mở trang đăng ký nghệ nhân, tạo gian hàng thử. Điền đủ hồ sơ, thông tin nhận tiền và địa chỉ lấy hàng, bắt buộc chọn tỉnh/thành phố.
2. Khi chưa được duyệt, gian hàng ở trạng thái chờ; chưa được bán sản phẩm.
3. Vào quản trị → Nghệ nhân, duyệt gian hàng thử. Đăng nhập lại kênh nghệ nhân.
4. Thêm sản phẩm tên dễ nhận biết, ví dụ `TEST - Túi len kiểm thử`. Thử hàng có sẵn với tồn kho nhỏ, rồi hàng làm theo đơn có số ngày làm.
5. Upload PNG/JPEG/WebP/GIF; ảnh phải hiển thị sau khi lưu và tải lại trang. File không phải ảnh hoặc vượt 20 MB phải bị từ chối.
6. Sửa giá, mô tả, ảnh và tồn kho. Trang sản phẩm phải phản ánh dữ liệu mới. Tồn kho không được thấp hơn lượng đang giữ cho đơn.
7. Chuyển sản phẩm về nháp: khách không mua được. Xóa sản phẩm thử trong kênh nghệ nhân: sản phẩm ngừng bán.
8. Quản trị khóa gian hàng thử: sản phẩm đang bán được ẩn. Mở khóa: các sản phẩm bị ẩn do khóa được khôi phục.

Không khóa gian hàng nhập từ dữ liệu nguồn chỉ để thử.

## 6. Đơn thường và yêu cầu làm riêng

### Đơn thường

- Khách đặt COD → nghệ nhân thấy đơn chờ nhận.
- Nghệ nhân nhận trong hạn → đơn sang đang làm.
- Nghệ nhân báo làm xong → đơn chờ giao.
- Nếu nghệ nhân từ chối trước khi nhận → đơn bị hủy, lượng hàng giữ được trả lại.
- Sau khi đã nhận làm, khách không được tự hủy như đơn chờ nhận.

### Làm riêng

1. Khách đăng nhập, mở sản phẩm rồi gửi mô tả, màu, kích thước và số lượng mong muốn.
2. Nghệ nhân thấy đúng yêu cầu trong kênh của mình; nghệ nhân khác không được xem/sửa yêu cầu đó.
3. Nghệ nhân chấp nhận, điền báo giá và số ngày làm; thử thêm nhánh từ chối.
4. Khách chấp nhận báo giá: món được đưa vào giỏ với đúng giá/số lượng đã chốt. Bấm lại không thêm trùng.
5. Đặt đơn làm riêng bằng chuyển khoản; đơn chia đúng nghệ nhân và giữ thông tin yêu cầu.

## 7. Quản trị — sản phẩm, đơn, hoàn tiền và đối soát

Chỉ thao tác với dữ liệu thử do bạn tạo.

| Mục | Kiểm tra |
| --- | --- |
| Sản phẩm | Xem danh sách; thêm cho gian hàng thử; sửa giá/tồn kho; nháp/đang bán |
| Khách hàng | Xem danh sách đúng dữ liệu; tài khoản khách không truy cập API quản trị được |
| Đơn hàng | Xem từng đơn và các đơn con; thử xác nhận/từ chối chuyển khoản trên đơn thử đang chờ |
| Đơn giao hàng | Nhập vận đơn thủ công cho đơn đã sẵn sàng; xác nhận giao; thử hủy đúng trạng thái |
| Hoàn tiền | Đơn chuyển khoản đã thanh toán bị hủy phải chờ hoàn; chỉ bấm “Đã hoàn tiền” khi đang test ghi nhận hoặc đã hoàn thực tế |
| Nghệ nhân | Duyệt, khóa/mở khóa gian hàng thử |
| Đối soát | Xem kỳ, phí sàn, tổng và tiền ròng; ghi nhận chuyển tiền bằng mã giao dịch thử chỉ trên kỳ QA |
| Cấu hình sàn | Kiểm tra dữ liệu ngân hàng và phần trăm phí; không sửa thông tin thật chỉ để thử |

Nút ghi nhận hoàn tiền/chuyển tiền chỉ cập nhật sổ ghi nhận; không thực hiện chuyển khoản ngân hàng.

**Ghi chú lịch sử (không còn nút tạo GHN trong checkout/quản trị mới): Không bấm “Tạo vận đơn GHN” nếu bạn chỉ muốn thử giao diện.** Khi cấu hình dùng GHN production, thao tác này có thể yêu cầu shipper lấy hàng thật. Kiểm thử tự động đã mô phỏng tạo/huỷ/retry/webhook; để nghiệm thu vận chuyển thật cần một đơn thử đã thống nhất địa chỉ và chi phí, hoặc tài khoản GHN sandbox.

## 8. Tác vụ tự động và email

Các đường dẫn đã có:

- `/api/jobs/timers`: hết hạn chuyển khoản, quá hạn nghệ nhân nhận đơn, hoàn thành đơn sau thời gian chờ.
- `/api/jobs/payouts`: tạo kỳ đối soát cho các đơn đủ điều kiện.
- `/api/jobs/notifications`: chuẩn bị/gửi thông báo tùy cấu hình email.

Các endpoint yêu cầu header `Authorization: Bearer <CRON_SECRET>`. Gọi không có secret phải trả 401. Không dán secret vào URL.

Bài tích hợp đã kiểm tra các mốc thời gian bằng dữ liệu giả, nên bạn không cần chờ 12 giờ hoặc 2 ngày. **Không gọi timer/payout thủ công trên database chứa đơn nhập chỉ để test**; chúng sẽ xử lý các đơn đủ điều kiện.

Vercel Hobby dùng dịch vụ gọi lịch bên ngoài theo lựa chọn của bạn. Việc gọi thật theo lịch sau deploy chưa được cấu hình/kiểm chứng trong đợt test local này. Email thực tế chưa test vì `EMAIL_DELIVERY_ENABLED=false`; việc xếp hàng và chống nhân đôi thông báo đã được kiểm tra.

## 9. Kiểm tra bản production trên máy

Dừng dev server bằng Ctrl+C trước khi chạy:

```sh
pnpm build:mongodb
pnpm start:mongodb
```

Giữ Terminal đó chạy. Mở Terminal thứ hai, vào cùng thư mục storefront rồi chạy:

```sh
pnpm test:smoke
```

Phải có `passed: true`, các trang chính HTTP 200, API quản trị/cron không đăng nhập trả 401, tìm kiếm có kết quả và sắp xếp đúng.

Build production hiện kiểm tra TypeScript; có thể chạy `pnpm typecheck` riêng để dễ đọc lỗi. Lint hiện vẫn theo cấu hình cũ và không được coi là đã vượt qua chỉ vì build thành công.

## 10. Khi báo lỗi

Ghi lại: URL, vai trò tài khoản, tên/mã dữ liệu thử, các bước vừa làm, kết quả mong muốn và kết quả thực tế. Có thể gửi ảnh và thông báo lỗi; che mật khẩu, URI, token, khóa S3 và thông tin cá nhân.

Chỉ chuyển production sau khi nghiệm thu bản Vercel preview, cấu hình biến môi trường trên Vercel, lịch bên ngoài, cùng snapshot cuối và cửa sổ ngừng ghi của PostgreSQL. Kiểm thử local thành công không thay thế các bước đó.
