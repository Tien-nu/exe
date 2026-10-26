import assert from "node:assert/strict"
import { database } from "../src/server/mongodb.ts"
import { artisanProducts } from "../src/server/artisan-products.ts"

assert.ok(process.env.MONGODB_DB?.endsWith("_staging"), "Only the local staging database is allowed")
const db = await database()
const id = "art_yarnly_order_test", handle = "yarnly-dat-hang-thu"
try {
  const sources = await db.collection("products").find({ status: "published", deleted_at: null, artisan_id: { $ne: id }, thumbnail: { $regex: "^https://" } }).limit(3).toArray()
  assert.equal(sources.length, 3, "Need three existing catalog images")
  const now = new Date()
  await db.collection("artisans").updateOne({ id }, { $setOnInsert: { id, handle, shop_name: "Yarnly – Đặt hàng thử", full_name: "Yarnly kiểm thử", email: "order-test@example.test", phone: "0000000000", status: "active", pickup_province_name: "Hà Nội", pickup_address: "Gian hàng kiểm thử, không phải địa chỉ gửi hàng thực tế", description: "Gian hàng dành riêng để thử đặt đơn trên website. Tỉnh lấy hàng dùng cho kiểm thử: Hà Nội. Sản phẩm và hình ảnh tham chiếu từ danh mục hiện có; không giao hàng thực tế. Vui lòng chọn thanh toán COD khi kiểm thử.", created_at: now, updated_at: now, test_fixture: true } }, { upsert: true })
  const artisan = await db.collection("artisans").findOne({ id })
  const results = []
  for (const [index, source] of sources.entries()) {
    const title = `[Đặt hàng thử] ${source.title}`
    let product = await db.collection("products").findOne({ artisan_id: id, title, deleted_at: null })
    if (!product) {
      const price = [85000, 120000, 150000][index]
      const description = `SẢN PHẨM KIỂM THỬ – KHÔNG GIAO HÀNG THỰC TẾ\n\nTên sản phẩm tham chiếu: ${source.title}.\n${source.description || "Sản phẩm len thủ công trong danh mục Yarnly."}\n\nThông tin đặt thử:\n- Phân loại: Tiêu chuẩn.\n- Giá niêm yết: ${price.toLocaleString("vi-VN")} đồng / sản phẩm.\n- Tồn kho kiểm thử ban đầu: 50 sản phẩm.\n- Hình thức: hàng có sẵn.\n- Quy cách đặt thử: 1 sản phẩm / đơn vị số lượng.\n- Tỉnh lấy hàng cho bài kiểm thử: Hà Nội.\n- Phí giao hàng: 18.000 đồng nội tỉnh, 22.000 đồng ngoại tỉnh cho mỗi kiện.\n- Chọn COD để kiểm tra luồng đặt đơn; không chuyển khoản thật.\n- Hình ảnh sử dụng lại từ sản phẩm tham chiếu hiện có, không đại diện hàng được giao.\n\nBạn có thể thay đổi số lượng, kiểm tra tổng tiền và xem đơn sau khi đặt. Đây là dữ liệu kiểm thử theo yêu cầu của chủ website.`
      const result = await artisanProducts(new Request("http://local/artisan/products", { method: "POST", body: JSON.stringify({ title, description, fulfillment_type: "ready", price, stock: 50, status: "published", images: [...new Set([source.thumbnail, ...(source.images ?? []).map((image) => image.url)].filter(Boolean))], category_ids: (source.categories ?? []).map((category) => category.id) }) }), ["artisan", "products"], artisan)
      product = await db.collection("products").findOne({ id: result.product.id })
      await db.collection("products").updateOne({ id: product.id }, { $set: { "metadata.test_fixture": true, "metadata.reference_product_id": source.id } })
    }
    const stock = await db.collection("inventory").findOne({ variant_id: product.variants[0].id })
    assert.ok(stock.stock > 0 && product.description && product.images.length && product.status === "published")
    results.push({ title: product.title, path: `/vn/products/${product.handle}`, stock: stock.stock })
  }
  console.log(JSON.stringify({ shop: `/vn/nghe-nhan/${handle}`, products: results }, null, 2))
} finally {
  await globalThis.yarnlyMongo?.then((client) => client.close())
}
