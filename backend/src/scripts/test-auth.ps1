# Auth endpoint smoke tests (PowerShell)
# Run: pwsh -File src/scripts/test-auth.ps1
# Server must be running on port 5000.

$BASE = "http://localhost:5000/api/auth"
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Auth System — Smoke Tests" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

function Test-Endpoint {
    param($label, $method, $url, $body, $expectedStatus)
    try {
        $params = @{ Uri = $url; Method = $method; WebSession = $session; ContentType = "application/json" }
        if ($body) { $params["Body"] = ($body | ConvertTo-Json) }
        $r = Invoke-WebRequest @params -ErrorAction Stop
        $json = $r.Content | ConvertFrom-Json
        Write-Host "  ✅ [$expectedStatus] $label" -ForegroundColor Green
        return $json
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $body = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($code -eq $expectedStatus) {
            Write-Host "  ✅ [$code] $label (expected error)" -ForegroundColor Green
        } else {
            Write-Host "  ❌ [$code] $label — $($body.message)" -ForegroundColor Red
        }
        return $body
    }
}

# ── Test 1: Validation rejects bad input ─────────────────────
Write-Host "── Validation ──" -ForegroundColor Yellow
Test-Endpoint "Register with missing fields" "POST" "$BASE/register" @{ email = "not-an-email" } 400 | Out-Null
Test-Endpoint "Register with weak password" "POST" "$BASE/register" @{ email = "t@t.com"; name = "Test"; password = "weak" } 400 | Out-Null

# ── Test 2: Register a new user ──────────────────────────────
Write-Host "`n── Registration ──" -ForegroundColor Yellow
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$testEmail = "smoketest.$ts@lms.test"

$registered = Test-Endpoint "Register new student" "POST" "$BASE/register" @{
    email    = $testEmail
    name     = "Smoke Test User"
    password = "Password1"
    phone    = "0771234567"
} 201

Write-Host "     → user id: $($registered.data.id)" -ForegroundColor DarkGray
Write-Host "     → role:    $($registered.data.role)" -ForegroundColor DarkGray

# ── Test 3: Duplicate registration ───────────────────────────
Test-Endpoint "Register duplicate email" "POST" "$BASE/register" @{
    email    = $testEmail
    name     = "Dupe"
    password = "Password1"
} 409 | Out-Null

# ── Test 4: Login ─────────────────────────────────────────────
Write-Host "`n── Login ──" -ForegroundColor Yellow
Test-Endpoint "Login with wrong password" "POST" "$BASE/login" @{ email = $testEmail; password = "WrongPass1" } 401 | Out-Null

$loggedIn = Test-Endpoint "Login with correct credentials" "POST" "$BASE/login" @{
    email    = $testEmail
    password = "Password1"
} 200

Write-Host "     → cookies: $($session.Cookies.Count)" -ForegroundColor DarkGray

# ── Test 5: /me requires auth ─────────────────────────────────
Write-Host "`n── Protected Endpoints ──" -ForegroundColor Yellow
$me = Test-Endpoint "GET /me (authenticated)" "GET" "$BASE/me" $null 200
Write-Host "     → email: $($me.data.email)" -ForegroundColor DarkGray

# ── Test 6: Token refresh ─────────────────────────────────────
Write-Host "`n── Token Refresh ──" -ForegroundColor Yellow
Test-Endpoint "POST /refresh (with cookie)" "POST" "$BASE/refresh" $null 200 | Out-Null

# ── Test 7: Logout ───────────────────────────────────────────
Write-Host "`n── Logout ──" -ForegroundColor Yellow
Test-Endpoint "POST /logout" "POST" "$BASE/logout" $null 200 | Out-Null

# Verify /me fails after logout
Test-Endpoint "GET /me (after logout — expect 401)" "GET" "$BASE/me" $null 401 | Out-Null

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  All tests passed!`n" -ForegroundColor Cyan
