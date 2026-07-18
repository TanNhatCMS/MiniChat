# MiniChat - Ứng dụng Chat Thời gian thực

Ứng dụng chat thời gian thực đầy đủ tính năng, xây dựng với **Node.js WebSocket server** và **Next.js client**. Hỗ trợ nhắn tin phát chung, nhắn tin riêng, chat nhóm, và bảng điều khiển quản trị để giám sát thời gian thực.

## Tính năng

### Server

- Giao tiếp thời gian thực qua WebSocket sử dụng thư viện `ws`
- Đăng ký và truy cập dựa trên tên người dùng
- Nhắn tin phát chung tới tất cả người dùng đang kết nối
- Nhắn tin riêng giữa hai người dùng
- Quản lý nhóm (tạo, tham gia, rời)
- Nhắn tin nhóm tới các thành viên trong nhóm
- Bảng điều khiển quản trị với thống kê thời gian thực
- Ghi log và giám sát hoạt động
- API REST cho thống kê (`/api/stats`)

### Client

- Ứng dụng Next.js 16 hiện đại
- Sử dụng WebSocket API gốc (không phụ thuộc Socket.IO)
- Giao diện tối, responsive với bố cục 3 panel
- Gửi/nhận tin nhắn thời gian thực
- Hiển thị trạng thái người dùng (trực tuyến/ngoại tuyến)
- Tạo và quản lý nhóm
- Nhắn tin riêng và phát chung
- Tự động kết nối lại khi mất kết nối
- Lọc tin nhắn theo ngữ cảnh chat đang hoạt động

## Kiến trúc

```text
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Next.js App   │ ◄─────────────────────────► │  Node.js Server │
│   (Port 3000)   │                             │   (Port 3001)   │
│                 │                             │                 │
│  ┌───────────┐  │                             │  ┌───────────┐  │
│  │  React UI │  │  JSON messages qua WS      │  │  ws lib   │  │
│  │  3-Panel  │  │  {type, payload}           │  │  HTTP srv  │  │
│  └───────────┘  │                             │  └───────────┘  │
└─────────────────┘                             └────────┬────────┘
                                                         │
                                                         │ HTTP + WS
                                                         ▼
                                                ┌─────────────────┐
                                                │  Bảng điều khiển │
                                                │  (Port 3001/)   │
                                                └─────────────────┘
```

## Yêu cầu

- **Node.js** v18 trở lên
- **npm** v9 trở lên

## Cài đặt

### Server

```bash
cd server
npm install
```

### Client

```bash
cd client
npm install
```

## Chạy ứng dụng

### Chạy với PM2 (khuyến nghị cho production)

```bash
# Cài đặt dependencies ở root
npm install

# Build cả server và client
npm run build

# Khởi động cả 2 ứng dụng
npm start

# Các lệnh quản lý khác
npm run stop        # Dừng tất cả
npm run restart     # Khởi động lại
npm run delete      # Xóa khỏi PM2
npm run logs        # Xem logs
npm run status      # Xem trạng thái
```

### Chạy thủ công (chế độ phát triển)

#### Khởi động Server

```bash
cd server
npm run dev
```

Server sẽ chạy trên cổng **3001** theo mặc định.

#### Khởi động Client

```bash
cd client
npm run dev
```

Client sẽ chạy trên cổng **3000** theo mặc định.

### Truy cập Bảng điều khiển

Mở trình duyệt tại: `http://localhost:3001/dashboard`

Bảng điều khiển cung cấp giám sát thời gian thực:

- Số lượng và danh sách người dùng trực tuyến
- Nhóm hoạt động với số thành viên
- Tổng tin nhắn, tin nhắn nhóm, tin nhắn riêng
- Thống kê kết nối
- Luồng nhật ký hoạt động

## Hướng dẫn sử dụng

1. **Đăng nhập**: Mở `http://localhost:3000` và nhập tên người dùng để tham gia
2. **Phát chung**: Gửi tin nhắn tới tất cả người dùng qua kênh Phát chung
3. **Nhắn tin riêng**: Nhấp vào người dùng trực tuyến ở thanh bên trái để bắt đầu cuộc trò chuyện riêng
4. **Tạo nhóm**: Nhấp "+ Tạo nhóm" ở thanh bên phải
5. **Tham gia nhóm**: Các nhóm có sẵn hiển thị ở thanh bên phải - nhấp để tham gia
6. **Rời nhóm**: Các nhóm đã tham gia hiển thị ở thanh bên phải - nhấp để rời
7. **Chuyển kênh**: Nhấp vào bất kỳ người dùng, nhóm, hoặc Phát chung ở thanh bên trái

## Giao thức WebSocket

### Tin nhắn Client → Server

| Type | Payload | Mô tả |
|------|---------|-------|
| `register` | `{username}` | Đăng ký người dùng mới |
| `broadcast-message` | `{message}` | Gửi tới tất cả người dùng |
| `private-message` | `{target, message}` | Gửi tới người dùng cụ thể |
| `group-message` | `{group, message}` | Gửi tới thành viên nhóm |
| `create-group` | `{name}` | Tạo nhóm mới |
| `join-group` | `{name}` | Tham gia nhóm |
| `leave-group` | `{name}` | Rời nhóm |
| `get-users` | `{}` | Yêu cầu danh sách người dùng trực tuyến |
| `get-groups` | `{}` | Yêu cầu danh sách tất cả nhóm |
| `get-my-groups` | `{}` | Yêu cầu danh sách nhóm của người dùng |
| `subscribe-dashboard` | `{}` | Đăng ký nhận cập nhật bảng điều khiển |

### Tin nhắn Server → Client

| Type | Payload | Mô tả |
|------|---------|-------|
| `register-response` | `{success, username, users, groups, myGroups}` | Kết quả đăng ký |
| `receive-message` | `{sender, message, type, group?, target?}` | Tin nhắn đến |
| `user-joined` | `{username}` | Người dùng mới kết nối |
| `user-left` | `{username}` | Người dùng ngắt kết nối |
| `groups-updated` | `{groups, myGroups}` | Danh sách nhóm thay đổi |
| `group-member-joined` | `{group, username}` | Người dùng tham gia nhóm |
| `group-member-left` | `{group, username}` | Người dùng rời nhóm |
| `error` | `{message}` | Thông báo lỗi |
| `stats-update` | `{onlineUsers, activeGroups, ...}` | Thống kê bảng điều khiển |
| `new-log` | `{timestamp, action, details}` | Nhật ký hoạt động mới |
| `logs-history` | `{logs[]}` | Lịch sử nhật ký hoạt động |

## Cấu hình

### Biến môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `3001` | Cổng server |
| `DASHBOARD_PASSWORD` | _(trống)_ | Mật khẩu bảo vệ bảng điều khiển & API thống kê. Nếu không đặt, bảng điều khiển mở tự do (chế độ dev). |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | URL WebSocket server cho client |

### Ví dụ

```bash
# Cổng server tùy chỉnh
PORT=8080 npm start
```

```bash
# Bảng điều khiển có mật khẩu
DASHBOARD_PASSWORD=admin123 npm start
# Truy cập: http://localhost:3001/dashboard → sẽ hiện trang đăng nhập
# API: curl http://localhost:3001/api/stats?password=admin123
# Hoặc qua Basic Auth: curl -u admin:admin123 http://localhost:3001/api/stats
```

```bash
# URL WebSocket tùy chỉnh cho client (trong .env.local)
NEXT_PUBLIC_WS_URL=ws://your-server:8080
```

## Kiểm thử

### Kiểm thử thủ công

1. Mở nhiều tab/cửa sổ trình duyệt tại `http://localhost:3000`
2. Đăng ký với các tên người dùng khác nhau ở mỗi tab
3. Thử nghiệm nhắn tin phát chung, riêng, và nhóm
4. Giám sát bảng điều khiển tại `http://localhost:3001/dashboard`

### Kiểm thử API

```bash
# Lấy thống kê server
curl http://localhost:3001/api/stats
```

### Kiểm thử WebSocket (sử dụng wscat)

```bash
# Cài đặt wscat
npm install -g wscat

# Kết nối tới server
wscat -c ws://localhost:3001
```

Sau khi kết nối, gửi tin nhắn dưới dạng JSON:

```json
{"type":"register","payload":{"username":"testuser"}}
```

```json
{"type":"broadcast-message","payload":{"message":"Xin chào mọi người!"}}
```

## Cấu trúc dự án

```text
MiniChat/
├── package.json            # Scripts PM2 quản lý
├── ecosystem.config.js     # Cấu hình PM2
├── server/
│   ├── package.json        # Dependencies của server
│   ├── server.ts           # WebSocket + HTTP server
│   └── dashboard.html      # Giao diện bảng điều khiển
├── client/
│   ├── package.json        # Dependencies của client
│   ├── next.config.ts      # Cấu hình Next.js
│   ├── jsconfig.json       # Path aliases
│   ├── app/
│   │   ├── layout.tsx      # Layout gốc
│   │   ├── page.tsx        # Component giao diện chat chính
│   │   └── globals.css     # Styles giao diện tối
│   └── lib/
│       └── socket.ts       # Helper WebSocket client
├── .gitignore
├── LICENSE
└── README.md
```

## Giấy phép

MIT
