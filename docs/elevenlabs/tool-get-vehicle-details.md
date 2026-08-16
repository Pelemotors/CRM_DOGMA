# Tool: get_vehicle_details

## הגדרה בממשק

| שדה | ערך |
|-----|-----|
| Name | `get_vehicle_details` |
| Method | `POST` |
| URL | `https://<PUBLIC_HOSTNAME>/api/ai/tools/get-vehicle` |
| Timeout | 5–6 seconds |

### Headers

```http
Authorization: Bearer {{secret__wonder_ai_api_key}}
Content-Type: application/json
```

## Description

השתמש כאשר הלקוח מתעניין ברכב מסוים שכבר הוחזר מחיפוש, ונדרש מידע נוסף עליו. אין להמציא פרטי רכב שאינם מוחזרים מהכלי. חובה להעביר את ה-vehicleId המדויק מהתוצאה הקודמת של search_inventory.

## פרמטרים שהמודל ממלא

| Parameter | Type | Required |
|-----------|------|----------|
| vehicleId | string | yes |

## Body template

```json
{
  "context": {
    "conversationId": "{{system__conversation_id}}",
    "agencyId": "wonder_demo"
  },
  "vehicleId": "{{vehicleId}}"
}
```
