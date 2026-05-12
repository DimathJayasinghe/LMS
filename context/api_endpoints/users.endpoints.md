# Users API Endpoints

This document describes the currently available user management endpoints in the backend.

## Base URL

```
http://localhost:5000/api/users
```

## Auth

All users endpoints require the `access_token` cookie.

## Roles (Current Implementation)

The Prisma enum currently uses `ADMIN`, `STAFF`, `MARKER`, and `STUDENT`.

Temporary mapping for Step 4:

- `ADMIN` = Super Admin (full access, role changes)
- `STAFF` = Admin (daily ops, no role changes)

## Response Shapes (Current Implementation)

There are two error shapes in use today:

### Success (controllers)

```json
{
	"status": "success",
	"data": {},
	"message": "..."
}
```

### List success (arrays)

```json
{
	"status": "success",
	"data": [],
	"count": 0
}
```

### Validation error (middleware)

```json
{
	"status": "error",
	"message": "Validation failed",
	"data": [
		{ "field": "page", "message": "Expected number" }
	]
}
```

### Service error (AppError)

```json
{
	"success": false,
	"error": {
		"code": "USER_NOT_FOUND",
		"message": "User not found."
	}
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

Returned in list and detail endpoints:

```json
{
	"id": "uuid",
	"indexNumber": 1,
	"email": "user@example.com",
	"name": "User Name",
	"role": "STUDENT",
	"phone": "0771234567",
	"nic": "200012345678",
	"barcode": "BC-001",
	"deletedAt": null,
	"createdAt": "2026-05-12T06:00:00.000Z"
}
```

## Endpoints Summary

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/` | ADMIN, STAFF | List users (paginated, filterable). |
| GET | `/me` | Any authenticated | Get current user profile. |
| GET | `/:id` | ADMIN, STAFF | Get a user by id. |
| PATCH | `/:id/role` | ADMIN | Update user role. |
| PATCH | `/:id/status` | ADMIN, STAFF | Activate or deactivate a user. |
| PATCH | `/:id/barcode` | ADMIN, STAFF | Assign a barcode to a user. |

## Endpoint Details

### GET `/`

List users with pagination and filters.

**Query params**

- `page`: integer, default `1`
- `limit`: integer, default `20`, max `100`
- `role`: one of `ADMIN`, `STAFF`, `MARKER`, `STUDENT`
- `status`: `active` | `inactive` | `all` (default `active`)
- `search`: matches name, email, nic, barcode, and indexNumber

**Success (200)**

```json
{
	"status": "success",
	"data": ["...users"],
	"count": 42
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)

### GET `/me`

Returns the current authenticated user profile.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" }
}
```

**Errors**

- 401 auth middleware error
- 404 `USER_NOT_FOUND` (service error shape)

### GET `/:id`

Returns the user profile by id.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" }
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/role`

Updates the user's role. ADMIN only.

**Request body**

```json
{
	"role": "MARKER"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "User role updated successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/status`

Activates or deactivates a user.

**Request body**

```json
{
	"isActive": true
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "User activated successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/barcode`

Assigns a barcode to a user.

**Request body**

```json
{
	"barcode": "BC-2026-001"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "Barcode assigned successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `USER_NOT_FOUND` (service error shape)
- 409 `BARCODE_IN_USE` (service error shape)
