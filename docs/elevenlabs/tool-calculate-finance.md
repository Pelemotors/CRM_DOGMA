# Tool: calculate_finance

## הגדרה בממשק

| שדה | ערך |
|-----|-----|
| Name | `calculate_finance` |
| Method | `POST` |
| URL | `https://<PUBLIC_HOSTNAME>/api/ai/tools/calculate-finance` |
| Timeout | 5–6 seconds |

### Headers

```http
Authorization: Bearer {{secret__wonder_ai_api_key}}
Content-Type: application/json
```

## Description

השתמש בכלי זה כאשר הלקוח מבקש חישוב מספרי של מימון או החזר חודשי. אל תחשב החזר בעצמך. יש להשתמש בתוצאה שהכלי מחזיר ולהבהיר שמדובר בהצעה משוערת בלבד, הכפופה לתנאים ולאישור. העדף תמיד vehicleId של רכב שכבר נבחר בשיחה. אם אין רכב נבחר, ניתן להעביר price + year (+ isNew במידת הצורך).

## פרמטרים שהמודל ממלא

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| vehicleId | string | preferred | מזהה מרכב בשיחה |
| downPayment | number | no | מקדמה בש״ח |
| months | number | no | מספר תשלומים |
| comprehensiveInsurance | boolean | no | מקיף כן/לא (ברירת מחדל בשרת: כן) |
| price | number | fallback | אם אין vehicleId |
| year | number | fallback | אם אין vehicleId |
| isNew | boolean | no | מסלול ריבית לרכב חדש |

## Body template

```json
{
  "context": {
    "conversationId": "{{system__conversation_id}}",
    "agencyId": "wonder_demo"
  },
  "vehicleId": "{{vehicleId}}",
  "downPayment": "{{downPayment}}",
  "months": "{{months}}",
  "comprehensiveInsurance": "{{comprehensiveInsurance}}",
  "price": "{{price}}",
  "year": "{{year}}",
  "isNew": "{{isNew}}"
}
```

## תשובה ללקוח

הסבר לפי `quote.monthlyPayment`, `quote.months`, `quote.annualRate`, והקרא/סכם את `quote.disclaimer`.
