# ==============================================================================
# Acquisitions API - Kubernetes Deployment Orchestration Script (PowerShell)
#
# Enforces safe ordering & safety gates:
#   1. Resolve Authoritative Image Tag (Explicit argument or active Git HEAD)
#   2. Apply Namespace
#   3. Validate Secrets & Database Target Safety (Rejects production/neondb)
#   4. Render Manifests via Native Ephemeral Kustomize Overlay
#   5. Apply & Execute Database Migration Job
#   6. Wait for Migration Job Completion
#   7. Apply Application Workloads (Deployment, Service, Ingress)
#   8. Wait for Application Rollout Completion
# ==============================================================================

param(
    [string]$ImageTag = "",
    [string]$DatabaseUrl = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not $ImageTag) {
    try {
        $ImageTag = (git rev-parse HEAD 2>$null)
    } catch {
        $ImageTag = ""
    }
}

if (-not $ImageTag) {
    Write-Host "FATAL: Image tag was not provided and could not be safely derived from Git." -ForegroundColor Red
    Write-Host "Specify an explicit immutable image tag: .\scripts\deploy-k8s.ps1 -ImageTag <IMAGE_TAG>" -ForegroundColor Red
    exit 1
}

if ($ImageTag -eq "latest") {
    Write-Host "FATAL SAFETY VIOLATION: Tag 'latest' is forbidden as a deployment source of truth." -ForegroundColor Red
    Write-Host "Deployments require an explicit immutable commit SHA tag." -ForegroundColor Red
    exit 1
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
Write-Host "   Authoritative Release Tag: $ImageTag" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "   Mode: DRY RUN (Client validation only)" -ForegroundColor Yellow
}
Write-Host "====================================================================" -ForegroundColor Cyan

# Create ephemeral Kustomize overlay to render manifests with authoritative ImageTag
$procId = [System.Diagnostics.Process]::GetCurrentProcess().Id
$overlayDir = Join-Path $RootDir (".k8s-overlay-tmp-$procId")
New-Item -ItemType Directory -Path $overlayDir -Force | Out-Null

try {
    $kustomizeContent = @"
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../k8s
images:
  - name: ghcr.io/pradnyan-khandakale/aquisitions
    newTag: "$ImageTag"
  - name: ghcr.io/pradnyan-khandakale/aquisitions-migration
    newTag: "$ImageTag"
"@
    Set-Content -Path (Join-Path $overlayDir "kustomization.yaml") -Value $kustomizeContent

    Write-Host "Rendering manifests via native Kustomize overlay..." -ForegroundColor Yellow
    $renderedString = (kubectl kustomize $overlayDir | Out-String)

    if ($DryRun) {
        Write-Host "Performing dry-run client validation on rendered manifests..." -ForegroundColor Yellow
        $renderedString | kubectl apply --dry-run=client -f -
        Write-Host "Dry-run validation succeeded for release $ImageTag." -ForegroundColor Green
        return
    }

    $docs = $renderedString -split '(?m)^---\s*$' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    $jobDoc = ($docs | Where-Object { $_ -match '(?m)^\s*kind:\s*Job\b' }) -join "`n---`n"
    $appDocs = ($docs | Where-Object { $_ -notmatch '(?m)^\s*kind:\s*Job\b' }) -join "`n---`n"

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
    Write-Host "[4/5] Executing Database Migration Job (Tag: $ImageTag)..." -ForegroundColor Yellow
    kubectl delete job acquisitions-migration -n $Namespace --ignore-not-found=true
    $jobDoc | kubectl apply -f -

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
    Write-Host "[5/5] Applying Application Workloads (Tag: $ImageTag)..." -ForegroundColor Yellow
    $appDocs | kubectl apply -f -

    # 6. Verify Rollout
    Write-Host "Waiting for Application Rollout..." -ForegroundColor Yellow
    kubectl rollout status deployment/acquisitions-app -n $Namespace --timeout=120s

    Write-Host "====================================================================" -ForegroundColor Green
    Write-Host "Deployment successfully rolled out to '$Namespace'!" -ForegroundColor Green
    kubectl get pods,svc,jobs -n $Namespace
    Write-Host "====================================================================" -ForegroundColor Green
} finally {
    if (Test-Path $overlayDir) {
        Remove-Item -Recurse -Force $overlayDir -ErrorAction SilentlyContinue
    }
}
