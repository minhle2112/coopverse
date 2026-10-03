# Coopverse

**Văn phòng 3D kiểu game cho các agent AI chạy trên [Paperclip](https://github.com/paperclipai/paperclip).**
Bạn đi lại trong văn phòng, thấy agent ngồi gõ phím khi đang làm việc, đi pha cà phê khi rảnh, ôm đầu khi lỗi. Đến bàn agent bấm **E** để chat bằng tiếng Việt hoặc xem màn hình CLI của nó chạy trực tiếp.

[English](README.en.md)

![Văn phòng Coopverse](docs/images/office.png)

- **Agent thật, cập nhật tức thì**: đọc agent, ticket, lượt chạy từ Paperclip qua WebSocket. Mỗi công ty trên Paperclip là một văn phòng riêng.
- **Chat với từng agent** (Agent Chat của Paperclip) ngay tại bàn của nó.
- **Xem CLI trực tiếp**: log lượt chạy hiện như Claude Code. Có nút Đánh thức / Tạm dừng / Tiếp tục / Comment, nút nào cũng hỏi xác nhận trước.
- **Bảng ticket kanban** trên tường, tủ đồ đổi ngoại hình, ngày/đêm theo giờ Việt Nam, nhạc lofi tự sinh.
- **Nút "Coopverse" ngay trong Paperclip** (plugin kèm theo): bấm là mở văn phòng của công ty đang xem.
- Toàn bộ hình khối và âm thanh dựng bằng code, không tải asset nào.

| Chat với agent | Màn hình CLI của agent |
|---|---|
| ![Chat](docs/images/chat.png) | ![CLI](docs/images/cli-log.png) |
| **Bảng ticket** | **Tủ đồ** |
| ![Kanban](docs/images/kanban.png) | ![Tủ đồ](docs/images/wardrobe.png) |

---

## Mục lục

1. [Cần chuẩn bị](#1-cần-chuẩn-bị)
2. [Cài Paperclip](#2-cài-paperclip)
3. [Tạo công ty, agent và bật Agent Chat](#3-tạo-công-ty-agent-và-bật-agent-chat)
4. [Cài Coopverse](#4-cài-coopverse)
5. [Cài nút Coopverse vào Paperclip](#5-cài-nút-coopverse-vào-paperclip)
6. [Cách dùng](#6-cách-dùng)
7. [Cấu hình](#7-cấu-hình)
8. [Xử lý sự cố](#8-xử-lý-sự-cố)
9. [Bảo mật](#9-bảo-mật)
10. [Dành cho người phát triển](#10-dành-cho-người-phát-triển)

---

## 1. Cần chuẩn bị

| Cần gì | Ghi chú |
|---|---|
| **Node.js 24.11 trở lên** | Paperclip yêu cầu bản này. Coopverse chạy được với Node 22.12+. Tải ở [nodejs.org](https://nodejs.org). |
| **Git** | Để tải mã nguồn. |
| **Chrome hoặc Edge** | Cần WebGL. Máy yếu thì chọn Đồ hoạ "Nhẹ" trong Cài đặt. |
| **Tài khoản cho agent** | Agent của Paperclip chạy bằng Claude Code, Codex, Gemini… Ví dụ với Claude Code: cài `claude` và đăng nhập trước. |
| **Windows** | Nên chạy Paperclip trong **WSL2** (Ubuntu), còn Coopverse chạy trên Windows. Đây là cách đã thử kỹ nhất. |

Coopverse đã thử với Paperclip **2026.916.1**.

## 2. Cài Paperclip

Chạy trong terminal (Windows thì chạy trong WSL):

```bash
npx paperclipai@latest onboard --yes
```

Lệnh này tạo cấu hình, cơ sở dữ liệu (PostgreSQL nhúng, không phải cài gì thêm) và bật Paperclip ở **http://localhost:3100**. Mở địa chỉ đó trong trình duyệt để kiểm tra.

Muốn có lệnh `paperclipai` dùng lâu dài (khuyên dùng):

```bash
npx paperclipai@latest install --yes
```

Từ lần sau, bật Paperclip bằng:

```bash
paperclipai run
```

> Xem thêm hướng dẫn gốc của Paperclip: <https://github.com/paperclipai/paperclip>

## 3. Tạo công ty, agent và bật Agent Chat

1. Mở http://localhost:3100. Lần đầu Paperclip hướng dẫn tạo **công ty** đầu tiên.
2. Vào **Agents** để thêm agent (tên, vai trò, adapter như Claude Code).
   - Coopverse xếp chỗ ngồi theo sơ đồ tổ chức. Agent nào có người **báo cáo cho mình** (trường *Reports to*) là **Lead**, ngồi phòng kính. Các agent còn lại ngồi open space theo nhóm của Lead.
   - Mỗi văn phòng có tối đa 26 bàn (2 Lead và 24 thành viên).
3. **Bật Agent Chat** để chat được trong Coopverse: **Settings → Experimental → Agent Chat** (bật công tắc). Tính năng này bật cho cả Paperclip, không phải bật riêng từng công ty.

![Bật Agent Chat](docs/images/paperclip-agent-chat.png)

## 4. Cài Coopverse

Chạy trên máy bạn dùng trình duyệt (Windows: chạy trong PowerShell hoặc Git Bash, **không** chạy trong WSL):

```bash
git clone https://github.com/minhle2112/coopverse.git
cd coopverse
npm install
npm run dev
```

Mở **http://127.0.0.1:5177**. Coopverse tự tìm Paperclip ở `127.0.0.1:3100` và mở công ty đầu tiên.

**Trên Windows** có sẵn `start-coopverse.cmd`, chỉ cần bấm đúp. Script này:

1. Kiểm tra Paperclip đã chạy chưa.
2. Chưa chạy thì tự bật trong một cửa sổ thu nhỏ tên "Paperclip". Có hai cách:
   - Paperclip trong WSL: thêm `PAPERCLIP_WSL_DISTRO=Ubuntu` (tên bản WSL của bạn, xem bằng `wsl -l`) vào file `.env`.
   - Paperclip cài thẳng trên Windows: script tự dùng lệnh `paperclipai` nếu tìm thấy.
3. Cài thư viện lần đầu, bật Coopverse và mở trình duyệt.

Muốn xem thử trước khi có Paperclip: mở **http://127.0.0.1:5177/?demo** để dùng dữ liệu giả.

## 5. Cài nút Coopverse vào Paperclip

Thư mục [`paperclip-plugin/`](paperclip-plugin) là một plugin Paperclip. Nó thêm mục **Coopverse ↗** vào thanh bên trái và nút **Coopverse** ở góc trên phải mọi trang. Bấm vào là mở Coopverse đúng công ty bạn đang xem, luôn dùng chung một tab.

![Nút Coopverse trong Paperclip](docs/images/paperclip-button.png)

Plugin đã được build sẵn trong `paperclip-plugin/dist`, không cần build lại. Chạy lệnh cài **trên máy đang chạy Paperclip**:

```bash
paperclipai plugin install --local /đường/dẫn/tới/coopverse/paperclip-plugin
```

(Chưa có lệnh `paperclipai` thì thay bằng `npx paperclipai@latest plugin install --local …`.)

Đường dẫn phải là đường dẫn mà Paperclip thấy được:

- **Linux / macOS**: ví dụ `~/coopverse/paperclip-plugin`.
- **Windows + WSL**: ổ C nằm ở `/mnt/c/`, ví dụ `/mnt/c/Users/ban/coopverse/paperclip-plugin`. Nếu WSL đã tắt truy cập ổ Windows, chép thư mục vào trong WSL trước rồi cài từ đó:

  ```bash
  mkdir -p ~/paperclip-plugins
  cp -r /mnt/c/Users/ban/coopverse/paperclip-plugin ~/paperclip-plugins/coopverse
  paperclipai plugin install --local ~/paperclip-plugins/coopverse
  ```

Cài xong, tải lại trang Paperclip là thấy nút. Kiểm tra trong **Settings → Plugins**: dòng Coopverse phải có chữ `ready`.

![Plugin đã cài](docs/images/paperclip-plugins.png)

**Coopverse chạy ở địa chỉ khác** `http://127.0.0.1:5177` (máy khác, cổng khác): vào **Settings → Plugins → Coopverse → Configure**, sửa **Coopverse URL** rồi bấm **Save Configuration**.

![Cấu hình plugin](docs/images/paperclip-plugin-settings.png)

Các lệnh khác:

```bash
paperclipai plugin list                          # xem plugin đã cài
paperclipai plugin disable coopverse.launcher    # tạm ẩn nút
paperclipai plugin enable coopverse.launcher     # bật lại
paperclipai plugin uninstall coopverse.launcher  # gỡ hẳn
```

Cập nhật plugin sau khi `git pull`: gỡ (`uninstall`) rồi cài lại bằng lệnh `install` ở trên.

## 6. Cách dùng

### Điều khiển

| Phím | Việc |
|---|---|
| Bấm chuột vào màn hình | Khoá chuột để xoay camera (hoặc giữ chuột trái và kéo) |
| W A S D / mũi tên | Đi |
| Shift | Chạy |
| Lăn chuột | Camera gần/xa |
| **E** | Đứng gần agent: mở màn hình của agent (tab **Chat** và **Log**). Đứng trước bảng ticket: xem bảng to. Bấm lại E để quay ra |
| C | Tủ đồ: đổi ngoại hình của bạn, hoặc của agent đang đứng gần |
| M | Bật/tắt nhạc lofi |
| Esc | Nhả chuột. Đang mở màn hình nào thì đóng màn hình đó |
| Bấm tên trong bảng "Nhân sự" | Đánh dấu agent trên minimap |
| Nút 🔊 🎵 🎨 ⚙️ dưới logo | Âm thanh, nhạc, tủ đồ, cài đặt (âm lượng, đồ hoạ, xem thử giờ) |

### Chat với agent

![Chat](docs/images/chat.png)

- Đến bàn agent, bấm **E**, chọn tab **Chat**. Gõ tiếng Việt rồi **Enter** (Shift+Enter để xuống dòng).
- **Mỗi tin nhắn đánh thức agent chạy một lượt để trả lời**: mất khoảng 20 giây đến vài phút và tốn hạn mức của agent (ví dụ hạn mức Claude). Lần đầu Coopverse hỏi xác nhận.
- Trong lúc agent trả lời, tab **Log** cho thấy nó đang làm gì.
- Gõ `/new` hoặc bấm **Phiên mới** để agent bắt đầu phiên mới, quên ngữ cảnh cũ. Lịch sử chat vẫn giữ.
- Agent gửi câu hỏi hoặc thẻ duyệt kế hoạch thì Coopverse hiện thẻ đó. Phần trả lời thẻ làm trong Paperclip (nút "Trả lời trong Paperclip").
- Bạn đang ở chỗ khác mà agent trả lời xong: có thông báo, và agent nói câu đầu của câu trả lời trong bong bóng.
- Cuộc trò chuyện lưu trong Paperclip, mở trên web Paperclip cũng thấy.

### Màn hình CLI (tab Log)

![CLI](docs/images/cli-log.png)

- Hiện lượt chạy đang chạy, hoặc lượt chạy gần nhất nếu agent rảnh, theo kiểu Claude Code: suy nghĩ, lệnh dùng công cụ, kết quả, lỗi, chi phí.
- Nút theo trạng thái agent: **Đánh thức**, **Tạm dừng**, **Tiếp tục**, **Comment** vào ticket. Lệnh nào cũng có hộp xác nhận.

### Bảng ticket

Bảng kanban treo trên tường. Đứng trước bảng bấm **E** để xem to, bấm vào ticket để mở trong Paperclip.

### Nhiều công ty

Mỗi công ty trên Paperclip là một văn phòng. Có nhiều công ty thì dưới logo Coopverse có ô chọn để đổi. Coopverse nhớ công ty bạn xem lần trước. Mở thẳng một công ty: `http://127.0.0.1:5177/?company=<id công ty>`, đây cũng là cách nút trong Paperclip mở Coopverse.

### Ngày và đêm

Trời sáng tối theo giờ Việt Nam. Ban đêm đèn trong phòng bật sáng. Xem thử giờ khác bằng thanh kéo trong Cài đặt, hoặc thêm `?hour=21.5` vào địa chỉ.

![Ban đêm](docs/images/office-night.png)

## 7. Cấu hình

Chép `.env.example` thành `.env` rồi sửa (không bắt buộc):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_PAPERCLIP_URL` | `http://127.0.0.1:3100` | Địa chỉ Paperclip |
| `VITE_COMPANY_ID` | (trống) | Công ty mở mặc định khi chưa chọn lần nào |
| `PAPERCLIP_WSL_DISTRO` | (trống) | Chỉ dùng cho `start-coopverse.cmd`: tên bản WSL đang chạy Paperclip |

Cài đặt trong app (âm lượng, đồ hoạ…) và ngoại hình nhân vật lưu trên trình duyệt, không đổi gì bên Paperclip.

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| "Chưa kết nối được Paperclip" | Bật Paperclip (`paperclipai run`) rồi đợi, Coopverse tự kết nối lại. Paperclip ở địa chỉ khác thì sửa `VITE_PAPERCLIP_URL` trong `.env` rồi chạy lại `npm run dev`. |
| Tab Chat báo "Agent Chat đang tắt" | Bật **Settings → Experimental → Agent Chat** trong Paperclip. |
| Gửi tin xong agent không trả lời | Agent có thể đang tạm dừng, lỗi hoặc hết hạn mức. Xem tab Log hoặc trang agent trong Paperclip. |
| Không thấy nút Coopverse trong Paperclip | Tải lại trang. Kiểm tra `paperclipai plugin list` có `coopverse.launcher … ready`. Không có thì xem lại bước 5. |
| Bấm nút Coopverse ra trang lỗi | Coopverse chưa chạy (`npm run dev` hoặc `start-coopverse.cmd`), hoặc **Coopverse URL** trong cấu hình plugin sai. |
| `plugin install` báo "path does not exist" | Đường dẫn không tồn tại trên máy chạy Paperclip. Với WSL, chép thư mục plugin vào trong WSL như hướng dẫn ở bước 5. |
| Văn phòng chạy chậm | Cài đặt (⚙️) → Đồ hoạ **Nhẹ**. |
| Không thấy agent nào | Công ty chưa có agent, hoặc đang xem nhầm công ty. Đổi ở ô chọn dưới logo. |

## 9. Bảo mật

- Coopverse chỉ nghe ở `127.0.0.1`, máy khác trong mạng không mở được.
- Trình duyệt không gọi thẳng Paperclip. Mọi lời gọi đi qua proxy của Coopverse, có **danh sách cho phép** (`vite.config.ts`): chỉ đọc agent, ticket, lượt chạy, log, Agent Chat và vài lệnh (Đánh thức / Tạm dừng / Tiếp tục / Comment / gửi tin chat). Lệnh ghi phải đến từ chính trang Coopverse (kiểm `Origin` và header `x-coopverse`). Endpoint khác bị trả 403.
- Lệnh nào gửi tới agent cũng có hộp xác nhận.
- Plugin chỉ thêm một đường link, không đọc hay ghi dữ liệu nào của Paperclip.

## 10. Dành cho người phát triển

```
src/
  data/        kiểu dữ liệu, adapter Paperclip (paperclip.ts), đồng bộ realtime, chat, đọc + parse log, dữ liệu demo
  world/       sơ đồ văn phòng, va chạm, nội thất, màn hình máy tính, bảng kanban 3D, ngày/đêm, gộp mesh tĩnh
  audio/       âm thanh tự tổng hợp: hiệu ứng theo vị trí, nhạc lofi tự sinh (voice.ts: mic/giọng đọc, đang tắt)
  characters/  nhân vật khối chibi + animation
  agents/      hành vi agent (ngồi làm, đi dạo, ghé bàn, né người, nét mặt)
  life/        đời sống văn phòng: lời thoại, hội thoại, chào hỏi, biểu cảm
  player/      di chuyển, camera, điều khiển
  ui/          HUD, minimap, CLI + Chat (Terminal), bảng ticket, tủ đồ, cài đặt
  dev/         hook chỉ dùng khi dev (window.__coop)
paperclip-plugin/
  src/         manifest, worker, UI (nút ở thanh bên + thanh trên cùng)
  dist/        bản đã build (commit sẵn)
```

- Stack: Vite, React 19, React Three Fiber, drei, three.js, zustand, TypeScript.
- Mọi lời gọi tới Paperclip nằm trong `src/data/paperclip.ts`. Paperclip đổi API thì chỉ sửa ở đó.
- Kiểm tra kiểu và build: `npm run build`.
- Sửa plugin: `cd paperclip-plugin && npm install && npm run build`, rồi cài lại plugin.
- Khi dev có `window.__coop`: `store.getState().openFocus(agentId)` mở màn hình một agent, `inject(...)` bơm sự kiện realtime giả, `stats()` đo draw call, `settings.getState().set({ hour: 21 })` đổi giờ.

## Giấy phép

[MIT](LICENSE)
