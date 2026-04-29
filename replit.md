# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/discord-bot run start` — run Discord bot

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Discord Bot (`discord-bot/`)

Slash commands (registered per-guild on ready):

- `/panel` — gửi embed có nút **🎫 Ticker** mở modal hỗ trợ (Tiêu đề, Nội dung, Ảnh URL); tạo kênh riêng `ticker-{user}-{HHhMM-DD-MM-YYYY}` trong category `Ticker-user` (dưới `DANH MỤC TLE`); ping user + admin roles; DM cho creator; nút 🔒 đóng có xác nhận, xóa kênh sau 5s.
- `/rent-panel` — gửi embed **THE LIFE EVER - Create Rent Ticket** với 3 nút: 📝 Hướng dẫn (ephemeral), 🙋 Thuê Player (tạo kênh `rent-{user}-{ts}` trong category `Rent-Player` với 3 dropdown: mã PlayerDuo / tựa game / giờ thuê + nút 🔒 Đóng vé), 👮 Khiếu nại ADmin (mở modal ticker hỗ trợ chuẩn). Khi đóng vé thuê: ghi log vào kênh đầu tiên tìm thấy theo tên `rent-log` / `ticket-log` / `logs` / `log` rồi xóa kênh sau 5s.
- `/playerduo` (admin only) — tham số: `kenh` (channel picker), `so` (mã, vd `09` → `#09`), `user` (user picker). Mở modal nhập **Thông tin chi tiết** + **Ảnh URL**, sau đó gửi embed (mention user + nội dung + ảnh) đến kênh đã chọn và lưu vào `discord-bot/data/playerduo.json`. Dropdown trong vé Thuê Player được lấy từ file này (Discord modal không hỗ trợ dropdown/channel/user picker bên trong, nên các trường picker đặt ở tham số slash).

Storage: `discord-bot/src/playerduo-store.ts` đọc/ghi JSON cache cho danh sách PlayerDuo.

Intents: chỉ `Guilds`. Cần quyền **Manage Channels** + **Manage Roles** + **Send Messages** + **Embed Links** trong server.

Secret: `DISCORD_BOT_TOKEN` (Bot Token, không phải Client Secret).
