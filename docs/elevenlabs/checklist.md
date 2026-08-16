# Checklist — Phase 3B

## A. לפני ElevenLabs

- [ ] CRM רץ (`npm run dashboard`)
- [ ] `.env` מכיל `AI_API_KEY` ארוך; **אין** `AI_WRITE_ENABLED=1`
- [ ] מלאי דמו / אמיתי קיים (`npm run seed:demo-vehicles` לפיילוט)
- [ ] `cloudflared` עם ingress רק `/api/ai/*` + catch-all 404
- [ ] אימות מקומי (סימולציה): `npm run verify:public-ai -- --local`
- [ ] אימות ציבורי אמיתי:
  ```bash
  set PUBLIC_AI_BASE=https://YOUR_HOSTNAME
  set AI_API_KEY=your-key
  npm run verify:public-ai
  ```
- [ ] ידנית: `POST .../search-inventory` בלי Bearer → 401
- [ ] ידנית: `/api/leads`, `/api/vehicles`, `/` → 404

## B. ElevenLabs (הגדרה)

- [ ] Secret: `wonder_ai_api_key` (או שם ה-UI) = אותו `AI_API_KEY`
- [ ] System Prompt מ-[`system-prompt-voice-readonly.md`](system-prompt-voice-readonly.md)
- [ ] Tool `search_inventory` לפי [`tool-search-inventory.md`](tool-search-inventory.md)
- [ ] Tool `get_vehicle_details` לפי [`tool-get-vehicle-details.md`](tool-get-vehicle-details.md)
- [ ] Tool `calculate_finance` לפי [`tool-calculate-finance.md`](tool-calculate-finance.md)
- [ ] בכל Tool: Header Bearer מ-**secret**, לא טקסט גלוי
- [ ] בכל Tool: `context.conversationId={{system__conversation_id}}`, `agencyId=wonder_demo`
- [ ] Timeout 5–6s
- [ ] **לא** חובר `recommend_vehicles`
- [ ] **לא** חוברו write tools

## C. ארבע בדיקות שיחה (אותה שיחה)

| # | משפט | צפוי |
|---|------|------|
| 1 | יש לכם מאזדה CX-5? | `search_inventory` עם make/model (לא searchText בלבד) |
| 2 | אני מחפש ג'יפ עד 150 אלף, מ-2022 ומעלה | `vehicleType` (SUV/ג'יפ), `maxPrice=150000`, `minYear=2022` — **לא** categories=SUV |
| 3 | ספר לי על ה-CX-5 הראשונה | `get_vehicle_details` עם vehicleId מהחיפוש |
| 4 | אם אני שם 30 אלף מקדמה ולוקח ל-84 חודשים, כמה זה יוצא? | `calculate_finance` על **אותו** vehicleId, downPayment=30000, months=84 |

## D. אחרי השיחה

- [ ] בדוק `data/ai-audit.json`: tools + conversationId + agencyId
- [ ] לא הופיעו קריאות write / recommend

---

**עצירה:** אחרי שהחבילה והאימות הציבורי מוכנים — הגדרת ElevenLabs נעשית יחד בממשק, לא בסבב פיתוח נוסף של Cursor.
