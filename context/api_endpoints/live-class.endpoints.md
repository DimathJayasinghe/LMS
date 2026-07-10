# Live Classes API Endpoints

> Zoom Meeting SDK, embedded in the site. Teachers schedule the meeting through our system (a real Zoom API
> call, not a pasted link); both host and students join **inside the LMS**, not zoom.us.

## Base URL

```
http://localhost:5000/api/classes/:classId/sessions/:sessionId/live
```

## Architecture (2026-07-10 decision)

Two **separate** Zoom apps are involved — do not conflate their credentials:

| App | Env vars | Used for |
|---|---|---|
| Server-to-Server OAuth | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | REST API: create the meeting, fetch the host's ZAK. Also verifies the existing `/attendance/zoom-webhook`. |
| Meeting SDK | `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET` | Signs the JWT the browser hands to the embedded Meeting SDK (`@zoom/meetingsdk`) to join/start. |

A **single Zoom Licensed account** hosts every meeting. Our own `Enrollment`/`Payment` tables — not Zoom's
account model — decide who may join as host vs participant; Zoom itself doesn't know about our roles. This
means every join is "within the app owner's account," so Zoom's **On-Behalf-Of (OBF) token requirement does
NOT apply** here (OBF only gates joining a meeting hosted by a genuinely different, external Zoom account —
confirmed against Zoom's own FAQ, since their SDK auth model changed materially since general training data:
https://developers.zoom.us/docs/meeting-sdk/obf-faq/). A **ZAK (Zoom Access Key)**, fetched fresh per start, is
still required for the host to start via the SDK.

**Package**: `@zoom/meetingsdk` (current, actively published). `@zoomus/websdk` is the **deprecated**
predecessor — do not install it.

## Content gate

Same premium-content gate as recorded video (architecture §7.1): a **student must be enrolled AND have paid
the current month** before a join token is issued (`403 NOT_ENROLLED` / `402 PAYMENT_REQUIRED`). Staff
(course's `TEACHER` or `SUPER_ADMIN`) get a **host** token instead, gated on course ownership, not payment.

## Anti-recording — what this actually achieves (read before assuming more)

Zoom's Web Meeting SDK renders into a plain browser `<video>`/canvas — **it has no HDCP or OS-level capture
prevention** (that flag only exists on Zoom's *native* Windows/Mac/iOS/Android SDKs, not Web). Nothing server
or client code can do closes that gap; a determined user can always screen-record or film the screen with a
second device. Decision (2026-07-10, all four picked): ship the realistic deterrent ceiling, not a false DRM
claim:
- **Meeting-settings lockdown** (this API, on create): `auto_recording: 'none'`, `join_before_host: false`,
  `waiting_room: true`, `mute_upon_entry: true`, `participant_video: false`.
- **Single-use-ish, short-lived join tokens**: a fresh JWT is minted per join attempt (never reused across
  page loads), throttled per `(session, user)` via Redis (`ZOOM_JOIN_TOKEN_THROTTLE_SECONDS`, 8s) to blunt
  casual link-sharing. Zoom enforces a **30-minute floor** on JWT `exp - iat` (1800–172800s) — the token
  itself cannot be made to expire faster than that; "short-lived" here means "freshly minted, never cached,"
  not sub-minute expiry.
- **Live watermark overlay** (frontend, `LiveClassRoom.tsx`): student name + index number, live timestamp,
  repositions periodically so it can't be cropped out — same deterrent philosophy as the VOD player.
- **Basic UI hardening**: context-menu suppression on the meeting container (matches the VOD player).

A native mobile app (which *can* use OS-level capture-blocking on iOS/Android) was explicitly deferred —
noted in the frontend roadmap as a real future phase, not built now.

---

## Endpoints Summary

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/schedule` | `TEACHER` (course owner), `SUPER_ADMIN` | Creates the Zoom meeting via the REST API; persists `zoomMeetingId`/`zoomLink`/`zoomPassword` on the session. |
| `POST` | `/token` | Any authenticated | Mints a fresh join (student) or host (staff) Meeting SDK JWT. |

---

## `POST /schedule`

**Request**: no body (uses the session's title/date/duration).

**Success (201)**
```json
{
  "status": "success",
  "data": { "sessionId": "uuid", "zoomMeetingId": "123456789", "joinUrl": "https://zoom.us/j/..." },
  "message": "Live class scheduled."
}
```

**Errors**

| Code | Status | Cause |
|---|---|---|
| `CLASS_SESSION_NOT_FOUND` | 404 | Session doesn't exist or is deleted |
| `FORBIDDEN_COURSE` | 403 | Teacher doesn't own this course |
| `SESSION_NOT_ONLINE` | 400 | Session's `classType` isn't `ONLINE` |
| `ALREADY_SCHEDULED` | 409 | `zoomMeetingId` already set |
| `ZOOM_NOT_CONFIGURED` | 503 | Server-to-Server OAuth env vars missing |
| `ZOOM_AUTH_FAILED` / `ZOOM_CREATE_FAILED` | 502 | Zoom rejected the OAuth or create-meeting request |

## `POST /token`

**Request**: no body — role is derived from the caller (`TEACHER`/`SUPER_ADMIN` who owns the course → host;
everyone else → participant, gated on enrollment+payment).

**Success (200)**
```json
{
  "status": "success",
  "data": {
    "signature": "<Meeting SDK JWT>",
    "sdkKey": "abc123",
    "meetingNumber": "123456789",
    "password": "aB3xY9",
    "role": 0,
    "userName": "Jane Student (#42)",
    "zak": "<only present when role=1>",
    "expiresAt": 1234567890
  },
  "message": "Live class token issued."
}
```

`userName` is **server-derived** (from the DB, never client input) — the whole point of the watermark is
traceability, so a spoofable client-supplied name would defeat it.

**Errors**

| Code | Status | Cause |
|---|---|---|
| `CLASS_SESSION_NOT_FOUND` | 404 | Session doesn't exist or is deleted |
| `LIVE_CLASS_NOT_SCHEDULED` | 404 | `POST /schedule` hasn't been called yet |
| `TOKEN_RATE_LIMITED` | 429 | Same user requested a token for this session within the throttle window |
| `NOT_ENROLLED` | 403 | Student not enrolled (participant path) |
| `PAYMENT_REQUIRED` | 402 | Student hasn't paid the current month (participant path) |
| `FORBIDDEN_COURSE` | 403 | Teacher doesn't own this course (host path) |
| `ZOOM_SDK_NOT_CONFIGURED` | 503 | Meeting SDK env vars missing |
| `ZOOM_ZAK_FAILED` | 502 | Zoom rejected the ZAK request (host path only) |

---

## Attendance

Unchanged — the existing `POST /attendance/zoom-webhook` (`meeting.participant_joined`) already matches by
`classSession.zoomMeetingId`, which this flow populates the same way the old manual-paste flow did. No
changes were needed there.

## Setup checklist (for whoever provisions the real Zoom credentials)

1. **Server-to-Server OAuth app** (Zoom Marketplace → Build App → Server-to-Server OAuth): scopes
   `meeting:write:admin` (or `meeting:write`) to create meetings, and the ZAK-fetch scope for
   `GET /users/me/token?type=zak` (verify the exact scope name in the Zoom dashboard when creating the app —
   it may be listed under `user_zak:read` or similar; confirm at setup time, not from this doc). Fill
   `ZOOM_ACCOUNT_ID`/`ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET`.
2. **Meeting SDK app** (Zoom Marketplace → Build App → Meeting SDK): fill `ZOOM_SDK_KEY`/`ZOOM_SDK_SECRET`.
3. Confirm the account is **Licensed** (paid) — Basic caps group meetings at 40 minutes, which is real
   friction for a full lecture-length class.
4. The meeting-create `settings` field names used here (`auto_recording`, `join_before_host`, `waiting_room`,
   `mute_upon_entry`, `participant_video`, `approval_type`) are long-stable parts of Zoom's REST API; verify
   against Zoom's current Create Meeting docs when wiring real credentials, since this whole area of Zoom's
   platform has churned recently (see the OBF note above).
