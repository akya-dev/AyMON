@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_records -- kill this example's engine, as a crash would: no
rem CTRL-C, no clean stop. Only this example's: other engines keep running.
rem Then run.bat again and look for "REC: journal on disk" in the console.
rem ---------------------------------------------------------------------
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \"Name='AyXDB.exe'\" | Where-Object { $_.CommandLine -like '*PRJEDU_records*' }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('killed ' + $_.ProcessId) } } else { Write-Host 'this example is not running' }"
