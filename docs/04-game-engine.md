# 04 — Game Engine

Toàn bộ game logic chạy trên client. File này mô tả cơ chế cần implement — đây là spec, không phải code.

---

## Board

- **Kích thước:** 10 cột × 20 hàng visible + 4 hàng buffer ở trên (spawn zone, không hiển thị)
- **Coordinate system:** `[row][col]`, row 0 = top (buffer), row 23 = bottom
- **Cell value:** `0` = rỗng, `1–7` = màu của tetrimino (I, O, T, S, Z, J, L)

```
Col:  0  1  2  3  4  5  6  7  8  9
Row 0: [buffer - không hiển thị]
Row 1: [buffer - không hiển thị]
Row 2: [buffer - không hiển thị]
Row 3: [buffer - không hiển thị]
Row 4: [ visible board starts here ]
...
Row 23: [ bottom ]
```

---

## Pieces (Tetriminos)

7 pieces chuẩn Tetris Guideline:

| Piece | Màu | Spawn column |
|---|---|---|
| I | Cyan | cols 3–6 |
| O | Yellow | cols 4–5 |
| T | Purple | cols 3–5 |
| S | Green | cols 3–5 |
| Z | Red | cols 3–5 |
| J | Blue | cols 3–5 |
| L | Orange | cols 3–5 |

Spawn position: row 2–3 (buffer zone). Nếu spawn position bị block → **Top Out** (thua).

---

## Rotation System: SRS (Super Rotation System)

Dùng chuẩn Tetris Guideline SRS. Mỗi piece có 4 rotation states (0, R, 2, L).

### Wall Kick

Khi rotation thất bại do va chạm, thử lần lượt các wall kick offset theo bảng SRS:

**Cho J, L, S, T, Z pieces:**

| Từ state | Thử offset theo thứ tự |
|---|---|
| 0 → R | (0,0), (-1,0), (-1,+1), (0,-2), (-1,-2) |
| R → 0 | (0,0), (+1,0), (+1,-1), (0,+2), (+1,+2) |
| R → 2 | (0,0), (+1,0), (+1,-1), (0,+2), (+1,+2) |
| 2 → R | (0,0), (-1,0), (-1,+1), (0,-2), (-1,-2) |
| 2 → L | (0,0), (+1,0), (+1,+1), (0,-2), (+1,-2) |
| L → 2 | (0,0), (-1,0), (-1,-1), (0,+2), (-1,+2) |
| L → 0 | (0,0), (-1,0), (-1,-1), (0,+2), (-1,+2) |
| 0 → L | (0,0), (+1,0), (+1,+1), (0,-2), (+1,-2) |

**Cho I piece:** Dùng bảng wall kick riêng của I (xem Tetris Wiki).

Nếu tất cả offset đều thất bại → rotation không thực hiện.

---

## Gravity

Gravity tăng theo level. Đơn vị: **số frame mỗi cell drop** (ở 60fps).

| Level | Gravity (frames/cell) | Thời gian drop 1 cell |
|---|---|---|
| 1 | 48 | 800ms |
| 2 | 43 | 717ms |
| 3 | 38 | 633ms |
| 5 | 28 | 467ms |
| 10 | 8 | 133ms |
| 15 | 5 | 83ms |
| 20 | 1 | 17ms |

Dùng bảng chuẩn Tetris Guideline (Gravity Table).

**Soft drop:** 1 frame/cell (bất kể level). Tích điểm 1 điểm/cell.

**Hard drop:** Piece rơi xuống đáy ngay lập tức. Tích điểm 2 điểm/cell.

---

## Lock-Down

Sau khi piece chạm đất, **không lock ngay**. Áp dụng Extended Placement Lock Down:

- **Lock delay:** 500ms (30 frames ở 60fps)
- Mỗi lần người chơi di chuyển hoặc xoay piece → reset timer 500ms
- **Move limit:** tối đa 15 resets. Sau 15 resets, piece lock ngay lập tức dù timer chưa hết
- Nếu piece rơi xuống thấp hơn (new lowest row) → reset move counter về 0

---

## Line Clear

Sau khi piece lock:

1. Scan tất cả rows từ dưới lên, tìm rows đầy (`filled_cells == 10`)
2. Xóa những rows đó
3. Các rows phía trên "rơi xuống" để lấp khoảng trống
4. Trigger scoring và garbage calculation

### Thứ tự xử lý sau piece lock

```
1. Lock piece vào board
2. Check T-Spin (trước khi xóa dòng)
3. Clear filled rows
4. Calculate score (dựa trên lines + T-Spin + combo + level)
5. Calculate garbage output
6. Apply pending garbage (nếu không có counter)
7. Check All Clear (sau khi apply garbage)
8. Spawn next piece
9. Check Top Out
```

---

## Scoring

### Base line clear score

| Lines cleared | Tên | Base points |
|---|---|---|
| 1 | Single | 100 |
| 2 | Double | 300 |
| 3 | Triple | 500 |
| 4 | Tetris | 800 |

**Công thức:** `score += base_points × level`

### T-Spin bonus

| Lines + T-Spin | Tên | Base points |
|---|---|---|
| T-Spin + 0 lines | T-Spin | 400 |
| T-Spin + 1 line | T-Spin Single | 800 |
| T-Spin + 2 lines | T-Spin Double | 1200 |
| T-Spin + 3 lines | T-Spin Triple | 1600 |
| Mini T-Spin + 0 | Mini T-Spin | 100 |
| Mini T-Spin + 1 | Mini T-Spin Single | 200 |

### Combo bonus

Combo tăng khi mỗi piece lock đều clear ít nhất 1 dòng. Reset về -1 khi không clear dòng.

`combo_bonus = 50 × combo_count × level`

### All Clear bonus

Khi board hoàn toàn rỗng sau khi clear dòng:

`all_clear_bonus = 3500 × level` (hoặc theo bảng All Clear chuẩn)

### Level progression

- Bắt đầu level 1
- Level tăng mỗi 10 lines cleared
- `current_level = start_level + floor(total_lines / 10)`

---

## Garbage System

### Garbage output (lines gửi sang đối thủ)

| Hành động | Garbage gửi |
|---|---|
| Single | 0 |
| Double | 1 |
| Triple | 2 |
| Tetris | 4 |
| T-Spin Single | 2 |
| T-Spin Double | 4 |
| T-Spin Triple | 6 |
| Mini T-Spin Single | 0 |
| Combo 1 | 0 |
| Combo 2 | 1 |
| Combo 3 | 1 |
| Combo 4 | 2 |
| Combo 5 | 2 |
| Combo 6 | 3 |
| Combo 7 | 3 |
| Combo 8+ | 4 |
| All Clear | 10 (cộng thêm vào base) |

Garbage từ các nguồn cộng lại trong cùng một piece lock.

### Counter mechanic

Trước khi gửi garbage ra: dùng pending garbage đang nhận vào để offset garbage gửi đi.

```
net_garbage_sent = max(0, garbage_generated - pending_garbage_incoming)
remaining_incoming = max(0, pending_garbage_incoming - garbage_generated)
```

Chỉ garbage net mới được gửi đến đối thủ. Pending garbage còn lại sau counter tiếp tục chờ.

### Garbage application

Pending garbage được apply vào board của người nhận khi:
- Piece tiếp theo spawn (không apply giữa chừng khi piece đang rơi)

Garbage line là một dòng toàn màu xám với **1 ô trống ngẫu nhiên** (cùng column cho tất cả dòng trong một lần gửi — "consistent column").

### Pending garbage display

Hiển thị thanh màu đỏ bên cạnh board (chiều cao = số garbage pending). Warning flash khi pending ≥ 4.

---

## T-Spin Detection

T-Spin được xác nhận khi:

1. Piece vừa lock là T-piece
2. Rotation cuối cùng là kết quả của wall kick hoặc standard rotation (không phải chỉ move ngang)
3. **3-corner rule:** Trong 4 góc của T-piece (2×2 bounding box), ít nhất 3 góc bị chiếm (bởi board cell hoặc wall)

**Mini T-Spin:** Chỉ 2 trong 3 corner về phía "mặt" của T bị chiếm (rule cụ thể xem Tetris Wiki).

---

## Ghost Piece

Hiển thị vị trí hard drop của piece hiện tại:
- Màu mờ (opacity ~0.3) của piece
- Cập nhật realtime theo di chuyển ngang và rotation

---

## Next Piece Queue

Hiển thị 3–5 piece tiếp theo. Dùng **7-bag randomizer** (Random Generator):
- Xáo trộn 7 pieces mỗi "bag"
- Không bao giờ repeat quá 12 lần liên tiếp cùng loại piece

---

## Game Loop (60fps)

```
requestAnimationFrame(gameLoop)

gameLoop(timestamp):
  1. Calculate delta time từ last frame
  2. Process input queue (keyboard events đã buffer từ event handlers)
  3. Update gravity timer → nếu đủ → drop piece 1 cell
  4. Update lock-down timer → nếu đủ → lock piece
  5. Clear canvas
  6. Render board
  7. Render ghost piece
  8. Render active piece
  9. Render UI elements (score, level, next pieces, garbage bar)
  10. requestAnimationFrame(gameLoop) — lặp lại
```

---

## Input Handler

Xử lý keyboard input với DAS/ARR:

| Key | Action |
|---|---|
| ← / → | Move left/right |
| ↓ | Soft drop |
| Space | Hard drop |
| Z / Ctrl | Rotate counter-clockwise |
| X / ↑ | Rotate clockwise |
| A | Rotate 180° |
| C / Shift | Hold piece |
| Esc | Pause |

### DAS/ARR values (configurable)

- **DAS (Delayed Auto Shift):** 167ms (10 frames ở 60fps) — thời gian giữ trước khi auto-repeat bắt đầu
- **ARR (Auto Repeat Rate):** 33ms (2 frames ở 60fps) — tốc độ auto-repeat

Để configurable trong settings UI.

### Hold piece

- Giữ piece hiện tại, swap với piece đang hold (hoặc lấy từ queue nếu chưa hold)
- Chỉ dùng hold 1 lần mỗi piece (reset khi piece mới spawn)

---

## Game Over Conditions

| Condition | Tên |
|---|---|
| Piece spawn bị block | Top Out |
| Piece lock ngoài visible board | Lock Out |
| Garbage đẩy pieces lên quá board | Garbage Out |

Trong tất cả cases: emit `game-over` event, hiển thị màn hình kết quả.
