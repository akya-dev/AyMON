# =====================================================================
# shell.ps1 - a terminal for the AyMON maintenance shell (PRO.telnet)
#
# WHY THIS IS HERE. Windows 11 ships without a telnet client, and the two
# obvious substitutes are poor:
#
#   openssl s_client  reads the FIRST LETTER of every line as one of its
#                     own commands unless you pass -quiet (C reconnects,
#                     Q quits, R renegotiates), and on Windows it polls the
#                     console once a second, so lines arrive one per second.
#   a raw socket      is line based, so the shell's history (Up/Down) and
#                     line editing never work.
#
# This client runs in CHARACTER mode: every key goes out as it is pressed
# and the arrow keys go out as ANSI sequences, so the shell's own history
# and in-line editing work exactly as they do under PuTTY. It speaks plain
# TCP or TLS, needs nothing installed, and decodes UTF-8 statefully, so
# Turkish characters in engine messages come out right.
#
# USAGE
#   .\shell.ps1                         127.0.0.1:2323, plain
#   .\shell.ps1 -Tls                    127.0.0.1:2324, TLS
#   .\shell.ps1 -Server 10.40.1.5 -Port 2323
#   .\shell.ps1 -Tls -Verify            validate the server certificate
#
# Log in as admin/admin123, eng/eng123, opr/opr123 or mon/mon123.
# Leave with 'exit' (or Ctrl-D on an empty line). Ctrl-C goes TO THE SHELL
# as a line cancel and does not close this client; close the window or
# press Ctrl-Break for that.
# =====================================================================
param(
    [string]$Server = "127.0.0.1",
    [int]   $Port   = 0,        # 0 = 2323 plain, 2324 with -Tls
    [switch]$Tls,
    [switch]$Verify             # without it a self-signed certificate is accepted
)

$ErrorActionPreference = "Stop"

if ($Port -eq 0) { $Port = if ($Tls) { 2324 } else { 2323 } }

# Character mode needs a real console window. Redirected input (a pipe, the
# ISE, some remote sessions) makes KeyAvailable throw - say so here rather
# than after a connection is already open.
try { $null = [Console]::KeyAvailable } catch {
    Write-Host "This client needs a real console window (input is redirected)." -ForegroundColor Red
    Write-Host "Run it from an ordinary PowerShell window." -ForegroundColor Yellow
    exit 1
}

try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect($Server, $Port)
} catch {
    Write-Host "Cannot connect to ${Server}:${Port} - $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Is run.bat running in the other window?" -ForegroundColor Yellow
    exit 1
}

if ($Tls) {
    if ($Verify) {
        $stream = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false)
    } else {
        # The example ships a self-signed certificate. Skipping validation
        # skips IDENTITY checking, not encryption - off loopback, use -Verify
        # with a certificate your machine trusts.
        $cb     = { param($sender, $cert, $chain, $errors) return $true }
        $stream = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, $cb)
    }
    try {
        $stream.AuthenticateAsClient($Server)
    } catch {
        Write-Host "TLS handshake failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "That port may be the plain one - try .\shell.ps1 without -Tls." -ForegroundColor Yellow
        $tcp.Close(); exit 1
    }
    $what = "TLS " + $stream.SslProtocol
} else {
    $stream = $tcp.GetStream()
    $what   = "plain telnet"
}

Write-Host ("-- {0}:{1} connected, {2}. Type 'exit' to leave. --" -f $Server, $Port, $what) -ForegroundColor DarkGray

# Ctrl-C belongs to the shell at the other end (it cancels the line there),
# not to this client.
[Console]::TreatControlCAsInput = $true

$enc     = New-Object System.Text.UTF8Encoding($false)
$buf     = New-Object byte[] 16384
$clean   = New-Object byte[] 16384   # the same bytes with telnet IAC removed
$chars   = New-Object char[] 16384
$dec     = $enc.GetDecoder()         # stateful: a UTF-8 sequence may be split
$pending = $null

# The engine speaks UTF-8 (MultiByte / TC08). Without switching the console
# to UTF-8 as well, non-ASCII characters in engine messages come out as
# mojibake. The old values go back in 'finally'.
$oldOut = [Console]::OutputEncoding
$oldIn  = [Console]::InputEncoding
try { [Console]::OutputEncoding = $enc } catch {}
try { [Console]::InputEncoding  = $enc } catch {}

function Send-Bytes([byte[]]$b) {
    $stream.Write($b, 0, $b.Length); $stream.Flush()
}

try {
    while ($true) {
        # ---- from the server ----
        if ($pending -eq $null) { $pending = $stream.ReadAsync($buf, 0, $buf.Length) }
        if ($pending.Wait(10)) {
            $n = $pending.Result
            $pending = $null
            if ($n -le 0) { Write-Host "`n-- the server closed the connection --" -ForegroundColor DarkGray; break }

            # Telnet option negotiation (IAC, 255) is handled at the BYTE
            # level first; the rest is decoded as UTF-8. Turning every byte
            # into a character instead would assume Latin-1 and break the
            # engine's UTF-8 output.
            $clen = 0
            $i = 0
            while ($i -lt $n) {
                if ($buf[$i] -eq 255) {
                    if ($i + 1 -lt $n -and $buf[$i+1] -ge 251 -and $buf[$i+1] -le 254) { $i += 3 } else { $i += 2 }
                    continue
                }
                $clean[$clen] = $buf[$i]; $clen++; $i++
            }

            if ($clen) {
                # A multi-byte sequence can be split across two reads; the
                # decoder keeps the incomplete tail for the next call.
                $cnt = $dec.GetChars($clean, 0, $clen, $chars, 0)
                if ($cnt) { [Console]::Write($chars, 0, $cnt) }
            }
        }

        # ---- from the keyboard ----
        while ([Console]::KeyAvailable) {
            $k = [Console]::ReadKey($true)

            # The shell's history expects the arrow keys as ANSI sequences.
            # NOTE: 'continue' inside a PowerShell switch falls through to
            # the code AFTER the switch instead of starting the next loop
            # turn, so what was sent is marked with a flag - otherwise
            # Enter / Backspace / Tab would go out twice.
            $sent = $true
            switch ($k.Key) {
                "UpArrow"    { Send-Bytes ([byte[]](27,91,65))     }
                "DownArrow"  { Send-Bytes ([byte[]](27,91,66))     }
                "RightArrow" { Send-Bytes ([byte[]](27,91,67))     }
                "LeftArrow"  { Send-Bytes ([byte[]](27,91,68))     }
                "Home"       { Send-Bytes ([byte[]](27,91,49,126)) }  # ESC [ 1 ~
                "End"        { Send-Bytes ([byte[]](27,91,52,126)) }  # ESC [ 4 ~
                "Delete"     { Send-Bytes ([byte[]](27,91,51,126)) }  # ESC [ 3 ~
                "Enter"      { Send-Bytes ([byte[]](13,10))        }
                "Backspace"  { Send-Bytes ([byte[]](127))          }  # ^? , like PuTTY
                "Tab"        { Send-Bytes ([byte[]](9))            }
                default      { $sent = $false }
            }

            if (-not $sent -and $k.KeyChar -ne [char]0) {
                Send-Bytes ($enc.GetBytes([string]$k.KeyChar))
            }
        }
    }
} catch {
    Write-Host "`n-- connection error: $($_.Exception.Message.Split([char]10)[0]) --" -ForegroundColor Red
} finally {
    [Console]::TreatControlCAsInput = $false
    try { [Console]::OutputEncoding = $oldOut } catch {}
    try { [Console]::InputEncoding  = $oldIn  } catch {}
    try { $stream.Close() } catch {}
    try { $tcp.Close() } catch {}
}
