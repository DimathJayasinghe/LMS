# Stream (SSE) API

> Step 11 — Real-time server push via Server-Sent Events.

## GET `/api/stream`

**Open SSE connection** — Any authenticated user.

### Auth

Requires valid `access_token` HTTP-only cookie (same as other protected routes).

### Response

- `Content-Type: text/event-stream`
- Long-lived connection; server sends heartbeat comments every 30s (`: heartbeat`)
- Initial event: `CONNECTED`

### Event format

Each message uses standard SSE fields:

```
id: <uuid>
event: <EVENT_TYPE>
data: <JSON envelope>
```

Envelope shape:

```json
{
  "id": "uuid",
  "type": "RESULTS_PUBLISHED",
  "timestamp": "2026-05-23T12:00:00.000Z",
  "data": { },
  "audience": { "courseId": "uuid" }
}
```

### Event types

| Type | Trigger | `data` fields |
|------|---------|---------------|
| `CONNECTED` | Client connects | `userId` |
| `RESULTS_PUBLISHED` | Admin publishes exam results | `examId`, `courseId`, `examTitle`, `publishedAt` |
| `TIMETABLE_UPDATED` | Class session created/updated/deleted | `courseId`, `sessionId`, `action` |
| `EXAM_CONTROL` | Exam updated or soft-deleted | `examId`, `courseId`, `action`, `startTime?`, `endTime?` |

When `audience.courseId` is set, the client should refetch if the user is enrolled in that course.

### Frontend usage

```typescript
const source = new EventSource(`${API_URL}/stream`, { withCredentials: true });

source.addEventListener('RESULTS_PUBLISHED', (event) => {
  const payload = JSON.parse(event.data);
  // invalidate React Query caches for results / exams
});
```

### Errors

| Status | When |
|--------|------|
| 401 | Missing or invalid access token |
