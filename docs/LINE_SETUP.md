# การตั้งค่า LINE Developers & Messaging API

คู่มือนี้จะอธิบายขั้นตอนการรับค่า Credentials จาก LINE เพื่อนำไปตั้งค่าเชื่อมโยงบอทเข้ากับ Google Apps Script ของคุณ

---

## 1. สมัคร/เข้าใช้งาน LINE Developers Console
1. เข้าไปที่ [LINE Developers Console](https://developers.line.biz/)
2. เข้าสู่ระบบด้วยบัญชี LINE ของคุณ (หรือบัญชี Business)

---

## 2. สร้าง Provider และ Messaging API Channel
1. หากยังไม่มี **Provider** ให้กด **Create a new provider** และตั้งชื่อ (เช่น `TN Messenger`)
2. ภายใต้ Provider ที่สร้างขึ้น ให้กด **Create a Messaging API channel**
3. กรอกข้อมูลพื้นฐานของ LINE Official Account (OA) ของคุณ:
   - **Channel name:** ชื่อบอทที่จะแสดงให้ลูกค้าเห็น
   - **Channel description:** คำอธิบายบอท
   - **Category / Subcategory:** เลือกตามความเหมาะสม
   - **Email address:** อีเมลติดต่อ
4. กดยอมรับเงื่อนไขและกด **Create**

---

## 3. ดึงค่า Credentials (สำคัญมาก)
มี 2 ค่าที่คุณต้องคัดลอกไว้เพื่อนำไปใส่ใน Google Apps Script:

### ค่าที่ 1: Channel Secret
1. ไปที่แท็บ **Basic settings**
2. เลื่อนลงมาด้านล่างสุดจะพบหัวข้อ **Channel secret**
3. คัดลอกค่านั้นเก็บไว้ (เช่น `a1b2c3d4e5f6...`)

### ค่าที่ 2: Channel Access Token
1. ไปที่แท็บ **Messaging API**
2. เลื่อนลงมาล่างสุดจะพบหัวข้อ **Channel access token (long-lived)**
3. กดปุ่ม **Issue**
4. คัดลอกโทเค็นยาวๆ ที่ได้เก็บไว้

---

## 4. ตั้งค่า Google Apps Script (Script Properties)
นำค่าที่ได้จากข้อ 3 ไปใส่ใน Google Apps Script ของ Sheet A (Extensions → Apps Script):
1. ไปที่ **Project Settings** (ไอคอนฟันเฟืองด้านซ้ายมือ)
2. เลื่อนลงไปที่หัวข้อ **Script Properties**
3. กด **Add script property** และเพิ่มค่าดังนี้:
   - **Property:** `LINE_CHANNEL_SECRET` | **Value:** *ใส่ค่า Channel Secret ที่คัดลอกมา*
   - **Property:** `LINE_CHANNEL_ACCESS_TOKEN` | **Value:** *ใส่ค่า Channel Access Token ที่คัดลอกมา*
   - **Property:** `BASE_URL` (ทางเลือก) | **Value:** `https://tn-messenger-olive.vercel.app` *(หรือ URL เว็บของคุณ เพื่อใช้ส่งลิงก์ติดตามงาน)*
4. กด **Save script properties**

---

## 5. ตั้งค่า Webhook ใน LINE Developers Console
หลังจากที่ทำการ Deploy Google Apps Script เป็น **Web App (Execute as: Me, Access: Anyone)** เรียบร้อยแล้ว:
1. คัดลอก URL ของ Web App ที่ได้จาก Apps Script (เช่น `https://script.google.com/macros/s/XXXXX/exec`)
2. กลับไปที่ LINE Developers Console → แท็บ **Messaging API**
3. ในหัวข้อ **Webhook settings**:
   - กด **Edit** และนำ URL ของ Apps Script ไปวางในช่อง **Webhook URL**
   - **สำคัญ:** ต้องนำพารามิเตอร์ `?action=line` ต่อท้าย URL หรือไม่ก็ได้ (โค้ดของบอทจะคัดกรองจาก request header ให้อัตโนมัติ แต่แนะนำให้ใส่ไว้เพื่อความชัดเจน)
   - กด **Save**
4. เปิดสวิตช์ **Use webhook** ให้เป็นสีเขียว
5. กดปุ่ม **Verify** เพื่อทดสอบว่า LINE สามารถเชื่อมต่อหา Google Apps Script ได้สำเร็จ (จะขึ้นข้อความ `Success` สีเขียว)

---

## 6. ปิดการตอบกลับอัตโนมัติของ LINE (เพื่อไม่ให้แย่งบอทตอบ)
เนื่องจากบอทของเราจะจัดการตอบกลับข้อมูลด้วยตัวเองทั้งหมด เราจำเป็นต้องปิดการตอบกลับอัตโนมัติของระบบ LINE:
1. ไปที่หน้าตั้งค่าใน LINE Developers Console → แท็บ **Messaging API**
2. หาหัวข้อ **LINE Official Account features** → กด Edit หลัง **Auto-reply messages** (ระบบจะพาไปหน้า LINE Official Account Manager)
3. ในหัวข้อ **Response settings (ตั้งค่าการตอบกลับ)**:
   - **Response mode (โหมดตอบกลับ):** เลือก **Chat bot (บอท)**
   - **Simple Auto-reply (ข้อความตอบกลับอัตโนมัติ):** ตั้งเป็น **Disabled (ปิดใช้งาน)**
   - **Greeting message (ข้อความทักทายเพื่อนใหม่):** ตั้งเป็น **Disabled (ปิดใช้งาน)** หรือจะเปิดทิ้งไว้เพื่อต้อนรับลูกค้าเฉยๆ ก็ได้
