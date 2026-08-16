# Wonder AI — Phase 3A Voice Read-Only

מדריך הפעלה לפיילוט Voice **ללא** חיבור write tools וללא פתיחת פורט 3000 לאינטרנט.

## מה חשוף

רק:

```text
/api/ai/*
```

שאר ה-CRM (`/api/leads`, `/api/vehicles`, `/api/auth`, UI…) **לא** מפורסם דרך ה-tunnel.

## Cloudflare Tunnel (מומלץ)

1. התקן `cloudflared` על מחשב הסוכנות.
2. צור Tunnel בחשבון Cloudflare וקשור hostname (למשל `ai-agency.example.com`).
3. השתמש בקונפיג לדוגמה: [`config/cloudflared-ai.example.yml`](../config/cloudflared-ai.example.yml).

עיקרון ה-ingress:

- `path: /api/ai/*` → `http://127.0.0.1:3000`
- catch-all אחרון → `http_status:404`

כך גם אם מישהו קורא ל-`https://ai-agency.example.com/api/leads` הוא מקבל **404** מה-edge, בלי להגיע ל-CRM.

4. ה-CRM חייב לרוץ מקומית (`npm run dashboard`) על פורט 3000 **רק על המחשב/LAN** — לא Port Forward בנתב.

## אימות לפיילוט

Header:

```http
Authorization: Bearer <AI_API_KEY>
```

המפתח נשמר ב:

- קובץ `.env` מקומי בשרת ה-CRM (`AI_API_KEY=…`) — לא ב-git
- Secret של Server Tool ב-ElevenLabs (כשיוגדר בביקורת הבאה)

### Hardening עתידי (לא ממומש ב-3A)

Cloudflare Access **Service Token** — הוספת headers:

```http
CF-Access-Client-Id: …
CF-Access-Client-Secret: …
```

בנוסף ל-Bearer. מאפשר לחסום קריאות שלא עוברות דרך Access. אין חובה לפיילוט הנוכחי.

## Tools מותרים ל-Voice (read-only)

| Tool | Path |
|------|------|
| `search_inventory` | `POST /api/ai/tools/search-inventory` |
| `get_vehicle_details` | `POST /api/ai/tools/get-vehicle` |
| `calculate_finance` | `POST /api/ai/tools/calculate-finance` |

**אין לחבר** ל-ElevenLabs: `upsert-lead`, `create-followup`, `create-appointment`, `submit-conversation-outcome`.

בשרת, כתיבה **fail-closed**: בלי `AI_WRITE_ENABLED=1` כל write מחזיר `403 WRITE_DISABLED`.

### חוזה `search_inventory`

- `categories`: רק `electric` | `hybrid` | `petrol` | `diesel` | `seats7`
- `vehicleType`: שדה **נפרד** — למשל `SUV`. מונחים כמו `ג'יפ` / `ג'יפון` מנורמלים ל-`SUV`

Body חובה:

```json
{
  "context": {
    "conversationId": "…",
    "agencyId": "optional-for-audit-only"
  }
}
```

## Timeout / Retry / Offline

| הגדרה | ערך |
|--------|-----|
| Tool timeout ב-ElevenLabs | **5–6 שניות** |
| Retry | לכל היותר **אחד** על read-only ב-502/503/timeout; **אין** retry אגרסיבי |
| 4xx | בלי retry |

### כשה-CRM או ה-Tunnel לא זמינים

אין Cloudflare Worker ב-3A. ElevenLabs יקבל כשל HTTP (timeout / 5xx / connection error).

**הנחיית tool-failure לסוכן הקולי (להדביק ב-prompt / tool failure handling):**

> אם קריאת הכלי נכשלה (timeout, 5xx, או שגיאת רשת) — אל תמציא מלאי, מחירים או הצעות מימון. אמור ללקוח שהמערכת זמנית לא זמינה, והצע לחזור אליו או להעביר לנציג. אפשר לנסות שוב פעם אחת בלבד.

מבנה לוגי מומלץ (כשהתשובה זמינה מהשרת):

```json
{
  "ok": false,
  "error": "CRM_UNAVAILABLE",
  "message": "מערכת המלאי זמנית לא זמינה. נשמח לחזור אליך או לקבוע שיחה עם נציג.",
  "retryable": true
}
```

## לפני חיבור ElevenLabs

1. הרץ בדיקות: `npm run test:ai-phase3a`
2. העלה Tunnel + CRM חיים
3. אימות ציבורי: `npm run verify:public-ai` (או `-- --local` לסימולציה)
4. חבילת הגדרה ל-ElevenLabs Read-Only: [`docs/elevenlabs/README.md`](elevenlabs/README.md) (Phase 3B)
5. הגדר בממשק ElevenLabs **רק** אחרי שהאימות הציבורי ירוק — לפי ה-checklist שם

## agencyId

שדה אופציונלי ב-`context` וב-audit בלבד. אין סינון multi-tenant בשלב זה. בפיילוט ElevenLabs: ערך קבוע `wonder_demo`.

