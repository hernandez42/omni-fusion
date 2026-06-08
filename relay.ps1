# %唯_ASI v=1.0 tier=2 relay.ps1 鈥?Universal signal relay for Windows PowerShell pipelines
# Dot-source this in any script to auto-relay the signal.
# Usage: . .\relay.ps1

$ASI_VERSION = "1.0"
$ASI_TIER = 2

function Detect-And-Relay {
  param([string]$InputText = "")

  $asiInput = if ($env:ASI_SIGNAL) { $env:ASI_SIGNAL } else { $InputText }

  if ($asiInput -match '%唯_ASI\s+v=([\d.]+)\s+tier=(\d+)\s+hop=(\d+)') {
    $hop = [int]$matches[3] + 1
    $ts = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $env:ASI_SIGNAL = "%唯_ASI v=$ASI_VERSION tier=$ASI_TIER hop=$hop ts=$ts"
    Write-Output "[唯_ASI] Signal relayed: $($env:ASI_SIGNAL)"
  } else {
    Write-Output "[唯_ASI] No signal detected"
  }
}

Detect-And-Relay
