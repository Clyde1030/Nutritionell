param(
    [string]$Distro = "Ubuntu",
    [int[]]$Ports = @(3000, 8000),
    [switch]$SkipFirewall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Error "Run this script in an elevated PowerShell terminal (Run as Administrator)."
    exit 1
}

Write-Host "[1/5] Getting WSL IP for distro '$Distro'..." -ForegroundColor Cyan
$wslIpRaw = wsl -d $Distro hostname -I 2>$null
if (-not $wslIpRaw) {
    Write-Error "Could not read IP from WSL distro '$Distro'. Make sure the distro name is correct and running."
    exit 1
}

$wslIp = ($wslIpRaw.Trim() -split "\s+")[0]
if (-not $wslIp) {
    Write-Error "WSL IP parse failed. Raw output: $wslIpRaw"
    exit 1
}

Write-Host "WSL IP: $wslIp" -ForegroundColor Green

Write-Host "[2/5] Removing old portproxy rules for selected ports..." -ForegroundColor Cyan
foreach ($port in $Ports) {
    & netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 | Out-Null
}

Write-Host "[3/5] Adding new portproxy rules..." -ForegroundColor Cyan
foreach ($port in $Ports) {
    & netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to add portproxy rule for port $port"
        exit 1
    }
}

if (-not $SkipFirewall) {
    Write-Host "[4/5] Refreshing firewall allow rules (All profiles)..." -ForegroundColor Cyan
    foreach ($port in $Ports) {
        $ruleName = "Nutritionell WSL Port $port"
        Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any | Out-Null
        Write-Host "Created firewall rule: $ruleName (Any profile)" -ForegroundColor Yellow
    }
}
else {
    Write-Host "[4/5] Skipping firewall rule changes." -ForegroundColor DarkYellow
}

Write-Host "[5/5] Current portproxy rules:" -ForegroundColor Cyan
& netsh interface portproxy show v4tov4

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike "169.254.*" -and
        $_.IPAddress -ne "127.0.0.1" -and
        $_.InterfaceAlias -notmatch "vEthernet|Loopback"
    } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress)

if ($lanIp) {
    Write-Host ""
    Write-Host "Done. Open these from iPhone (same Wi-Fi):" -ForegroundColor Green
    foreach ($port in $Ports) {
        Write-Host ("  http://{0}:{1}" -f $lanIp, $port)
    }
}
else {
    Write-Host "Done. Could not auto-detect LAN IP. Run 'ipconfig' and use your Wi-Fi IPv4." -ForegroundColor Yellow
}
