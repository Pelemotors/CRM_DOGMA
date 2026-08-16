# Wonder AI × ElevenLabs — Phase 3B (Read-Only)

חבילת הגדרה לפיילוט קולי. **רק 3 tools.** אין `recommend_vehicles`, אין write.

## סדר עבודה

1. CRM מקומי רץ + `.env` עם `AI_API_KEY` (בלי `AI_WRITE_ENABLED`)
2. Cloudflare Tunnel לפי [`docs/wonder-ai-voice-phase3a.md`](../wonder-ai-voice-phase3a.md)
3. אימות ציבורי: `PUBLIC_AI_BASE=https://... npm run verify:public-ai`
4. רק אחרי ירוק — הגדרת Tools בממשק ElevenLabs לפי הקבצים כאן
5. הרצת 4 בדיקות השיחה ב-[`checklist.md`](checklist.md)

## קבצים בחבילה

| קובץ | תוכן |
|------|------|
| [`checklist.md`](checklist.md) | רשימת סימון להגדרה + 4 בדיקות שיחה |
| [`system-prompt-voice-readonly.md`](system-prompt-voice-readonly.md) | טקסט להדבקה ב-System Prompt |
| [`tool-search-inventory.md`](tool-search-inventory.md) | הגדרת tool 1 |
| [`tool-get-vehicle-details.md`](tool-get-vehicle-details.md) | הגדרת tool 2 |
| [`tool-calculate-finance.md`](tool-calculate-finance.md) | הגדרת tool 3 |
| [`secrets-and-context.md`](secrets-and-context.md) | Secret ל-API key + system__conversation_id |

## עקרונות שלא שוברים

- Bearer רק כ-**secret** / environment secret — לא ב-prompt
- `conversationId` מ-`system__conversation_id` — המודל לא ממציא
- `agencyId` קבוע בפיילוט: `wonder_demo`
- Timeout: **5–6 שניות**
- `searchText` = fallback בלבד; העדף make/model/minYear/…
