# MiniChat - Ứng dụng Chat Thời gian thực

Ứng dụng chat thời gian thực đầy đủ tính năng, xây dựng dưới dạng **pnpm monorepo** với **NestJS + Socket.IO server** và **Next.js client**. Hỗ trợ nhắn tin phát chung, nhắn tin riêng, chat nhóm, và bảng điều khiển quản trị để giám sát thời gian thực.

## Tính năng

### Server (NestJS + Socket.IO)
- Giao tiếp thời gian thực qua Socket.IO
- Đăng ký và truy cập dựa trên tên người dùng
- Nhắn tin phát chung tới tất cả người dùng đang kết nối
- Nhắn tin riêng giữa hai người dùng
- Quản lý nhóm (tạo, tham gia, rời)
- Nhắn tin nhóm tới các thành viên trong nhóm
- Bảng điều khiển quản trị với thống kê thời gian thực
- Ghi log và giám sát hoạt động
- API REST cho thống kê (`/api/stats`)

### Client (Next.js + Socket.IO Client)
- Ứng dụng Next.js 16 hiện đại
- Sử dụng Socket.IO client
- Giao diện tối, responsive với bố cục 3 panel
- Gửi/nhận tin nhắn thời gian thực
- Hiển thị trạng thái người dùng (trực tuyến/ngoại tuyến)
- Tạo và quản lý nhóm
- Nhắn tin riêng và phát chung
- Tự động kết nối lại khi mất kết nối
- Lọc tin nhắn theo ngữ cảnh chat đang hoạt động
- Đếm tin nhắn chưa đọc

## Kiến trúc

```text
┌─────────────────┐        Socket.IO           ┌─────────────────┐
│   Next.js App   │ ◄─────────────────────────► │  NestJS Server  │
│   (Port 3000)   │                             │   (Port 3001)   │
│                 │                             │                 │
│  ┌───────────┐  │                             │  ┌───────────┐  │
│  │  React UI │  │  Events qua Socket.IO      │  │  Gateway  │  │
│  │  3-Panel  │  │  {event, payload}          │  │  Service  │  │
│  └───────────┘  │                             │  └───────────┘  │
└─────────────────┘                             └────────┬────────┘
                                                         │
                                                         │ HTTP + WS
                                                         ▼
                                                ┌─────────────────┐
                                                │ Bảng điều khiển  │
                                                │  (Port 3001/)   │
                                                └─────────────────┘
```

## Yêu cầu

- **Node.js** v18 trở lên
- **pnpm** v9 trở lên

## Cài đặt

```bash
# Clone và cài đặt tất cả dependencies
pnpm install
```

## Chạy ứng dụng

### Chế độ phát triển

```bash
# Chạy cả server và client song song
pnpm run dev

# Hoặc chạy riêng
pnpm run dev:server    # NestJS server (port 3001)
pnpm run dev:client    # Next.js client (port 3000)
```

### Chạy với PM2 (production)

```bash
# Build cả server và client
pnpm run build

# Khởi động qua PM2
pnpm start

# Các lệnh quản lý
pnpm run stop        # Dừng tất cả
pnpm run restart     # Khởi động lại
pnpm run delete      # Xóa khỏi PM2
pnpm run logs        # Xem logs
pnpm run status      # Xem trạng thái
```

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
3. **Nhắn tin riêng**: Nhấp vào người dùng trực tuyến ở thanh bên trái
4. **Tạo nhóm**: Nhấp "+ Tạo nhóm" ở thanh bên phải
5. **Tham gia nhóm**: Các nhóm có sẵn hiển thị ở thanh bên phải - nhấp để tham gia
6. **Rời nhóm**: Các nhóm đã tham gia hiển thị ở thanh bên phải - nhấp để rời
7. **Chuyển kênh**: Nhấp vào bất kỳ người dùng, nhóm, hoặc Phát chung ở thanh bên trái

## Scripts

| Script | Mô tả |
|--------|-------|
| `pnpm install` | Cài đặt tất cả dependencies |
| `pnpm run dev` | Chạy dev cả server và client |
| `pnpm run build` | Build cả 2 package |
| `pnpm run test` | Chạy test toàn bộ |
| `pnpm run lint` | Kiểm tra lỗi ESLint |
| `pnpm run lint:fix` | Tự động sửa lỗi ESLint |
| `pnpm run format` | Format code với Prettier |
| `pnpm run format:check` | Kiểm tra format |
| `pnpm run typecheck` | Kiểm tra TypeScript types |
| `pnpm start` | Khởi động production qua PM2 |
| `pnpm run stop` | Dừng PM2 |

## Giao thức Socket.IO

### Client → Server Events

| Event | Payload | Mô tả |
|-------|---------|-------|
| `register` | `{username}` | Đăng ký người dùng mới |
| `broadcast-message` | `{message}` | Gửi tới tất cả người dùng |
| `private-message` | `{target, message}` | Gửi tới người dùng cụ thể |
| `group-message` | `{group, message}` | Gửi tới thành viên nhóm |
| `create-group` | `{name}` | Tạo nhóm mới |
| `join-group` | `{name}` | Tham gia nhóm |
| `leave-group` | `{name}` | Rời nhóm |
| `subscribe-dashboard` | `{}` | Đăng ký nhận cập nhật bảng điều khiển |

### Server → Client Events

| Event | Payload | Mô tả |
|-------|---------|-------|
| `register-response` | `{success, username, users, groups, myGroups, groupMembers}` | Kết quả đăng ký |
| `receive-message` | `{sender, message, type, group?, target?}` | Tin nhắn đến |
| `user-joined` | `{username}` | Người dùng mới kết nối |
| `user-left` | `{username}` | Người dùng ngắt kết nối |
| `groups-updated` | `{groups, myGroups, groupMembers}` | Danh sách nhóm thay đổi |
| `group-member-joined` | `{group, username}` | Người dùng tham gia nhóm |
| `group-member-left` | `{group, username}` | Người dùng rời nhóm |
| `error` | `{message}` | Thông báo lỗi |
| `stats-update` | `{onlineUsers, activeGroups, ...}` | Thống kê bảng điều khiển |
| `new-log` | `{timestamp, action, details}` | Nhật ký hoạt động mới |

## Cấu hình

### Biến môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `3001` | Cổng server |
| `DASHBOARD_PASSWORD` | _(trống)_ | Mật khẩu bảo vệ bảng điều khiển. Nếu không đặt, bảng điều khiển mở tự do. |
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:3001` | URL server cho client |

### Ví dụ

```bash
# Bảng điều khiển có mật khẩu
DASHBOARD_PASSWORD=admin123 pnpm start
# Truy cập: http://localhost:3001/dashboard → sẽ hiện trang đăng nhập
# API: curl http://localhost:3001/api/stats?password=admin123
```

## Kiểm thử

```bash
# Chạy tất cả test
pnpm run test

# Chạy test riêng từng package
pnpm run test:server      # 116 tests (unit + integration)
pnpm run test:client      # 78 tests (unit + component)
```

### Kiểm thử thủ công

1. Mở nhiều tab/cửa sổ trình duyệt tại `http://localhost:3000`
2. Đăng ký với các tên người dùng khác nhau ở mỗi tab
3. Thử nghiệm nhắn tin phát chung, riêng, và nhóm
4. Giám sát bảng điều khiển tại `http://localhost:3001/dashboard`

## Cấu trúc dự án

```text
MiniChat/                        # pnpm monorepo
├── package.json                 # Root scripts (PM2, lint, format, test)
├── pnpm-workspace.yaml          # Workspace packages
├── ecosystem.config.js          # Cấu hình PM2
├── eslint.config.js             # ESLint (flat config)
├── .prettierrc                  # Prettier (LF, single quote)
├── .editorconfig                # Editor config (LF, UTF-8)
├── .gitattributes               # Git line endings (LF)
├── server/                      # NestJS + Socket.IO server
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── main.ts              # Entry point
│       ├── app.module.ts        # Root module
│       ├── api/                 # REST API (stats, dashboard)
│       ├── chat/                # Chat gateway + service
│       ├── filters/             # Exception filters
│       ├── shared/              # Shared stores
│       └── tests/               # Integration tests
├── client/                      # Next.js + Socket.IO client
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Giao diện chat chính
│   │   └── globals.css          # Styles giao diện tối
│   ├── lib/
│   │   ├── socket.ts            # Socket.IO client helper
│   │   └── types.ts             # Type definitions
│   └── tests/                   # Unit + component tests
└── README.md
```

## Giấy phép

MIT
