# Auth API Endpoints

This document describes the currently available authentication endpoints in the backend.

> **Planned change (not implemented, 2026-11-19):** once organizations exist, `email` is unique per organization, so login and registration resolve the organization from the request host first (falling back to the default organization), and the access token carries `orgId`. See `documents/14-multi-tenancy-readiness.md` §5. Today `email` is globally unique.

## Base URL

```
http://localhost:5000/api/auth
```

## Cookies

The auth system uses HTTP-only cookies.

| Cookie | Purpose | Path | Notes |
| --- | --- | --- | --- |
| `access_token` | Access token | `/` | Used by protected routes. The cookie lives as long as the refresh cookie (7 days); the JWT inside expires after `JWT_ACCESS_EXPIRES_IN` (15 minutes) and the backend answers an expired one with `data.expired = true`. |
| `refresh_token` | Refresh token | `/api/auth` | Used only by `/refresh`. |

## Response Shapes (Current Implementation)

Current error shapes in use today:

### Success (controllers)

```json
{
	"status": "success",
	"data": {},
	"message": "..."
}
```

### Validation error (middleware)

```json
{
	"status": "error",
	"message": "Validation failed",
	"data": [
		{ "field": "email", "message": "Invalid email address" }
	]
}
```

### Service error (AppError)

```json
{
	"status": "error",
	"message": "Invalid email or password.",
	"code": "INVALID_CREDENTIALS"
}
```

### Auth middleware error (verifyToken)

```json
{
	"status": "error",
	"message": "Token expired. Please refresh.",
	"data": { "expired": true }
}
```

## User Object Shape

Returned in `register`, `login`, `refresh`, and `me`:

```json
{
	"id": "uuid",
	"indexNumber": 1,
	"email": "user@example.com",
	"name": "User Name",
	"role": "STUDENT",
	"phone": "0771234567",
	"nic": "200012345678",
	"createdAt": "2026-05-10T09:32:03.340Z"
}
```

> **`GET /me` additionally returns** the caller's own `barcode` (the global LMS entrance QR value, may be
> `null`) and `setupCompleted` (boolean). These are `me`-only — `register`/`login`/`refresh` omit them.

## Endpoints Summary

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | None | Register a new student account. |
| POST | `/login` | None | Login and set auth cookies. |
| POST | `/refresh` | Refresh cookie | Rotate tokens and reset cookies. |
| POST | `/logout` | None | Clear auth cookies (best-effort). |
| GET | `/me` | Access cookie | Return current user profile. |

## Endpoint Details

### POST `/register`

Creates a new student account and sets auth cookies.

**Request body**

```json
{
	"email": "user@example.com",
	"name": "User Name",
	"password": "Password1",
	"phone": "0771234567",
	"nic": "200012345678"
}
```

**Validation rules**

- `email`: valid email, max 255 chars
- `name`: 2-100 chars
- `password`: 8-72 chars, must include upper, lower, number
- `phone`: optional, must match Sri Lankan format `+94` or `0` + 9 digits
- `nic`: optional, 9 digits + `V/X` or 12 digits

**Success (201)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "Registration successful."
}
```

**Errors**

- 400 validation error (see validation error shape)
- 409 `EMAIL_ALREADY_EXISTS` (service error shape)
- 409 `NIC_ALREADY_EXISTS` (service error shape)
- 409 `CODE_UNAVAILABLE` — registration could not allocate its generated card; retry registration.

### POST `/login`

Authenticates and sets auth cookies.

**Request body**

```json
{
	"email": "user@example.com",
	"password": "Password1"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "Login successful."
}
```

**Errors**

- 400 validation error
- 401 `INVALID_CREDENTIALS` (service error shape)
- 403 `ACCOUNT_DEACTIVATED` (service error shape)

### POST `/refresh`

Rotates refresh token and issues a new access token. Requires `refresh_token` cookie.

The presented token is marked rotated (`RefreshToken.rotatedAt`), not deleted. If the same token is presented again within `REFRESH_REUSE_GRACE_SECONDS` (default 10; `0` disables) it is treated as a duplicate from another tab or a retried request and a fresh pair is issued without revoking anything. Presented after that window, or when the hash is unknown, it is reuse: every refresh token of the user is revoked and `REFRESH_TOKEN_REUSED` is returned. A separate limiter for this route (so silent refreshes cannot exhaust the shared per-address bucket) arrives with the rate-limit keying change; until then it falls under the global limiter.

**Request body**

None

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "Token refreshed successfully."
}
```

**Errors**

- 401 missing refresh cookie
	```json
	{ "status": "error", "message": "No refresh token provided. Please log in." }
	```
- 401 `INVALID_REFRESH_TOKEN` (service error shape)
- 401 `REFRESH_TOKEN_REUSED` (service error shape)
- 403 `ACCOUNT_DEACTIVATED` (service error shape)

### POST `/logout`

Clears cookies and deletes the stored refresh token (best-effort). Always returns 200.

**Request body**

None

**Success (200)**

```json
{
	"status": "success",
	"message": "Logged out successfully."
}
```

### GET `/me`

Returns the authenticated user's profile. Requires `access_token` cookie.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" }
}
```

**Errors**

- 401 missing or invalid access cookie (auth middleware shape)
- 404 `USER_NOT_FOUND` (service error shape)
