# --- 用户配置 (只需修改这里) ---
# 虚拟环境名称 (你的 uv 或 Conda 环境名)
$VenvName = ".venv"
# --------------------------------

# --- 自动配置 (通常无需修改) ---
# 项目根目录 (自动获取脚本所在目录，无需手动设置)
$ProjectPath = $PSScriptRoot
# 日志目录
$LogDir = Join-Path $ProjectPath "logs"
$PidFile = Join-Path $LogDir "zotero_python.pid"
$MonitorLog = Join-Path $LogDir "monitor.log"
# Python 服务脚本
$ServerScript = "server.py"
# 监听端口
$ServerPort = 8888
# --------------------------------


# 创建日志目录
if (-not (Test-Path $LogDir)) {
    try {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    } catch {
        Write-Warning "无法创建日志目录: $LogDir"
    }
}

function Log-Message {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Output $line
    try {
        Add-Content -Path $MonitorLog -Value $line
    } catch {}
}

function Send-Notification {
    param([string]$Title, [string]$Message)
    try {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $toastXml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $textNodes = $toastXml.GetElementsByTagName("text")
        $textNodes.Item(0).InnerText = $Title
        $textNodes.Item(1).InnerText = $Message
        $toast = [Windows.UI.Notifications.ToastNotification]::new($toastXml)
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("ZoteroPDF2ZH")
        $notifier.Show($toast)
    } catch {
        Log-Message "通知: $Title - $Message"
    }
}

function Is-ServerRunning {
    if (Test-Path $PidFile) {
        $pid = Get-Content $PidFile | Select-Object -First 1
        if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
            return $true
        }
    }
    return $false
}

function Is-ZoteroRunning {
    # Get-Process -Name 在 Windows 上不区分大小写，一次检查即可
    return (Get-Process -Name "zotero" -ErrorAction SilentlyContinue) -ne $null
}

function Start-Server {
    Log-Message "尝试启动 Python 服务器..."
    $pythonExe = $null

    # 1. 优先尝试检测 uv 虚拟环境 (位于项目文件夹内)
    $uvPythonPath = Join-Path -Path $ProjectPath -ChildPath "$VenvName\Scripts\python.exe"
    if (Test-Path $uvPythonPath) {
        $pythonExe = $uvPythonPath
        Log-Message "检测到 uv 环境: $pythonExe"
    } else {
        # 2. 如果 uv 环境不存在，则回退检测 Conda 环境
        Log-Message "未找到 uv 环境，正在尝试搜索 Conda 环境..."
        $condaPaths = @(
            "$env:USERPROFILE\miniconda3\envs\$VenvName\python.exe",
            "$env:USERPROFILE\anaconda3\envs\$VenvName\python.exe",
            "C:\ProgramData\miniconda3\envs\$VenvName\python.exe",
            "C:\ProgramData\Anaconda3\envs\$VenvName\python.exe"
        )
        foreach ($path in $condaPaths) {
            if (Test-Path $path) {
                $pythonExe = $path
                Log-Message "检测到 Conda 环境: $pythonExe"
                break
            }
        }
    }

    if (-not $pythonExe) {
        $errorMessage = "错误: 找不到 Python 解释器。请检查虚拟环境 '$VenvName' 是否存在且路径正确。"
        Log-Message $errorMessage
        Send-Notification "Zotero PDF2ZH 错误" $errorMessage
        return
    }

    if (Get-NetTCPConnection -State Listen -LocalPort $ServerPort -ErrorAction SilentlyContinue) {
        Log-Message "错误: 端口 $ServerPort 已被占用，无法启动服务。"
        Send-Notification "Zotero PDF2ZH 错误" "❌ 端口 $ServerPort 已被占用"
        return
    }

    $serverScriptPath = Join-Path $ProjectPath $ServerScript
    # 使用 Start-Process 简化启动过程，并在后台运行
    $process = Start-Process -FilePath $pythonExe -ArgumentList "`"$serverScriptPath`" $ServerPort" -WorkingDirectory $ProjectPath -PassThru -WindowStyle Hidden

    Start-Sleep -Seconds 2

    if ($process -and (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
        $process.Id | Out-File -FilePath $PidFile -Encoding utf8
        Log-Message "服务器已启动，PID: $($process.Id)"
        Send-Notification "Zotero PDF2ZH" "✅ PDF 翻译服务已启动"
    } else {
        Log-Message "错误: 服务器未能成功启动。"
        Send-Notification "Zotero PDF2ZH 错误" "❌ PDF 翻译服务启动失败"
    }
}

function Stop-Server {
    if (Is-ServerRunning) {
        $pid = Get-Content $PidFile | Select-Object -First 1
        Log-Message "正在停止服务器 (PID: $pid)..."
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Remove-Item $PidFile -ErrorAction SilentlyContinue
        Log-Message "服务器已停止。"
        Send-Notification "Zotero PDF2ZH" "🔌 PDF 翻译服务已停止"
    } else {
        if (Test-Path $PidFile) { Remove-Item $PidFile -ErrorAction SilentlyContinue }
        Log-Message "服务器未在运行，无需停止。"
    }
}

# --- 主逻辑 ---
Log-Message "--- 开始监控检查 ---"
if (Is-ZoteroRunning) {
    Log-Message "Zotero 正在运行。"
    if (-not (Is-ServerRunning)) {
        Log-Message "检测到服务器未运行，正在启动..."
        Start-Server
    } else {
        Log-Message "服务器也正在运行，状态正常。"
    }
} else {
    Log-Message "Zotero 未运行。"
    if (Is-ServerRunning) {
        Log-Message "检测到服务器仍在运行，正在停止..."
        Stop-Server
    } else {
        Log-Message "服务器也未运行，状态正常。"
    }
}
Log-Message "--- 监控检查结束 ---"