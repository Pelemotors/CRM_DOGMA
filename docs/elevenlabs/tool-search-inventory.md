# Tool: search_inventory

## הגדרה בממשק

| שדה | ערך |
|-----|-----|
| Name | `search_inventory` |
| Method | `POST` |
| URL | `https://<PUBLIC_HOSTNAME>/api/ai/tools/search-inventory` |
| Timeout | 5–6 seconds |
| Content-Type | `application/json` |

### Headers

```http
Authorization: Bearer {{secret__wonder_ai_api_key}}
Content-Type: application/json
```

(התאם את שם ה-secret לממשק — ראה [`secrets-and-context.md`](secrets-and-context.md).)

## Description (הדבק לכלי)

השתמש בכלי זה כדי לבדוק את מלאי הרכבים האמיתי של הסוכנות כאשר הלקוח מבקש רכב מסוים או מגדיר דרישות ברורות. אין להמציא רכבים שאינם מוחזרים מהכלי. אם אין תוצאות, אמור שאין כרגע התאמה מדויקת ובדוק עם הלקוח האם יש גמישות בדרישות.

העדף פרמטרים מובנים (make, model, minYear, maxPrice, vehicleType, categories, maxKm). השתמש ב-searchText רק כ-fallback כשאי אפשר למפות לשדות האלה. ל"ג'יפ"/"ג'יפון" השתמש ב-vehicleType — לא ב-categories. categories מותרות רק: electric, hybrid, petrol, diesel, seats7.

## פרמטרים שהמודל ממלא

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| maxPrice | number | no | תקציב מקסימלי בש״ח |
| minYear | number | no | |
| maxYear | number | no | |
| maxKm | number | no | |
| make | string | no | יצרן, למשל Mazda |
| model | string | no | דגם, למשל CX-5 |
| vehicleType | string | no | SUV / ג'יפ / … — **לא** category |
| categories | array of string | no | electric\|hybrid\|petrol\|diesel\|seats7 בלבד |
| searchText | string | no | **fallback בלבד** |

## Body template (כולל context קבוע)

המודל ממלא רק את שדות החיפוש. `context` תמיד מהמערכת:

```json
{
  "context": {
    "conversationId": "{{system__conversation_id}}",
    "agencyId": "wonder_demo"
  },
  "maxPrice": "{{maxPrice}}",
  "minYear": "{{minYear}}",
  "maxYear": "{{maxYear}}",
  "maxKm": "{{maxKm}}",
  "make": "{{make}}",
  "model": "{{model}}",
  "vehicleType": "{{vehicleType}}",
  "categories": "{{categories}}",
  "searchText": "{{searchText}}"
}
```

בממשק ElevenLabs: סמן את שדות החיפוש כפרמטרים דינמיים שהסוכן ממלא; השאר את `context` כתבנית קבועה עם dynamic variables של המערכת. אם ה-UI בונה JSON אוטומטית — ודא ש-`conversationId` / `agencyId` **לא** מופיעים כפרמטרים שהמודל בוחר.

## תשובה

השתמש ב-`vehicles[]` (AI-safe). שדה `vehicleTypeFilter` מראה normalization (למשל ג'יפ→SUV).
