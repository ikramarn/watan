param(
    [string]$Namespace = "taxi",
    [string]$Release = "taxi",
    [string]$HostIp = ""
)

$ErrorActionPreference = "Stop"

function Assert-LastExit {
    param(
        [string]$Step
    )
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

function Get-PreferredHostIp {
    $defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" |
        Sort-Object -Property RouteMetric |
        Select-Object -First 1

    if (-not $defaultRoute) {
        throw "Could not find default IPv4 route to detect host IP."
    }

    $ip = Get-NetIPAddress -InterfaceIndex $defaultRoute.InterfaceIndex -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } |
        Select-Object -ExpandProperty IPAddress -First 1

    if (-not $ip) {
        throw "Could not determine host IPv4 address from default interface."
    }

    return $ip
}

Write-Host "Validating kubectl + helm..."
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    throw "kubectl is required but was not found in PATH."
}
if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    throw "helm is required but was not found in PATH."
}

$currentContext = kubectl config current-context
Write-Host "Current kubectl context: $currentContext"

if ([string]::IsNullOrWhiteSpace($HostIp)) {
    $HostIp = Get-PreferredHostIp
}
Write-Host "Using host IP: $HostIp"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$chartDir = Join-Path $repoRoot "deploy/helm/taxi"
$resourcePrefix = "taxi"

Write-Host "Building backend image taxi-backend:local ..."
docker build -t taxi-backend:local $backendDir
Assert-LastExit -Step "Docker image build"

$corsCsv = "http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081,http://$HostIp:8081,http://$HostIp:19006"
$overrideFile = Join-Path $env:TEMP "taxi-values-override.yaml"
@"
env:
    corsOriginsCsv: "$corsCsv"
"@ | Set-Content -Path $overrideFile -Encoding UTF8

Write-Host "Deploying helm release '$Release' into namespace '$Namespace' ..."
helm upgrade --install $Release $chartDir `
    --namespace $Namespace `
    --create-namespace `
    --set image.repository=taxi-backend `
    --set image.tag=local `
    -f $overrideFile
Assert-LastExit -Step "Helm deploy"

Remove-Item $overrideFile -ErrorAction SilentlyContinue

Write-Host "Restarting API deployment to pick up rebuilt local image tag ..."
kubectl -n $Namespace rollout restart deployment/$resourcePrefix-api
Assert-LastExit -Step "API rollout restart"

Write-Host "Waiting for deployments to become ready..."
kubectl -n $Namespace rollout status deployment/$resourcePrefix-mongodb --timeout=180s
Assert-LastExit -Step "MongoDB rollout"
kubectl -n $Namespace rollout status deployment/$resourcePrefix-redis --timeout=180s
Assert-LastExit -Step "Redis rollout"
kubectl -n $Namespace rollout status deployment/$resourcePrefix-api --timeout=240s
Assert-LastExit -Step "API rollout"

$nodePort = kubectl -n $Namespace get svc $resourcePrefix-api -o jsonpath="{.spec.ports[0].nodePort}"
Assert-LastExit -Step "Read API service nodePort"
$backendUrl = "http://${HostIp}:$nodePort"

Write-Host ""
Write-Host "Deployment complete."
Write-Host "Backend URL for mobile apps: $backendUrl"
Write-Host ""
Write-Host "Set this in both apps before expo start:"
Write-Host "  EXPO_PUBLIC_BACKEND_URL=$backendUrl"
Write-Host ""
kubectl -n $Namespace get pods,svc
