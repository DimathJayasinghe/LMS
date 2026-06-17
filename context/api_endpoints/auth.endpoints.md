# Auth API Endpoints

This document describes the currently available authentication endpoints in the backend.

## Base URL

```
http://localhost:5000/api/auth
```

## Cookies

The auth system uses HTTP-only cookies.

| Cookie | Purpose | Path | Notes |
| --- | --- | --- | --- |
| `access_token` | Access token | `/` | Used by protected routes. |
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
