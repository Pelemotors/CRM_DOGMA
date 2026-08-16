# Secrets ו-Context ב-ElevenLabs

## AI_API_KEY — Secret בלבד

**אל תדביק** את המפתח כטקסט רגיל בקונפיג של כל Tool.

### מומלץ (לפי תיעוד ElevenLabs העדכני)

1. בממשק ה-Agent / Workspace הגדר **Secret Dynamic Variable** או **Environment Secret**, למשל:
   - שם: `wonder_ai_api_key`  
   - או השם שה-UI מציג ל-secret (לעיתים מופיע כ-`secret__…`)
2. ערך: אותו מחרוזת כמו `AI_API_KEY` ב-`.env` של ה-CRM המקומי.
3. ב-Header של **כל** Tool:

```http
Authorization: Bearer {{secret__wonder_ai_api_key}}
```

אם הממשק שלך משתמש ב-Environment Variables במקום `secret__`:

```http
Authorization: Bearer {{wonder_ai_api_key}}
```

בחר את התחביר **שה-UI מציע בפועל** אחרי יצירת ה-secret (השמות משתנים מעט בין מסכים). העיקרון: המפתח מנוהל כסוד, לא כפרמטר שהמודל רואה, ולא ב-System Prompt / Knowledge Base.

### Rotation

1. עדכן `.env` ב-CRM + restart
2. עדכן את ה-secret ב-ElevenLabs
3. אין צורך לערוך מחדש את שלושת ה-Tools

### Staging / Production (עתידי)

Environment נפרד ב-ElevenLabs עם secret שונה לכל סביבה — אותו תבנית Header.

---

## context — לא מהמודל

ב-**body template** של כל Tool (לא כפרמטרים שה-LLM ממלא):

```json
"context": {
  "conversationId": "{{system__conversation_id}}",
  "agencyId": "wonder_demo"
}
```

- `system__conversation_id` הוא **System Dynamic Variable** אוטומטי של ElevenLabs.
- `agencyId` בפיילוט קבוע: `wonder_demo`.
- המודל **לא** אמור לקבל שדות אלה למילוי ידני.

ה-CRM מקבל גם aliases (`conversation_id`, header `X-Conversation-Id`) אם התבנית תשתנה — עדיין ממקור פלטפורמה.

אם חסר conversationId → תשובת שרת `400 MISSING_CONVERSATION_ID` = תקלת הגדרת Tool, לא תקלת מלאי.
