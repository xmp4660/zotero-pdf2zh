
# --- 用户配置 (只需修改这里的环境名称) ---
$VenvName = ".venv"
# --------------------------------

# --- 自动配置 ---
$ProjectPath = $PSScriptRoot
$LogDir = Join-Path $ProjectPath "logs"
$PidFile = Join-Path $LogDir "zotero_python.pid"
$MonitorLog = Join-Path $LogDir "monitor.log"
$ServerScript = "server.py"
$ServerPort = 8888
# -----------------

# --- 函数定义 ---
if (-not (Test-Path $LogDir)) { try { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null } catch {} }

function Log-Message {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    try { Add-Content -Path $MonitorLog -Value $line } catch {}
}

function Is-ServerRunning {
    if (Test-Path $PidFile) {
        $pid = Get-Content $PidFile | Select-Object -First 1
        if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) { return $true }
    }
    return $false
}

function Is-ZoteroRunning {
    return (Get-Process -Name "zotero" -ErrorAction SilentlyContinue) -ne $null
}

function Start-Server {
    Log-Message "尝试静默启动 Python 服务器..."
    $pythonExe = $null

    $uvPythonPath = Join-Path -Path $ProjectPath -ChildPath "$VenvName\Scripts\python.exe"
    if (Test-Path $uvPythonPath) {
        $pythonExe = $uvPythonPath
    } else {
        $condaPaths = @(
            "$env:USERPROFILE\miniconda3\envs\$VenvName\python.exe",
            "$env:USERPROFILE\anaconda3\envs\$VenvName\python.exe",
            "C:\ProgramData\miniconda3\envs\$VenvName\python.exe",
            "C:\ProgramData\Anaconda3\envs\$VenvName\python.exe"
        )
        foreach ($path in $condaPaths) {
            if (Test-Path $path) { $pythonExe = $path; break }
        }
    }

    if (-not $pythonExe) { Log-Message "错误: 找不到 Python 解释器 '$VenvName'"; return }
    if (Get-NetTCPConnection -State Listen -LocalPort $ServerPort -ErrorAction SilentlyContinue) { Log-Message "错误: 端口 $ServerPort 已被占用"; return }

    # --- 【关键修改】 ---
    # 在 Start-Process 命令中也加入了 -WindowStyle Hidden 参数，确保 Python 进程也是隐藏的
    $serverScriptPath = Join-Path $ProjectPath $ServerScript
    $process = Start-Process -FilePath $pythonExe -ArgumentList "`"$serverScriptPath`" $ServerPort" -WorkingDirectory $ProjectPath -PassThru -WindowStyle Hidden

    Start-Sleep -Seconds 2

    if ($process -and (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
        $process.Id | Out-File -FilePath $PidFile -Encoding utf8
        Log-Message "服务器已在后台启动，PID: $($process.Id)"
    } else {
        Log-Message "错误: 服务器未能成功启动。"
    }
}

function Stop-Server {
    if (Is-ServerRunning) {
        $pid = Get-Content $PidFile | Select-Object -First 1
        Log-Message "正在停止服务器 (PID: $pid)..."
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Remove-Item $PidFile -ErrorAction SilentlyContinue
        Log-Message "服务器已停止。"
    }
}

# --- 主逻辑 ---
if (Is-ZoteroRunning) {
    if (-not (Is-ServerRunning)) {
        Start-Server
    }
} else {
    if (Is-ServerRunning) {
        Stop-Server
    }
}