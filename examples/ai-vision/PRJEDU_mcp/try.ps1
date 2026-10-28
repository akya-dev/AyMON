# ---------------------------------------------------------------------
# PRJEDU_mcp -- talk to the MCP endpoints WITHOUT an AI.
#
# MCP is JSON-RPC 2.0 over HTTP POST. An assistant does exactly what this
# script does: initialize, tools/list, then tools/call with a tool name and
# an arguments object. Seeing the raw calls once makes the assistant's
# behaviour much easier to read later.
#
# Start the engine first (run.bat), then:   try.bat
# ---------------------------------------------------------------------
param(
    [string]$Server = "127.0.0.1",
    [int]$ReadPort  = 8095,
    [int]$WritePort = 8096
)

$ErrorActionPreference = "Stop"
$script:id = 0

function Rpc([int]$port, [string]$key, [string]$method, $params) {
    $script:id++
    $body = @{ jsonrpc = "2.0"; id = $script:id; method = $method }
    if ($params) { $body.params = $params }
    $json = $body | ConvertTo-Json -Depth 10 -Compress
    try {
        $r = Invoke-RestMethod -Uri "http://${Server}:${port}/mcp" -Method Post `
             -ContentType "application/json" -Headers @{ Authorization = "Bearer $key" } `
             -Body ([Text.Encoding]::UTF8.GetBytes($json))
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code) { return "HTTP $code" }
        throw
    }
    if ($r.error) { return "error $($r.error.code): $($r.error.message)" }
    return $r.result
}

# tools/call answers { content: [ { type: "text", text: "<json>" } ], isError? }
# The tool's own answer is the JSON inside 'text'.
function Call([int]$port, [string]$key, [string]$tool, $arguments) {
    if ($null -eq $arguments) { $arguments = @{} }
    $r = Rpc $port $key "tools/call" @{ name = $tool; arguments = $arguments }
    if ($r -is [string]) { return $r }
    $t = $r.content[0].text
    if ($r.isError) { return "isError  $t" }
    return $t
}

function Step([string]$title) { Write-Host ""; Write-Host "== $title" -ForegroundColor Cyan }

$R = $ReadPort;  $RK = "demo-read-key"
$W = $WritePort; $WK = "demo-write-key"

try {
    $init = Rpc $R $RK "initialize" @{ protocolVersion = "2025-03-26"; capabilities = @{}; clientInfo = @{ name = "try.ps1"; version = "1" } }
} catch {
    Write-Host "Nothing answers on ${Server}:$R. Start the engine first: run.bat" -ForegroundColor Red
    exit 1
}

Step "initialize - who is there"
"$($init.serverInfo.name) $($init.serverInfo.version), protocol $($init.protocolVersion)"

Step "tools/list on the READ endpoint ($R) - no write tools at all"
((Rpc $R $RK "tools/list").tools | ForEach-Object { $_.name }) -join ", "

Step "tools/list on the WRITE endpoint ($W) - set_value ... and the project's set_setpoint"
((Rpc $W $WK "tools/list").tools | ForEach-Object { $_.name }) -join ", "

Step "a wrong key"
Rpc $R "not-the-key" "tools/list"

Step "system_info - only PLT/S00 is listed; AI/S00 has no mcp_pub"
Call $R $RK "system_info"

Step "read_points - VENDOR_NOTE is 'not found' for role 2, and acl_hidden says one was filtered"
Call $R $RK "read_points" @{ doc = "PLT/S00"; ids = @("LEVEL", "SETPOINT", "PUMP", "VENDOR_NOTE") }

Step "plant_status - a tool the PROJECT declared, in db\db_AI_mcp.js"
Call $R $RK "plant_status"

Step "set_value on the read endpoint - the tool does not exist there"
Call $R $RK "set_value" @{ adr = "PLT/S00/SETPOINT/val"; val = 70 }

Step "set_value SETPOINT = 70, dry_run - what WOULD be written"
Call $W $WK "set_value" @{ adr = "PLT/S00/SETPOINT/val"; val = 70; dry_run = $true }

Step "set_value SETPOINT = 70 - role 3 may write it"
Call $W $WK "set_value" @{ adr = "PLT/S00/SETPOINT/val"; val = 70 }

Step "set_value SETPOINT = 150 - OKY, and the plant's own limit makes it 90"
Call $W $WK "set_value" @{ adr = "PLT/S00/SETPOINT/val"; val = 150 }
Call $W $WK "read_points" @{ doc = "PLT/S00"; ids = @("SETPOINT") }

Step "set_value LEVEL = 10 - a measurement; role 3 may not write it"
Call $W $WK "set_value" @{ adr = "PLT/S00/LEVEL/val"; val = 10 }

Step "one address, two elements: SETPOINT written, LEVEL refused = PARTIAL"
Call $W $WK "set_value" @{ adr = "doc('PLT/S00')//var[@val_unt='%']/@val"; val = 60 }

Step "set_setpoint 150 - the project tool refuses instead of clamping"
Call $W $WK "set_setpoint" @{ value = 150 }

Step "set_setpoint 60"
Call $W $WK "set_setpoint" @{ value = 60 }

Step "read_logs - what the engine wrote about all this (PLT/S00, WARN and worse)"
$logs = Call $W $WK "read_logs" @{ doc = "PLT/S00"; level = "WARN"; lines = 6 }
try { ($logs | ConvertFrom-Json).text } catch { $logs }

Write-Host ""
