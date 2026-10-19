#Requires -Version 5.1
<#
.SYNOPSIS
  Install GRCompliance with Docker Compose on Windows.
.DESCRIPTION
  Creates ~/grcompliance (or -Dir), writes a mode-restricted .env with random
  secrets, downloads docker-compose.yml, and starts the stack.
  Existing .env files are never overwritten. -Upgrade pulls or rebuilds.
#>
param(
    [switch]$Upgrade,
    [string]$Dir = $(if ($env:GRC_HOME) { $env:GRC_HOME } else { Join-Path $HOME "grcompliance" })
)

$ErrorActionPreference = "Stop"
$RawBase = if ($env:GRC_RAW_BASE) { $env:GRC_RAW_BASE } else { "https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main" }
$GitUrl = if ($env:GRC_GIT_URL) { $env:GRC_GIT_URL } else { "https://github.com/Sectutor/GRCompliance-Core.git" }
$GitRef = if ($env:GRC_REF) { $env:GRC_REF } else { "main" }
$Image = "ghcr.io/sectutor/grcompliance-core"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

function Require-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail "Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Fail "Docker is installed, but the daemon is not reachable. Start Docker Desktop and run this again."
    }
    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        Fail "The Docker Compose plugin is missing. Update Docker Desktop so 'docker compose' is available."
    }
}

function New-SecretHex([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
    } finally {
        $rng.Dispose()
    }
    return ([System.BitConverter]::ToString($buffer) -replace "-", "").ToLowerInvariant()
}

function Write-EnvFile {
    $postgresPassword = New-SecretHex 24
    $redisPassword = New-SecretHex 24
    $jwtSecret = New-SecretHex 32
    $encryptionKey = New-SecretHex 32
    $adminPassword = New-SecretHex 18
    $appPort = if ($env:APP_PORT) { $env:APP_PORT } else { "3001" }
    $adminEmail = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@grcompliance.local" }
    $postgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "grc" }
    $postgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "grcompliance" }
    $version = if ($env:GRC_VERSION) { $env:GRC_VERSION } else { "latest" }
    $content = @"
POSTGRES_USER=$postgresUser
POSTGRES_PASSWORD=$postgresPassword
POSTGRES_DB=$postgresDb
DATABASE_URL=postgres://${postgresUser}:${postgresPassword}@db:5432/${postgresDb}?sslmode=disable
REDIS_PASSWORD=$redisPassword
JWT_SECRET=$jwtSecret
ENCRYPTION_KEY=$encryptionKey
ADMIN_EMAIL=$adminEmail
ADMIN_PASSWORD=$adminPassword
APP_URL=http://localhost:$appPort
APP_PORT=$appPort
GRC_VERSION=$version
AUTH_MODE=local
"@
    $path = Join-Path (Get-Location) ".env"
    Set-Content -Path $path -Value $content -Encoding ascii
    icacls $path /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
    Write-Host "Created $path"
    Write-Host "Admin email: $adminEmail"
    Write-Host "Admin password (shown once): $adminPassword"
    Write-Host "Store this password now. It will not be printed again."
}

function Get-AppPort {
    $line = Select-String -Path .env -Pattern "^APP_PORT=" | Select-Object -First 1
    if ($line) { return ($line.Line -split "=", 2)[1] }
    return "3001"
}

Require-Docker
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir

$composeTmp = Join-Path $Dir "docker-compose.yml.download"
Invoke-WebRequest -Uri "$RawBase/docker-compose.yml" -OutFile $composeTmp
Move-Item -Force $composeTmp "docker-compose.yml"

$envPath = Join-Path $Dir ".env"
if (Test-Path $envPath) {
    Write-Host "Keeping existing $envPath"
} else {
    Write-EnvFile
}

$versionLine = Select-String -Path .env -Pattern "^GRC_VERSION=" | Select-Object -First 1
$env:GRC_VERSION = if ($versionLine) { ($versionLine.Line -split "=", 2)[1] } else { "latest" }

docker compose pull app
if ($LASTEXITCODE -eq 0) {
    docker compose up -d --no-build --remove-orphans
} else {
    Write-Host "Published image ${Image}:$($env:GRC_VERSION) is not available. Building from source."
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Fail "git is required to build the image locally."
    }
    if (Test-Path "src/.git") {
        git -C src fetch --depth 1 origin $GitRef
        if ($LASTEXITCODE -ne 0) { Fail "git fetch failed" }
        git -C src checkout --detach FETCH_HEAD
        if ($LASTEXITCODE -ne 0) { Fail "git checkout failed" }
    } else {
        if (Test-Path src) { Remove-Item -Recurse -Force src }
        git clone --depth 1 --branch $GitRef $GitUrl src
        if ($LASTEXITCODE -ne 0) { Fail "git clone failed" }
    }
    $env:GRC_BUILD_CONTEXT = Join-Path $Dir "src"
    docker compose up -d --build --remove-orphans
}
if ($LASTEXITCODE -ne 0) { Fail "docker compose up failed" }

$port = Get-AppPort
Write-Host "Waiting for GRCompliance to become healthy on port $port..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 5
    }
}
if (-not $ready) {
    Fail "GRCompliance did not become healthy. Inspect logs with: docker compose logs app"
}
Write-Host "GRCompliance is up: http://127.0.0.1:$port"
Write-Host "Sign in with the administrator email in .env."
Write-Host "The first start loads the Latore LTD demo workspace."
if ($Upgrade) {
    Write-Host "Upgrade finished. The existing .env was left unchanged."
}
