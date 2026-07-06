#!/bin/bash
# Stop hook: Notify when Claude finishes a task
# Windows desktop notification via PowerShell

powershell.exe -NoProfile -Command "
  Add-Type -AssemblyName System.Windows.Forms
  \$notify = New-Object System.Windows.Forms.NotifyIcon
  \$notify.Icon = [System.Drawing.SystemIcons]::Information
  \$notify.Visible = \$true
  \$notify.ShowBalloonTip(5000, 'Claude Code', 'Gorev tamamlandi!', [System.Windows.Forms.ToolTipIcon]::Info)
  Start-Sleep -Seconds 6
  \$notify.Dispose()
" 2>/dev/null &

exit 0
