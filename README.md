# Phần Mềm Quản Lý Chấm Công LIMS

Dự án này là một phần mềm Quản lý điểm danh từ máy chấm công vân tay (ZKTeco). Hệ thống được đóng gói dưới dạng Desktop App (chạy đa nền tảng) sử dụng công nghệ Electron, với Backend là NestJS và Frontend là React + Vite.

## Cấu Trúc Dự Án
Dự án được cấu trúc theo dạng Monorepo bao gồm:
- `/backend`: Mã nguồn Backend (NestJS, chạy ở port 3002). Đảm nhiệm việc kết nối trực tiếp với máy chấm công ZKTeco thông qua TCP/IP.
- `/frontend`: Mã nguồn Frontend (React, Vite, Tailwind CSS v4, chạy ở port 5173). Giao diện hiển thị, thiết kế tĩnh, bộ lọc nhanh (Client-side pagination).
- `electron-main.js`: File cấu hình khởi chạy phần mềm desktop (kết hợp cả backend và frontend vào chung 1 cửa sổ).
- `package.json` (root): Điều phối các lệnh chung (cài đặt, khởi chạy, build phần mềm).

---

## 🚀 Hướng Dẫn Cài Đặt Dành Cho Người Mới

Nếu bạn vừa mới Pull code này về máy, hãy làm theo tuần tự các bước dưới đây để có thể chạy được dự án.

### 1. Yêu Cầu Hệ Thống (Prerequisites)
- [Node.js](https://nodejs.org/) (Khuyến nghị bản **v18** hoặc **v20**).
- Git.

### 2. Cài Đặt Thư Viện (Install Dependencies)
Do cấu trúc chia làm 2 thư mục độc lập nên bạn cần cài đặt thư viện ở cả 3 nơi (Root, Backend, Frontend).
Hãy mở Terminal (hoặc Command Prompt) tại thư mục gốc của dự án và chạy lần lượt các lệnh sau:

```bash
# 1. Cài đặt các thư viện ở thư mục gốc (Electron, Concurrently...)
npm install

# 2. Cài đặt thư viện cho Backend
cd backend
npm install
cd ..

# 3. Cài đặt thư viện cho Frontend
cd frontend
npm install
cd ..
```

---

## 🛠 Hướng Dẫn Chạy Môi Trường Phát Triển (Dev Mode)

Trong quá trình viết code hoặc sửa giao diện, bạn cần chạy hệ thống ở môi trường Dev (tự động cập nhật code khi bạn lưu file).

Mở Terminal tại **thư mục gốc**, gõ:

```bash
npm run dev
```

Lệnh này sẽ dùng `concurrently` để chạy song song 2 luồng:
1. Backend khởi động tại: `http://localhost:3002`
2. Frontend khởi động tại: `http://localhost:5173` (bạn có thể bấm vào link này trên terminal để xem giao diện trên trình duyệt).

---

## 📦 Hướng Dẫn Đóng Gói Ra File Cài Đặt (.exe)

Khi bạn đã sửa code xong và muốn xuất ra thành 1 file cài đặt để gửi cho khách hàng (nhân sự) cài vào máy tính của họ:

Mở Terminal tại **thư mục gốc**, gõ:

```bash
npm run build:app
```

**Quá trình này diễn ra như sau:**
- Đầu tiên sẽ build thư mục `backend` sang code Javascript thuần (`/backend/dist`).
- Sau đó sẽ build thư mục `frontend` thành giao diện web tĩnh (`/frontend/dist`).
- Cuối cùng, thư viện `electron-builder` sẽ gom toàn bộ code ở trên, đưa vào môi trường Chromium (Electron) và nén lại thành 1 file cài đặt Setup (NSIS).

**Kết quả:**
- Sau khi chạy xong, hãy vào thư mục `release/` (nằm ở thư mục gốc).
- Bạn sẽ thấy file `.exe` ví dụ như: `Quản Lý Chấm Công Setup 0.0.1.exe`.
- Đây là file cuối cùng dùng để cài đặt (Double-click là tự cài và có Icon ngoài Desktop).

---

## 💡 Lưu Ý Quan Trọng Khác
- **Không bao giờ Commit thư mục `release/`, `dist/`, và `node_modules/`** lên Git. Chúng rất nặng (hàng trăm MB) và sẽ gây lỗi không thể Push code. File `.gitignore` hiện tại đã chặn các thư mục này.
- IP mặc định để test máy chấm công thường là `192.168.1.200`. Máy tính chạy phần mềm (hoặc Backend) phải **chung mạng LAN** với máy chấm công thì mới lấy được dữ liệu.
