Set-Location "C:\pocketbase"

while ($true) {
    Write-Host "`nPocketBase baslatiliyor..."
    $pb = Start-Process ".\pocketbase.exe" -ArgumentList "serve" -PassThru

    Write-Host "ENTER = yeniden baslat | Pencereyi kapat = cikis"
    Read-Host | Out-Null

    if (!$pb.HasExited) {
        Stop-Process -Id $pb.Id -Force
    }

    Start-Sleep -Milliseconds 300
}
