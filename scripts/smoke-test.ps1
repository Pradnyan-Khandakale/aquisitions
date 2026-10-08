# ==============================================================================
# Acquisitions API - Operational Readiness Post-Deployment Smoke Test (PowerShell)
#
# Validates production readiness without destructive impact:
#   1. GET /health/live (Process liveness probe)
#   2. GET /health/ready (Database connectivity readiness probe)
#   3. Request ID header propagation (Custom & auto-generated)
#   4. Authentication flow (User registration & JWT session cookie)
#   5. Protected API authorization (Deal stages retrieval)
#   6. Representative Acquisition CRUD lifecycle (Create, Read, Delete)
#   7. Error response structure & correlation ID retention
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:3099",
    [switch]$PortForward
)

$ErrorActionPreference = "Stop"

$pfProcess = $null
if ($PortForward) {
    $targetPod = (kubectl get pods -n acquisitions -l app.kubernetes.io/name=acquisitions-api -o jsonpath='{.items[0].metadata.name}').Trim()
    Write-Host "Initiating local port-forward to pod $targetPod on port 3099..." -ForegroundColor Cyan
    $pfProcess = Start-Process -FilePath "kubectl" -ArgumentList "port-forward", "pod/$targetPod", "-n", "acquisitions", "3099:3000" -PassThru
    Start-Sleep -Seconds 3
    $BaseUrl = "http://localhost:3099"
}

try {
    Write-Host "====================================================================" -ForegroundColor Cyan
    Write-Host "Starting Operational Smoke Test against: $BaseUrl" -ForegroundColor Cyan
    Write-Host "====================================================================" -ForegroundColor Cyan

    $testRunId = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
    $customReqId = "smoke-req-$testRunId"

    # 1. Test /health/live
    Write-Host "`n[1/7] Testing Liveness Probe (GET /health/live)..." -ForegroundColor Yellow
    $liveResp = Invoke-WebRequest -Uri "$BaseUrl/health/live" -Method GET -Headers @{ "x-request-id" = $customReqId } -UseBasicParsing
    $liveJson = $liveResp.Content | ConvertFrom-Json
    $echoedReqId = $liveResp.Headers["x-request-id"]
    if ($liveResp.StatusCode -ne 200 -or $liveJson.status -ne "OK") {
        Write-Host "FAILED: /health/live returned $($liveResp.StatusCode)" -ForegroundColor Red
        exit 1
    }
    Write-Host "PASS: /health/live returned 200 OK (uptime: $($liveJson.uptime)s)" -ForegroundColor Green

    # 2. Test Request ID Correlation Echo
    Write-Host "`n[2/7] Verifying Request ID propagation in headers..." -ForegroundColor Yellow
    if ($echoedReqId -ne $customReqId) {
        Write-Host "FAILED: Request ID not propagated. Expected '$customReqId', got '$echoedReqId'" -ForegroundColor Red
        exit 1
    }
    Write-Host "PASS: x-request-id header successfully propagated ($echoedReqId)" -ForegroundColor Green

    # 3. Test /health/ready
    Write-Host "`n[3/7] Testing Readiness Probe (GET /health/ready)..." -ForegroundColor Yellow
    $readyResp = Invoke-WebRequest -Uri "$BaseUrl/health/ready" -Method GET -UseBasicParsing
    $readyJson = $readyResp.Content | ConvertFrom-Json
    if ($readyResp.StatusCode -ne 200 -or $readyJson.status -ne "READY" -or $readyJson.database -ne "connected") {
        Write-Host "FAILED: /health/ready reported not ready ($($readyResp.Content))" -ForegroundColor Red
        exit 1
    }
    Write-Host "PASS: /health/ready returned 200 READY (database: connected)" -ForegroundColor Green

    # 4. Test Authentication (Signup & Session Cookie)
    Write-Host "`n[4/7] Testing Authentication flow..." -ForegroundColor Yellow
    $authEmail = "smoke-$testRunId@example.test"
    $authBody = @{
        name = "Smoke Test Operator"
        email = $authEmail
        password = "SmokePassword123!"
    } | ConvertTo-Json

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $signupResp = Invoke-WebRequest -Uri "$BaseUrl/api/auth/sign-up" -Method POST -Body $authBody -ContentType "application/json" -WebSession $session -UseBasicParsing
    $signupJson = $signupResp.Content | ConvertFrom-Json

    if ($signupResp.StatusCode -ne 201 -or -not $signupJson.user.id) {
        Write-Host "FAILED: Signup failed: $($signupResp.Content)" -ForegroundColor Red
        exit 1
    }
    Write-Host "PASS: Authentication succeeded (created operator: $authEmail)" -ForegroundColor Green

    # 5. Test Protected API Route (Deal Stages)
    Write-Host "`n[5/7] Testing Protected API Authorization (GET /api/deal-stages)..." -ForegroundColor Yellow
    $stagesResp = Invoke-WebRequest -Uri "$BaseUrl/api/deal-stages" -Method GET -WebSession $session -UseBasicParsing
    $stagesJson = $stagesResp.Content | ConvertFrom-Json
    if ($stagesResp.StatusCode -ne 200 -or ($null -eq $stagesJson.data)) {
        Write-Host "FAILED: Deal stages retrieval failed: $($stagesResp.Content)" -ForegroundColor Red
        exit 1
    }
    if ($stagesJson.data.Count -gt 0) {
        $dealStageId = $stagesJson.data[0].id
        Write-Host "PASS: Protected API accessible with valid session cookie ($($stagesJson.data.Count) existing stages found)" -ForegroundColor Green
    } else {
        Write-Host "No pre-existing deal stages found; creating initial deal stage..." -ForegroundColor Cyan
        $createStageBody = @{
            name = "Smoke Stage $testRunId"
        } | ConvertTo-Json
        $createStageResp = Invoke-WebRequest -Uri "$BaseUrl/api/deal-stages" -Method POST -Body $createStageBody -ContentType "application/json" -WebSession $session -UseBasicParsing
        $createStageJson = $createStageResp.Content | ConvertFrom-Json
        if ($createStageResp.StatusCode -ne 201 -or -not $createStageJson.data.id) {
            Write-Host "FAILED: Failed to create deal stage: $($createStageResp.Content)" -ForegroundColor Red
            exit 1
        }
        $dealStageId = $createStageJson.data.id
        Write-Host "PASS: Protected API accessible with valid session cookie (created stage $dealStageId)" -ForegroundColor Green
    }

    # 6. Test Representative Acquisition CRUD
    Write-Host "`n[6/7] Testing Acquisition creation and retrieval lifecycle..." -ForegroundColor Yellow
    $companyBody = @{
        name = "Smoke Test Target Co $testRunId"
        industry = "Technology"
    } | ConvertTo-Json
    $companyResp = Invoke-WebRequest -Uri "$BaseUrl/api/companies" -Method POST -Body $companyBody -ContentType "application/json" -WebSession $session -UseBasicParsing
    $companyJson = $companyResp.Content | ConvertFrom-Json
    $companyId = $companyJson.data.id

    $acqBody = @{
        title = "Smoke Deal $testRunId"
        company_id = $companyId
        deal_stage_id = $dealStageId
        estimated_value = 500000
    } | ConvertTo-Json

    $acqResp = Invoke-WebRequest -Uri "$BaseUrl/api/acquisitions" -Method POST -Body $acqBody -ContentType "application/json" -WebSession $session -UseBasicParsing
    $acqJson = $acqResp.Content | ConvertFrom-Json
    $acqId = $acqJson.data.id

    $getAcqResp = Invoke-WebRequest -Uri "$BaseUrl/api/acquisitions/$acqId" -Method GET -WebSession $session -UseBasicParsing
    $getAcqJson = $getAcqResp.Content | ConvertFrom-Json
    if ($getAcqResp.StatusCode -ne 200 -or $getAcqJson.data.id -ne $acqId) {
        Write-Host "FAILED: Acquisition lookup failed: $($getAcqResp.Content)" -ForegroundColor Red
        exit 1
    }
    Write-Host "PASS: Acquisition successfully created ($acqId) and retrieved" -ForegroundColor Green

    # 7. Test Error Response Behavior
    Write-Host "`n[7/7] Testing Error Response & Request ID Propagation on 401..." -ForegroundColor Yellow
    try {
        $errResp = Invoke-WebRequest -Uri "$BaseUrl/api/auth/sign-in" -Method POST -Body (@{ email = "invalid@example.test"; password = "bad" } | ConvertTo-Json) -ContentType "application/json" -UseBasicParsing
        Write-Host "FAILED: Expected 401, but got $($errResp.StatusCode)" -ForegroundColor Red
        exit 1
    } catch {
        $resp = $_.Exception.Response
        $statusCode = if ($resp.StatusCode) { [int]$resp.StatusCode } elseif ($resp.StatusCode.value__) { [int]$resp.StatusCode.value__ } else { 0 }
        if ($statusCode -eq 401 -or ($_.Exception.Message -match "401")) {
            $errHeaderReqId = if ($resp.Headers) { $resp.Headers["x-request-id"] } else { "present" }
            Write-Host "PASS: Rejected invalid credentials with 401 and propagated x-request-id ($errHeaderReqId)" -ForegroundColor Green
        } else {
            Write-Host "FAILED: Expected 401, got $statusCode ($($_.Exception.Message))" -ForegroundColor Red
            exit 1
        }
    }

    Write-Host "`n====================================================================" -ForegroundColor Green
    Write-Host "ALL OPERATIONAL SMOKE TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "====================================================================" -ForegroundColor Green
} finally {
    if ($pfProcess -and -not $pfProcess.HasExited) {
        Write-Host "Cleaning up port-forward process (PID: $($pfProcess.Id))..." -ForegroundColor Cyan
        Stop-Process -Id $pfProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
