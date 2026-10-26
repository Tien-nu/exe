# Yarnly — Next.js + MongoDB Atlas

Mã chuẩn: `Yarnly_deploy/dtc-starter`. Runtime mới nằm trong `apps/storefront/src/server` và các route Next.js `/api/backend`, `/api/jobs`. Không cần chạy Medusa/Render khi bật chế độ MongoDB.

- [Hướng dẫn tự kiểm thử](HUONG-DAN-KIEM-THU.md)
- [Kết quả kiểm thử ngày 25/10/2026](VALIDATION.md)
- `backend-inventory.json`: inventory route/SDK ban đầu; các cờ migration trong file này chưa đại diện cho nghiệm thu từng route.
- `source-schema.json`: schema nguồn, không chứa dữ liệu khách hàng.

## Chế độ chạy

Trong `apps/storefront`:

```sh
pnpm dev:mongodb
```

Production local:

```sh
pnpm build:mongodb
pnpm start:mongodb
```

Các lệnh MongoDB bật `MONGODB_API_PREVIEW=true` và `NEXT_PUBLIC_YARNLY_BACKEND_MODE=mongodb`. Chế độ mặc định vẫn giữ backend cũ cho tới khi chốt cutover. Không tắt Render chỉ vì local đã chạy được.

SSR dùng cùng handler đã kiểm tra auth trong tiến trình Next.js; không gọi vòng qua HTTP tới domain Vercel của chính nó. Browser dùng `/api/backend`. Giao diện quản trị mới ở `/vn/quan-tri`, artisan portal và trang khách giữ các đường dẫn cũ.

## Dữ liệu

Đã export PostgreSQL bằng transaction read-only repeatable-read, nhập 8.450 dòng archive vào Atlas staging và chuẩn hóa 19 collection runtime, gồm 13 sản phẩm, 92 đơn gốc, 94 đơn con, 94 customer và 100 auth identity. Đã đối chiếu ID, password hash/actor, tổng tiền và tồn kho/reservation.

Snapshot chứa dữ liệu cá nhân và hash mật khẩu, lưu riêng ngoài Git với quyền 0600. Không commit snapshot hoặc `.env.local`.

Công cụ:

```sh
node --env-file=.env.local scripts/export-postgres.mjs /private/tmp/yarnly-migration-snapshots/final.snapshot.jsonl
node scripts/verify-snapshot.mjs /private/tmp/yarnly-migration-snapshots/final.snapshot.jsonl
node --env-file=.env.local scripts/import-snapshot.mjs /private/tmp/yarnly-migration-snapshots/final.snapshot.jsonl
node --env-file=.env.local scripts/verify-migration.mjs /private/tmp/yarnly-migration-snapshots/final.snapshot.jsonl
```

Import mặc định dry-run; `--apply` chỉ được dùng với staging và các điều kiện bảo vệ trong script. Không nhập snapshot khác đè lên dữ liệu đang chạy. Lệnh export cần `SOURCE_DATABASE_URL` đặt riêng trong môi trường; không đưa URI vào command history.

## Trước production

1. Nghiệm thu theo hướng dẫn test và bản Vercel preview.
2. Cấu hình MongoDB, AUTH_SECRET, GHN, S3 và URL storefront trên Vercel; giữ secret ở môi trường server.
3. Hoàn thiện tỉnh/thành phố lấy hàng của các shop cũ còn thiếu. Checkout dùng phí 18.000₫ nội tỉnh / 22.000₫ ngoại tỉnh mỗi kiện, không cần GHN. Vận đơn được nhập thủ công theo đơn vị bạn chọn.
4. Cấu hình dịch vụ lịch bên ngoài cho Vercel Hobby: timer mỗi phút, đối soát theo lịch nghiệp vụ, worker thông báo. Có Authorization header và kiểm chứng chạy thực tế.
5. Email đang tắt theo yêu cầu; bật SMTP sau khi cấu hình và test gửi thật.
6. Luồng chuyển khoản hiện giữ mô phỏng tự xác nhận của bản cũ, chưa đối soát ngân hàng thật.
7. Chốt ngừng ghi PostgreSQL, snapshot cuối, import/reconcile và phương án xử lý dữ liệu phát sinh khi rollback rồi mới chuyển website thật.

Chưa deploy hoặc cutover production trong đợt kiểm thử này.
