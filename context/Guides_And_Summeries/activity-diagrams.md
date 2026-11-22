# LMS System Activity Diagrams

These diagrams are rewritten from the actual backend and frontend code paths. They use the same Mermaid sequence style as the summary doc and include notes for the important branches, guards, and data stores.

## 1. Auth Module

Endpoints:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

```mermaid
sequenceDiagram
    participant Client
    participant AuthRouter
    participant ValidateBody
    participant AuthController
    participant AuthService
    participant Prisma
    participant Cookies

    Client->>AuthRouter: register/login request
    AuthRouter->>ValidateBody: parse Zod schema
    ValidateBody->>AuthController: request body is valid
    AuthController->>AuthService: register() or login()
    AuthService->>Prisma: find user / create user / store refresh token hash
    Prisma-->>AuthService: user + token state
    AuthService-->>AuthController: safe user + token pair
    AuthController->>Cookies: set access + refresh cookies
    AuthController-->>Client: success response

    Client->>AuthController: POST /refresh
    AuthController->>Cookies: read refresh cookie
    AuthController->>AuthService: refreshTokens()
    AuthService->>Prisma: verify hashed refresh token + rotate family
    AuthService-->>AuthController: new token pair
    AuthController->>Cookies: overwrite cookies
    AuthController-->>Client: refreshed session

    Client->>AuthController: POST /logout
    AuthController->>Cookies: read refresh cookie
    AuthController->>AuthService: logout()
    AuthService->>Prisma: delete stored refresh token hash
    AuthController->>Cookies: clear auth cookies
    AuthController-->>Client: logged out
```

Notes:
- `register` always creates a student account; the role defaults to `STUDENT` in the Prisma schema.
- `login` rejects deactivated accounts and uses a vague credential error to avoid leaking whether the email exists.
- Refresh tokens are hashed before storage and are rotated on every refresh.
- Cookies are HTTP-only; the refresh cookie is scoped to `/api/auth`.
- `GET /api/auth/me` requires JWT verification and returns the safe user projection only.

## 2. User Module

```mermaid
sequenceDiagram
    participant Client
    participant UserRouter
    participant VerifyToken
    participant RoleGuard
    participant UserController
    participant UserService
    participant Prisma

    Client->>UserRouter: authenticated user request
    UserRouter->>VerifyToken: verify JWT
    VerifyToken->>RoleGuard: enforce role when needed
    RoleGuard->>UserController: request is allowed
    UserController->>UserService: fetch or update user data
    UserService->>Prisma: query user rows
    Prisma-->>UserService: user record(s)
    UserService-->>UserController: sanitized user data
    UserController-->>Client: JSON response
```

Notes:
- The user module follows the controller/service boundary; controllers do not query Prisma directly.
- Sensitive fields such as passwords are removed before the response is sent.
- Access is role-aware: admin/staff flows can fetch broader data than student self-service flows.

## 3. Class and Class Session Modules

Endpoints:
- `POST /api/classes`
- `GET /api/classes`
- `GET /api/classes/:classId`
- `PATCH /api/classes/:classId`
- `POST /api/classes/:classId/sessions`
- `GET /api/classes/:classId/sessions`
- `GET /api/classes/:classId/sessions/:sessionId`
- `PATCH /api/classes/:classId/sessions/:sessionId`
- `DELETE /api/classes/:classId/sessions/:sessionId`

```mermaid
sequenceDiagram
    participant Client
    participant ClassRouter
    participant ClassController
    participant ClassService
    participant ClassSessionController
    participant ClassSessionService
    participant Prisma
    participant AuditService
    participant StreamService

    Client->>ClassRouter: class create/update/list request
    ClassRouter->>ClassController: route matched
    ClassController->>ClassService: createClass() or updateClass()
    ClassService->>Prisma: create/update Course
    Prisma-->>ClassService: course state
    ClassService->>AuditService: log class mutation
    AuditService-->>ClassService: logged
    ClassService-->>ClassController: course summary
    ClassController-->>Client: class response

    Client->>ClassSessionController: nested /sessions request
    ClassSessionController->>ClassSessionService: create/list/get/update/delete session
    ClassSessionService->>Prisma: read/write ClassSession
    ClassSessionService->>StreamService: broadcast timetable update on create/update/delete
    StreamService-->>ClassSessionService: SSE event published
    ClassSessionService-->>ClassSessionController: session summary
    ClassSessionController-->>Client: session response
```

Notes:
- `classRoutes.use('/:classId/sessions', classSessionRoutes)` means session routes inherit the class ID parameter.
- Admin/staff can create, update, and delete classes and sessions; read routes are broader.
- Deleted sessions are soft-deleted with `deletedAt`, and non-admin readers do not see them.
- Session create/update/delete publishes `TIMETABLE_UPDATED` SSE events through `StreamService`.
- Class and session updates are audited non-blockingly from the controller layer.

## 4. Attendance Module

Endpoints:
- `POST /api/attendance/scan`
- `POST /api/attendance/zoom-webhook`
- `POST /api/attendance/manual`
- `POST /api/attendance/video`
- `GET /api/attendance/session/:sessionId`
- `GET /api/attendance/class/:classId`
- `GET /api/attendance/student/:userId`

```mermaid
sequenceDiagram
    participant Client
    participant AttendanceRouter
    participant AttendanceController
    participant AttendanceService
    participant Prisma
    participant AuditService

    Client->>AttendanceRouter: barcode/manual/video request
    AttendanceRouter->>AttendanceController: route matched
    AttendanceController->>AttendanceService: scanBarcode() / markManualAttendance() / markVideoAttendance()
    AttendanceService->>Prisma: verify session + user + upsert Attendance
    Prisma-->>AttendanceService: attendance record
    AttendanceService-->>AttendanceController: attendance result
    AttendanceController->>AuditService: log attendance mutation
    AuditService-->>AttendanceController: logged
    AttendanceController-->>Client: attendance response

    Client->>AttendanceController: POST /zoom-webhook
    AttendanceController->>AttendanceController: validate Zoom event type
    AttendanceController->>AttendanceService: handleZoomWebhook()
    AttendanceService->>Prisma: match meeting ID, resolve student, upsert attendance
    AttendanceService-->>AttendanceController: webhook handled or ignored
    AttendanceController-->>Client: always 200 for Zoom delivery
```

Notes:
- Barcode, manual, and video attendance all use `upsert` so duplicate scans do not create duplicate rows.
- The Zoom webhook is intentionally unauthenticated at the route level and is filtered by event type and payload validation.
- Video attendance is also stored through the attendance table, using the same unique key as live attendance.
- Query routes support session, course, and student views, with student self-access restricted to the same user unless the caller is staff/admin.

## 5. Exam Module

Endpoints:
- `POST /api/exams`
- `GET /api/exams`
- `GET /api/exams/:id`
- `PATCH /api/exams/:id`
- `DELETE /api/exams/:id`
- `POST /api/exams/:id/upload-url`
- `POST /api/exams/:id/assign-markers`

```mermaid
sequenceDiagram
    participant Client
    participant ExamRouter
    participant ExamController
    participant ExamService
    participant Prisma
    participant StreamService
    participant AuditService

    Client->>ExamRouter: create/list/get/update/delete exam
    ExamRouter->>ExamController: route matched
    ExamController->>ExamService: createExam() / listExams() / getExamById() / updateExam() / deleteExam()
    ExamService->>Prisma: validate course, exam window, payload, paper key
    Prisma-->>ExamService: exam rows
    ExamService->>StreamService: broadcast EXAM_CONTROL on update/delete
    StreamService-->>ExamService: SSE event published
    ExamService-->>ExamController: exam response
    ExamController->>AuditService: log exam mutation
    AuditService-->>ExamController: logged
    ExamController-->>Client: JSON response
```

Notes:
- Exam creation validates that `endTime` is after `startTime` and that the MCQ payload matches the schema.
- Students only receive paper links and MCQ content when the exam window is active; the service strips answer keys from MCQ payloads.
- Paper uploads use presigned R2 URLs and store the R2 key back in the exam row.
- Updating or deleting an exam emits SSE control events so clients can react in real time.
- Marker assignment uses `createMany(..., skipDuplicates: true)` and validates every marker ID before writing.

## 6. Submission Module

Endpoints:
- `POST /api/submissions`
- `PATCH /api/submissions/:id/complete`
- `GET /api/submissions/exam/:examId`
- `PATCH /api/submissions/:id/marks`
- `POST /api/submissions/exam/:examId/publish`

```mermaid
sequenceDiagram
    participant Client
    participant SubmissionRouter
    participant SubmissionController
    participant SubmissionService
    participant Prisma
    participant R2
    participant AuditService
    participant SmsService

    Client->>SubmissionRouter: start submission
    SubmissionRouter->>SubmissionController: route matched
    SubmissionController->>SubmissionService: startSubmission()
    SubmissionService->>Prisma: verify exam window and existing submission
    SubmissionService->>Prisma: create submission row
    alt written or hybrid exam
        SubmissionService->>R2: create presigned PUT URL
        SubmissionService->>Prisma: store answerPdfUrl key
    end
    SubmissionService-->>SubmissionController: submission result
    SubmissionController-->>Client: submission response

    Client->>SubmissionController: PATCH /complete
    SubmissionController->>SubmissionService: completeSubmission()
    SubmissionService->>Prisma: verify owner and exam grace window
    SubmissionService->>Prisma: mark submission COMPLETED
    SubmissionController-->>Client: complete response

    Client->>SubmissionController: PATCH /marks or publish results
    SubmissionController->>SubmissionService: submitMarks() / publishResults()
    SubmissionService->>Prisma: update marks or publish state
    SubmissionService->>AuditService: log grading/publish event
    SubmissionService->>SmsService: notify students when results are published
    SubmissionController-->>Client: grading or publish response
```

Notes:
- The start flow is server-authoritative: exam timing is checked with server time, not client time.
- MCQ exams can auto-grade immediately; written and hybrid exams receive a presigned upload URL for R2.
- `completeSubmission` is idempotent and enforces the owner's upload grace (`exams.uploadGraceSeconds`, default 180 seconds) after exam end for upload finalization.
- Mark submission requires an idempotency key at the route level to prevent double grading on retries.
- Result publishing triggers both audit logging and SMS notifications as non-blocking side effects.

## 7. Payment Module

Endpoints:
- `POST /api/payments/initiate`
- `POST /api/payments/payhere/checkout`
- `POST /api/payments/payhere/notify`
- `GET /api/payments/payhere/status/:id`
- `GET /api/payments`
- `GET /api/payments/my`
- `GET /api/payments/:id`
- `PATCH /api/payments/:id/override`
- `POST /api/payments/bulk-upload`

```mermaid
sequenceDiagram
    participant Client
    participant PaymentRouter
    participant PaymentController
    participant PaymentService
    participant PayHere
    participant Prisma
    participant AuditService
    participant SmsService

    Client->>PaymentRouter: initiate checkout
    PaymentRouter->>PaymentController: route matched
    PaymentController->>PaymentService: initiatePayherePayment()
    PaymentService->>Prisma: verify enrollment and create/upsert pending payment
    PaymentService->>PayHere: build checkout payload + hash
    PaymentService-->>PaymentController: checkoutUrl + payload + payment record
    PaymentController-->>Client: checkout response

    PayHere->>PaymentController: POST /payhere/notify
    PaymentController->>PaymentService: handlePayhereNotify()
    PaymentService->>Prisma: verify merchant, signature, amount, order id
    PaymentService->>Prisma: update payment status and payhereId
    PaymentService-->>PaymentController: updated payment
    PaymentController->>SmsService: send confirmation SMS on success
    PaymentController-->>PayHere: 200 OK

    Client->>PaymentController: override or bulk upload
    PaymentController->>PaymentService: overridePayment() / bulkUploadPayments()
    PaymentService->>Prisma: update payment rows from admin action or spreadsheet
    PaymentController->>AuditService: log payment override / upload
    PaymentController->>SmsService: send per-payment or bulk notification when enabled
    PaymentController-->>Client: payment admin response
```

Notes:
- The checkout flow is idempotent through the route-level `checkIdempotency` middleware.
- The webhook is signature-verified against PayHere config and does not depend on auth cookies.
- Payment status transitions are resolved from PayHere status codes into `PENDING`, `SUCCESS`, or `FAILED`.
- Confirmation SMS and override SMS are best-effort side effects and do not block the response.
- Bulk upload uses in-memory multer storage and a size cap from `PAYMENTS_BULK_UPLOAD_MAX_BYTES`.

## 8. Video Module

Endpoints:
- `POST /api/videos`
- `PATCH /api/videos/:id`
- `DELETE /api/videos/:id`
- `GET /api/videos/class/:classId`
- `GET /api/videos/:id`
- `GET /api/videos/:id/stream`

```mermaid
sequenceDiagram
    participant Client
    participant VideoRouter
    participant VideoController
    participant VideoService
    participant Prisma
    participant Bunny

    Client->>VideoRouter: create/update/delete/list/get video
    VideoRouter->>VideoController: route matched
    VideoController->>VideoService: createVideoRecording() / updateVideoRecording() / deleteVideoRecording() / listVideosByClass() / getVideoById()
    VideoService->>Prisma: verify session, query video row, or mutate video record
    Prisma-->>VideoService: video state
    VideoService-->>VideoController: video summary
    VideoController-->>Client: video response

    Client->>VideoController: GET /:id/stream
    VideoController->>VideoService: generateStreamUrl(videoId, actor)
    VideoService->>Bunny: sign embed URL (token + expiry)
    VideoService-->>VideoController: embedUrl + watermark + expiresAt
    VideoController-->>Client: stream response
```

Notes:
- Video records are attached to existing class sessions; deleted sessions are rejected.
- The `/stream` endpoint binds the Bunny token to `req.ip`, so shared links fail outside the originating IP.
- Deleting a video removes only the database record; the Bunny asset remains untouched.
- Listing videos excludes sessions that were soft-deleted.

## 9. Stream and SSE Module

Endpoints and events:
- `GET /api/stream`
- `TIMETABLE_UPDATED`
- `EXAM_CONTROL`
- `RESULTS_PUBLISHED`

```mermaid
sequenceDiagram
    participant Client
    participant StreamRouter
    participant StreamController
    participant StreamService
    participant Redis

    Client->>StreamRouter: GET /api/stream
    StreamRouter->>StreamController: authenticated SSE request
    StreamController->>StreamService: registerConnection(userId, role, res)
    StreamService-->>Client: event stream kept open with heartbeat

    StreamService->>Redis: subscribe/publish SSE event payloads
    Redis-->>StreamService: event message
    StreamService-->>Client: forward event to matching audience
```

Notes:
- SSE connections are authenticated and long-lived; the server sends heartbeat messages to keep them alive.
- The service uses Redis pub/sub when available and falls back to local instance delivery if Redis is unavailable.
- Audience filtering can target user IDs, roles, or course-scoped events.
- Exam updates, timetable updates, and published results are all pushed through this channel.

## 10. Audit and Logging Module

Endpoints:
- `GET /api/audit-logs`

```mermaid
sequenceDiagram
    participant AnyController
    participant AuditService
    participant Prisma
    participant Pino
    participant Client

    AnyController->>AuditService: log(action, metadata, context)
    AuditService->>Prisma: create AuditLog row
    Prisma-->>AuditService: saved
    AuditService->>Pino: emit structured log line

    Client->>AuditController: GET /api/audit-logs
    AuditController->>AuditService: listAuditLogs(query)
    AuditService->>Prisma: findMany + count with filters
    Prisma-->>AuditService: paginated rows
    AuditService-->>AuditController: data + count
    AuditController-->>Client: paginated audit response
```

Notes:
- The controller no longer imports Prisma directly; the service owns the database query.
- Audit writes are fire-and-forget and never block the main mutation response.
- The list endpoint supports action, actor, target, and date-range filters.

## 11. Request Pipeline and Middleware Order

```mermaid
sequenceDiagram
    participant Client
    participant Nginx
    participant ExpressApp
    participant Helmet
    participant Cors
    participant JsonParser
    participant RateLimiter
    participant VerifyToken
    participant Idempotency
    participant Validate
    participant Controller
    participant Service
    participant Prisma

    Client->>Nginx: HTTPS request
    Nginx->>ExpressApp: proxy to backend
    ExpressApp->>Helmet: security headers
    ExpressApp->>Cors: strict frontend origin only
    ExpressApp->>JsonParser: parse JSON / urlencoded body
    ExpressApp->>RateLimiter: apply global or auth limiter
    ExpressApp->>VerifyToken: authenticate protected routes
    ExpressApp->>Idempotency: protect high-stakes mutations when configured
    ExpressApp->>Validate: parse Zod schema
    Validate->>Controller: invoke handler
    Controller->>Service: business logic
    Service->>Prisma: database read/write
    Prisma-->>Service: result
    Service-->>Controller: domain object
    Controller-->>Client: HTTP response
```

Notes:
- `app.set('trust proxy', 1)` is enabled, so `req.ip` and forwarded headers are respected behind a proxy.
- The global health check is exposed at `/api/health`.
- The error handler is mounted last.

## 12. Database and Infrastructure Module

```mermaid
sequenceDiagram
    participant Developer
    participant PrismaCLI
    participant MigrationFolder
    participant Postgres
    participant App
    participant Redis
    participant Worker

    Developer->>PrismaCLI: prisma generate / migrate deploy
    PrismaCLI->>MigrationFolder: read schema and migrations
    MigrationFolder-->>PrismaCLI: generated SQL intent
    PrismaCLI->>Postgres: apply migration
    Postgres-->>PrismaCLI: migration result
    App->>Postgres: query through Prisma client
    App->>Redis: rate limit / queue / SSE pub-sub / idempotency lock
    Worker->>Redis: dequeue BullMQ jobs
    Worker->>Postgres: persist job outcomes
```

Notes:
- The Prisma schema is the source of truth for relational data and unique constraints.
- Redis is shared by rate limiting, queueing, SSE pub/sub, and idempotency locks.
- Background jobs are handled by a separate worker process, not the HTTP server.

## 13. Frontend Module

Sections:
- `/app/page.tsx`
- `/app/home/page.tsx`
- `/app/auth/login/page.tsx`
- `/app/auth/signup/page.tsx`
- `/app/layout.tsx`

```mermaid
sequenceDiagram
    participant User
    participant NextLayout
    participant LandingPage
    participant HomePage
    participant LoginPage
    participant SignupPage
    participant BackendAPI

    User->>NextLayout: open site
    NextLayout->>LandingPage: render root route
    LandingPage-->>User: currently empty shell in app/page.tsx

    User->>HomePage: visit /home
    HomePage->>HomePage: render Nav, Grid, StudentReviews, Header, CourseCard list, Footer
    HomePage-->>User: marketing/home page

    User->>LoginPage: visit /auth/login
    LoginPage->>LoginPage: render form fields and validation via react-hook-form
    LoginPage->>BackendAPI: submit registration-style form data
    BackendAPI-->>LoginPage: response handled in UI logic

    User->>SignupPage: visit /auth/signup
    SignupPage->>SignupPage: render left animation panel and right auth form shell
    SignupPage-->>User: signup screen
```

Notes:
- `app/layout.tsx` applies the Poppins font and global metadata for the app shell.
- `app/page.tsx` is currently an empty centered container, so the root route does not yet show functional content.
- `app/home/page.tsx` is the visible marketing page with navigation, reviews, header, course cards, and footer.
- The `/auth/login` UI currently renders registration-style fields in the codebase, so the route name and visible form content are not perfectly aligned.

If you want, I can split this into one Markdown file per module next, or turn any single section into a deeper endpoint-level diagram with request/response notes.
