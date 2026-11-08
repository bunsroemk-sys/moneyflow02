## 7. แบบตารางสำหรับใส่ใน README และคลิป

### 7.1 ตารางส่วนร่วม

| ชื่อ-สกุล | รหัสนักศึกษา | ชิ้นงานที่รับผิดชอบ (ไฟล์ / Component / Route / DSA) | ช่วงที่นำเสนอในคลิป |
| พัชรพร ถ้วนแก้ว | 681310642 | `dashboard.js` ส่วนแสดงฟอร์มสมัครสมาชิก เข้าสู่ระบบ และออกจากระบบ React + Vite พัฒนาส่วนหน้าของระบบบันทึกรายรับ-รายจ่าย การสรุปยอด และการแสดงผลข้อมูล | ช่วงที่ 3 |

| กฤษวริณญา บุญเสริม | 681310773 | `server.js` — API สำหรับจัดการบัญชีผู้ใช้ Express — พัฒนา API สำหรับจัดการข้อมูล คำนวณยอดเงิน จัดเก็บประวัติ และระบบบัญชีผู้ใช้ | ช่วงที่ 4 |

| กฤษวริณญา บุญเสริม | 681310773 | Hash Table ในการจัดเก็บและค้นหาข้อมูล และใช้ Sorting ในการเรียงลำดับข้อมูลภายในระบบ MoneyFlow | ช่วงที่ 5 |

### 7.2 ตารางข้อแนะนำจากงานแรก → สิ่งที่แก้

| ข้อแนะนำจากงานแรก | สิ่งที่แก้ในงานนี้ | หลักฐาน Before / After |
| 1. พัฒนาระบบจัดการบัญชีผู้ใช้ ระบบสมัครสมาชิกและเข้าสู่ระบบ | เพิ่มระบบสมัครสมาชิกและเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
สามารถเข้าสู่ระบบด้วยบัญชีที่สมัครไว้และออกจากระบบได้ | 

| 2. ระบบบันทึกและแสดงประวัติรายรับ-รายจ่ายแยกตามบัญชีผู้ใช้ จัดเก็บข้อมูลและประวัติรายรับ-รายจ่ายแยกตามบัญชีผู้ใช้ เพื่อให้สามารถกลับมาเข้าสู่ระบบและดูข้อมูลเดิมได้ | 


MoneyFlow uses an Express API backend and an independent React + Vite frontend. Express serves API routes only; the frontend is developed and deployed separately.

## Development

Install backend dependencies from the repository root and frontend dependencies from `frontend/`:

```sh
npm install
npm --prefix frontend install
```

Run the backend and frontend in separate terminals:

```sh
npm run dev:backend
npm run dev:frontend
```

Open the Vite URL (normally `http://localhost:5173`). Vite proxies `/api` requests to `http://localhost:3000`. Set `API_PROXY_TARGET` if the backend listens elsewhere. Run backend tests with `npm test` and create the frontend production bundle with `npm run build:frontend`.

## Separate deployments

Deploy the `frontend/dist` output to a static host and run `server.js` as the API service. The API does not serve the frontend build. Set `VITE_API_BASE_URL` when building the frontend to the API's public URL, and set `FRONTEND_ORIGIN` on the API to the exact frontend origin (for example, `https://app.example.com`). Use HTTPS for both services so the cross-origin session cookie can be sent by the browser.
