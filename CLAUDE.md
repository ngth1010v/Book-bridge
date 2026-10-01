# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Mục tiêu dự án

Static web (host bằng GitHub Pages) trình bày và hiện thực hoá **giải pháp chuyển tiếp** giúp học sinh duy trì việc học khi sách giáo khoa (SGK) chưa được cung ứng đủ trong những tuần đầu năm học (do thống nhất/điều chỉnh hệ thống SGK).

### Bối cảnh bài toán

- Nguồn cung SGK chưa đáp ứng kịp tại một số địa phương, cơ sở giáo dục.
- Phụ huynh có xu hướng photocopy/sao chụp SGK: **vi phạm quyền tác giả** nếu không được chủ sở hữu cho phép.
- Cần giải pháp thông minh, hợp pháp, khả thi, chi phí thấp.

### Tiêu chí giải pháp phải đáp ứng

1. Học sinh tiếp cận được nội dung cần thiết, không gián đoạn chương trình.
2. Tuân thủ quy định về bản quyền và sở hữu trí tuệ.
3. Chi phí tối thiểu cho học sinh và phụ huynh.
4. Triển khai nhanh tại trường hoặc trên quy mô rộng hơn.
5. Tận dụng công nghệ, tài nguyên số, thư viện, cơ chế chia sẻ tài liệu.
6. Chỉ là giải pháp **tạm thời**, kết thúc khi sách chính thức được cung ứng đủ.

Mọi tính năng/nội dung thêm vào phải phục vụ ít nhất một tiêu chí trên. Không phục vụ tiêu chí nào thì không thêm.

## Nguyên tắc bản quyền (bắt buộc)

- **Không** lưu, nhúng, scan, chép lại nội dung SGK có bản quyền vào repo (text, hình, PDF, ảnh chụp trang).
- Chỉ **liên kết** tới nguồn chính thức/được phép (ví dụ: nền tảng SGK điện tử của nhà xuất bản, cổng của Bộ GD&ĐT, Sở GD&ĐT). Ghi rõ nguồn.
- Được phép: nội dung tự biên soạn, tóm tắt theo khung chương trình (mục tiêu bài học, danh mục bài), tài nguyên giấy phép mở (CC BY, CC BY-SA...) có ghi công đúng giấy phép.
- Khi không chắc một tài nguyên có được phép dùng hay không: không đưa vào, ghi chú lại để người dùng kiểm tra.
- Trích dẫn điều luật (Luật Sở hữu trí tuệ, các văn bản liên quan) phải chính xác. Không bịa số điều, số văn bản. Không chắc thì ghi "cần kiểm chứng".

## Tech stack

- HTML + CSS + JavaScript thuần. **Không** build step, **không** framework, **không** npm.
- Backend tùy chọn: `server.py` (Python stdlib + SQLite, không cần cài gì). Chỉ thêm dependency khi thật sự cần.
- Client chạy 2 chế độ, tự chọn khi tải trang (`makeStore()` trong `app.js`):
  - **api**: `GET api/health` trả `{ok: true}` thì dùng `/api/*`, dữ liệu lưu trong SQLite.
  - **local**: không có API (GitHub Pages) thì dữ liệu lưu `localStorage`, khởi tạo từ `seed.json`.
  - Hai chế độ có cùng interface `{ mode, state, add, update }`. Logic nghiệp vụ chỉ viết ở client (`logic.js`, `app.js`), server chỉ lưu và validate.
- Thêm field hoặc collection: sửa đồng thời `SCHEMA`/`STATUSES` trong `server.py`, `seed.json`, và `app.js`.
- Deploy: GitHub Pages từ nhánh `main`, thư mục gốc. Mọi đường dẫn phải là **đường dẫn tương đối** (site chạy dưới `/<repo-name>/`).

## Cấu trúc

- `index.html`: báo cáo giải pháp, một trang cuộn, chia chương theo mẫu báo cáo (danh mục, tóm tắt, chương 1-6, tài liệu tham khảo kiểu IEEE).
- `app.html` + `app.js`: web app cho 3 vai trò (nhà trường, phụ huynh/học sinh, NXB/phân phối). Điều hướng bằng hash: `#school/<id>/<tab>`, `#parent/<id>`, `#supplier/<id>/<tab>`, `#about` (trang giới thiệu).
- `logic.js`: hàm thuần tính thiếu/dư/đang về và gợi ý điều phối sách dư. Dùng chung cho browser và test.
- `styles.css`: style dùng chung, design token trong `:root` (có dark mode).
- `seed.json`: dữ liệu mẫu (tên trường, đơn vị là giả định).
- `classroom.jpg`: ảnh minh họa trong báo cáo, từ Wikimedia Commons (CC BY-SA 4.0), ghi công ngay dưới ảnh.
- `server.py`: phục vụ file tĩnh + API (`GET /api/state`, `POST /api/<coll>`, `PATCH /api/<coll>/<id>`). Chưa có auth.

## Phân quyền (chưa làm, dự kiến)

Demo hiện chỉ cho chọn vai trò, không có mật khẩu. Khi làm auth: nhà trường và NXB/phân phối cần tài khoản/mật khẩu. Phụ huynh/học sinh không cần tài khoản, nhưng chỉ xem được trạng thái sách của trường mình, không thấy số liệu chi tiết. Server phải lọc dữ liệu theo vai trò (hiện `/api/state` trả toàn bộ).

## Quy ước UI/UX

- Ngôn ngữ giao diện: **tiếng Việt**, có dấu đầy đủ, `<html lang="vi">`.
- Người dùng chính: phụ huynh, học sinh, giáo viên, cán bộ nhà trường. Viết đơn giản, dễ hiểu.
- Mobile-first: phần lớn phụ huynh dùng điện thoại. Chạy tốt ở màn hình 360px.
- Nhẹ, tải nhanh trên mạng yếu: tối ưu ảnh, hạn chế JS, không tải font/thư viện nặng không cần thiết.
- Có bản in được (`@media print`) cho nội dung hướng dẫn, để trường phát giấy cho gia đình không có thiết bị.
- Accessibility cơ bản: HTML semantic, `alt` cho ảnh, tương phản màu đủ, điều hướng được bằng bàn phím.

## Chạy local và test

```bash
run.bat                     # Windows: static mode + tự mở trình duyệt
run.bat backend-enable      # Windows: api mode + tự mở trình duyệt
python server.py            # http://localhost:8000, chế độ api (tạo data.db từ seed.json)
python -m http.server 8000  # chỉ file tĩnh, chế độ local, giống GitHub Pages
python test_server.py       # self-check API
node logic.test.js          # self-check logic điều phối
```

Reset dữ liệu server: xóa `data.db`. Để máy khác truy cập server: `BOOKBRIDGE_HOST=0.0.0.0` (chưa có auth, chỉ dùng trong mạng tin cậy).

## Quy tắc làm việc

- Giữ cấu trúc phẳng, ít file. Chỉ tách file khi thật sự cần.
- Không tạo file/thư mục "để dành cho sau".
- Commit message và comment code viết bằng tiếng Anh; nội dung hiển thị cho người dùng bằng tiếng Việt.
