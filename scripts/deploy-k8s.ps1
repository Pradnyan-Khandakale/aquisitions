# ==============================================================================
# Acquisitions API - Kubernetes Deployment Orchestration Script (PowerShell)
#
# Enforces safe ordering & safety gates:
#   1. Apply Namespace
#   2. Validate Secrets & Database Target Safety (Rejects production/neondb)
#   3. Apply ConfigMap
#   4. Apply & Execute Database Migration Job
#   5. Wait for Migration Job Completion
#   6. Apply/Update Application Deployment & Service
#   7. Wait for Application Rollout Completion
# ==============================================================================

param(
    [string]$ImageTag = "",
    [string]$DatabaseUrl = ""
)

$ErrorActionPreference = "Stop"

if (-not $ImageTag) {
    try {
        $ImageTag = git rev-parse --short HEAD 2>$null
    } catch {
        $ImageTag = "7f23d58"
    }
    if (-not $ImageTag) { $ImageTag = "7f23d58" }
}

if (-not $DatabaseUrl -and $env:VALIDATION_DATABASE_URL) {
    $DatabaseUrl = $env:VALIDATION_DATABASE_URL
}

$Namespace = "acquisitions"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$K8sDir = Join-Path $RootDir "k8s"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Deploying Acquisitions API to Kubernetes" -ForegroundColor Cyan
Write-Host "   Namespace: $Namespace" -ForegroundColor Cyan
Write-Host "   Target Image Tag: $ImageTag" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

# 1. Ensure Namespace exists
Write-Host "[1/5] Applying Namespace..." -ForegroundColor Yellow
kubectl apply -f (Join-Path $K8sDir "namespace.yaml")

# 2. Check Secrets & Database Target Safety
Write-Host "[2/5] Verifying Kubernetes Secrets & Database Safety Gate..." -ForegroundColor Yellow
$secretCheck = kubectl get secret acquisitions-secrets -n $Namespace 2>$null
if (-not $secretCheck) {
    if ($DatabaseUrl) {
        Write-Host "Creating 'acquisitions-secrets' from provided validation database URL..." -ForegroundColor Cyan
        try {
            $parsedUri = [System.Uri]$DatabaseUrl
            $candidateTarget = $parsedUri.AbsolutePath.TrimStart('/')
        } catch {
            $candidateTarget = ""
        }
        if (-not $candidateTarget -or $candidateTarget -eq "neondb" -or $candidateTarget -eq "postgres" -or ($candidateTarget -match "prod") -or ($candidateTarget -notmatch "test")) {
            Write-Host "FATAL SAFETY VIOLATION: Database target '$candidateTarget' is NOT an isolated test database." -ForegroundColor Red
            Write-Host "Minikube validation requires an explicit non-production database (e.g. acquisitions_test)." -ForegroundColor Red
            exit 1
        }
        $jwt = "local_minikube_secure_jwt_secret_32bytes"
        $arcjet = "ajkey_local_mock_token_for_validation"
        $secYaml = kubectl create secret generic acquisitions-secrets -n $Namespace --from-literal="DATABASE_URL=$DatabaseUrl" --from-literal="JWT_SECRET=$jwt" --from-literal="ARCJET_KEY=$arcjet" --dry-run=client -o yaml
        $secYaml | kubectl apply -f -
    } else {
        Write-Host "FATAL: Secret 'acquisitions-secrets' not found in namespace '$Namespace'." -ForegroundColor Red
        Write-Host "Minikube deployment validation MUST target a dedicated non-production/test database." -ForegroundColor Red
        Write-Host "Provide a safe connection string via VALIDATION_DATABASE_URL or create the secret manually:" -ForegroundColor Red
        Write-Host "kubectl apply -f <your-safe-secrets.yaml>" -ForegroundColor Red
        exit 1
    }
}

# Safe inspection of active Secret target (credentials redacted)
$dbB64 = (kubectl get secret acquisitions-secrets -n $Namespace -o "jsonpath={.data.DATABASE_URL}").Trim()
try {
    $rawUrl = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($dbB64))
    $parsed = [System.Uri]$rawUrl
    $dbTarget = $parsed.AbsolutePath.TrimStart('/')
} catch {
    $dbTarget = "unknown"
}

Write-Host "Database target:" -ForegroundColor Cyan
Write-Host "$dbTarget" -ForegroundColor White

if ($dbTarget -eq "neondb" -or $dbTarget -eq "postgres" -or ($dbTarget -match "prod") -or ($dbTarget -notmatch "test")) {
    Write-Host "FATAL SAFETY VIOLATION: Database target '$dbTarget' is an unsafe production/default database!" -ForegroundColor Red
    Write-Host "Minikube validation MUST target a dedicated non-production/test database (e.g. acquisitions_test)." -ForegroundColor Red
    Write-Host "Aborting deployment to protect production data." -ForegroundColor Red
    exit 1
}
Write-Host "Database target safety confirmed: '$dbTarget' is an approved non-production database." -ForegroundColor Green

# 3. Apply ConfigMap
Write-Host "[3/5] Applying ConfigMap..." -ForegroundColor Yellow
kubectl apply -f (Join-Path $K8sDir "configmap.yaml")

# 4. Run Migration Job
Write-Host "[4/5] Executing Database Migration Job..." -ForegroundColor Yellow
kubectl delete job acquisitions-migration -n $Namespace --ignore-not-found=true

kubectl apply -f (Join-Path $K8sDir "migration-job.yaml")

Write-Host "Waiting for migration Job to finish..." -ForegroundColor Yellow
$migrationWait = kubectl wait --for=condition=complete job/acquisitions-migration -n $Namespace --timeout=120s 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Database migration FAILED. Aborting application rollout." -ForegroundColor Red
    kubectl describe job acquisitions-migration -n $Namespace
    kubectl logs -n $Namespace -l app.kubernetes.io/name=acquisitions-migration --tail=50
    exit 1
}
Write-Host "Database migration completed successfully." -ForegroundColor Green

# 5. Apply Deployment, Service, and Ingress
Write-Host "[5/5] Applying Application Deployment, Service, and Ingress..." -ForegroundColor Yellow
kubectl apply -f (Join-Path $K8sDir "service.yaml")
kubectl apply -f (Join-Path $K8sDir "ingress.yaml")
kubectl apply -f (Join-Path $K8sDir "deployment.yaml")

# 6. Verify Rollout
Write-Host "Waiting for Application Rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/acquisitions-app -n $Namespace --timeout=120s

Write-Host "====================================================================" -ForegroundColor Green
Write-Host "Deployment successfully rolled out to '$Namespace'!" -ForegroundColor Green
kubectl get pods,svc,jobs -n $Namespace
Write-Host "====================================================================" -ForegroundColor Green
