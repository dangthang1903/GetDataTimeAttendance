# Phần Mềm Quản Lý Chấm Công LIMS (Bản Server - Docker)

Dự án này là một phần mềm Quản lý điểm danh từ máy chấm công vân tay (ZKTeco). Hệ thống được thiết kế dưới dạng **Web Application** chạy trên Server nội bộ, sử dụng cấu trúc Container hóa (Docker) với Backend là NestJS và Frontend là React + Vite.

---

## 🏗 Cấu Trúc Dự Án

Dự án được cấu trúc theo dạng Web Monorepo bao gồm:
- `/backend`: Mã nguồn Backend (NestJS, Node.js). Đảm nhiệm việc kết nối trực tiếp với máy chấm công ZKTeco thông qua TCP/IP, lấy và xử lý dữ liệu.
- `/frontend`: Mã nguồn Frontend (React, Vite, Tailwind CSS v4). Giao diện hiển thị thân thiện, bộ lọc nhanh (Client-side pagination).
- `Dockerfile`: Khối lệnh biên dịch Multi-stage tối ưu, tự động build Frontend và Backend, sau đó gộp chung thành một Web Server siêu nhẹ.
- `docker-compose.yml`: Cấu hình khởi động dịch vụ và mở cổng mạng.

---

## 👨‍💻 Hướng Dẫn Dành Cho Developer (Lập Trình Viên)

Nếu bạn vừa mới Pull code này về máy để tiếp tục phát triển, hãy làm theo tuần tự các bước dưới đây để chạy môi trường Dev.

### 1. Yêu Cầu Hệ Thống (Prerequisites)
- [Node.js](https://nodejs.org/) (Khuyến nghị bản **v18** hoặc **v20**).
- Git.

### 2. Cài Đặt Thư Viện (Install Dependencies)
Do cấu trúc chia làm 2 thư mục độc lập nên bạn cần cài đặt thư viện ở cả 3 nơi (Root, Backend, Frontend).
Hãy mở Terminal tại thư mục gốc của dự án và chạy lần lượt các lệnh sau:

```bash
# 1. Cài đặt các thư viện ở thư mục gốc (Concurrently, Typescript...)
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

### 3. Chạy Môi Trường Phát Triển (Dev Mode)
Trong quá trình viết code hoặc sửa giao diện, bạn cần chạy hệ thống ở môi trường Dev (tự động cập nhật code khi bạn lưu file).
Mở Terminal tại **thư mục gốc**, gõ:

```bash
npm run dev
```

Lệnh này sẽ dùng `concurrently` để chạy song song 2 luồng:
1. Backend khởi động tại: `http://localhost:3456`
2. Frontend khởi động tại: `http://localhost:5173` (bạn hãy mở link này trên trình duyệt để lập trình giao diện).

---

## 🚀 Hướng Dẫn Triển Khai Dành Cho Quản Trị Viên (End-User Setup)

Để cài đặt phần mềm này lên Server nội bộ của công ty (hoặc máy cá nhân) phục vụ cho nhiều người truy cập, bạn KHÔNG CẦN cài đặt Node.js hay tải bất kỳ file `.exe` nào. 

### Bước 1: Cài Đặt Môi Trường
Bạn chỉ cần cài đặt phần mềm **Docker Desktop** (nếu dùng Windows/Mac) hoặc cài **Docker Engine & Docker Compose** (nếu dùng Linux/Ubuntu).
- [Tải Docker Desktop tại đây](https://www.docker.com/products/docker-desktop/)

### Bước 2: Khởi Chạy Phần Mềm
Bạn copy toàn bộ thư mục mã nguồn này lên Server.
Mở Terminal (hoặc CMD/PowerShell) tại thư mục gốc của dự án và chạy đúng 1 lệnh duy nhất:

```bash
docker-compose up -d --build
```
*Lưu ý: Lệnh này sẽ tự động tải các thành phần cần thiết và khởi động phần mềm chạy ngầm (background) vĩnh viễn. Ngay cả khi khởi động lại Server, phần mềm vẫn tự động chạy.*

### Bước 3: Người Dùng Truy Cập
Sau khi lệnh chạy xong, phần mềm đã sẵn sàng. Bạn không cần làm gì thêm trên Server.
Để truy cập vào hệ thống chấm công, nhân viên chỉ cần mở trình duyệt Web (Chrome, Cốc Cốc, Edge...) trên bất kỳ máy tính nào trong cùng mạng LAN và truy cập vào địa chỉ IP của Server:

- Cú pháp: `http://<IP-CỦA-SERVER>:3456`
- Ví dụ: `http://192.168.1.100:3456`

---

## 💡 Lưu Ý Quan Trọng Về Mạng (Network)

Bản chất của Docker là tạo ra một môi trường bị cách ly (Isolation). Do đó:
- Phần mềm trong Docker **không thể thao tác can thiệp vào Card Mạng (Netsh)** của hệ điều hành gốc.
- **Tính năng Plug & Play (Cắm dây LAN trực tiếp đổi IP tự động) sẽ KHÔNG hoạt động**.
- **Cách kết nối đúng:** Cắm dây mạng từ máy chấm công vào Switch/Router của công ty (cùng mạng với Server). Hoặc nếu muốn cắm dây LAN trực tiếp từ máy chấm công vào thẳng cổng mạng của Server, bạn phải vào `ncpa.cpl` của Server để thiết lập địa chỉ IP tĩnh bằng tay sao cho cùng dải mạng với IP của máy chấm công.
- IP mặc định để test máy chấm công thường là `192.168.1.220`.
