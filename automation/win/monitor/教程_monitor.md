# **Zotero 翻译服务自动化教程 (Windows 平台 & pdf2zh\_next)**

本教程将引导你实现 Zotero 翻译服务在 Windows 系统下的全自动管理，让你无需再手动开关服务，专注研究。

-----

## ✨ **核心功能**

  * **智能启停，释放资源**：当你打开 Zotero 时，翻译服务 (`server.py`) 会在后台自动启动；关闭 Zotero 时，服务也会被自动终止，绝不占用多余的系统资源。
  * **稳定守护，无感重启**：在 Zotero 运行期间，若翻译服务意外崩溃，后台任务会默默守护，并在几秒内自动重启服务，确保翻译功能持续可用。
  * **实时通知，状态可见**：服务的启动与停止，都会通过 Windows 通知中心提醒你，让你对后台状态了如指掌。

-----

## zeroth\_step **第零步：准备工作**

在开始之前，请确保你已经准备好以下环境：

1.  **项目文件夹**：首先，请找到你的 `zotero-pdf2zh` 项目所在的文件夹。这个文件夹就是你的“**项目根目录**”。
2.  **Python 环境**：你的电脑上已正确安装 Python，并为本项目创建了名为 `.venv` 的虚拟环境。
3.  **核心脚本**：确认你的项目文件夹中包含 `automation/windows` 目录下的三个关键文件：
      * `server.py`
      * `zotero_monitor.ps1`
      * `register_task.ps1`

-----

## 🚀 **第一步：配置环境与脚本**

这一步的目的是安装必需的依赖库，并确认监控脚本的配置正确无误。

1.  **激活虚拟环境**
    打开终端（例如 PowerShell 或 CMD），进入你的**项目根目录**，然后运行以下命令激活虚拟环境：

    ```powershell
    # 请将 "D:\projects\zotero-pdf2zh" 替换为你的实际项目路径
    cd D:\projects\zotero-pdf2zh

    # 激活 .venv 环境
    .\.venv\Scripts\activate
    ```

    > **小贴士**：激活成功后，你会在命令行提示符前看到 `(.venv)` 标志。

2.  **安装通知库**
    在**已激活虚拟环境**的终端中，运行以下命令来安装 Windows 通知库：
    教程默认使用uv虚拟环境，可根据实际情况修改。

    ```powershell
    uv pip install win10toast-click
    ```

    这个库用于在服务启动和停止时向你发送桌面通知。

3.  **检查脚本配置**
    用文本编辑器（如 VS Code 或记事本）打开 `zotero_monitor.ps1` 文件。确认其中的 `$VenvName` 变量值是 `".venv"`，通常无需修改。

    ```powershell
    # --- 用户配置 (确认这里的环境名称与你的文件夹匹配) ---
    $VenvName = ".venv"
    # ----------------------------------------------------
    ```

-----

## 🛠️ **第二步：注册后台监控任务**

现在，我们将创建一个 Windows 计划任务，让它在后台定时运行监控脚本，实现对 Zotero 进程的自动追踪。

1.  **以管理员身份运行 PowerShell**
    在 Windows 开始菜单搜索 `PowerShell`，右键点击“Windows PowerShell”，选择“**以管理员身份运行**”。

    > **为何需要管理员权限？** 因为创建系统级别的计划任务需要管理员权限。

2.  **设置执行策略（重要）**
    为了允许执行本地脚本，请在**管理员 PowerShell** 窗口中运行以下命令。这仅对当前窗口生效，不会影响系统全局安全设置。

    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
    ```

3.  **执行注册脚本**
    在同一个**管理员 PowerShell**窗口中，先进入你的项目根目录，然后执行注册脚本：

    ```powershell
    # 1. 切换到你的项目根目录 (请使用你的真实路径)
    cd D:\projects\zotero-pdf2zh

    # 2. 运行注册脚本
    .\register_task.ps1
    ```

    执行成功后，脚本会自动创建一个名为 `ZoteroPdf2ZhMonitor` 的计划任务。该任务默认**每分钟**检查一次 Zotero 的运行状态。

4.  **验证效果**
    打开 Windows 的“**任务计划程序**”（可在开始菜单搜索找到），在左侧的“任务计划程序库”中，你应该能看到 `ZoteroPdf2ZhMonitor` 这项新任务。

    现在，**启动 Zotero**。稍等片刻（最多一分钟），你应该会收到一个服务已启动的桌面通知。同样，**关闭 Zotero** 后，也会收到服务已停止的通知。

-----

## 🗑️ **第三步：如何卸载自动化服务**

如果你不再需要此自动化功能，可以随时将其从系统中彻底移除。

1.  **以管理员身份运行 PowerShell**
    和安装时一样，你需要一个具有管理员权限的 PowerShell 窗口。

2.  **执行卸载命令**
    在管理员窗口中，直接复制并运行以下命令：

    ```powershell
    Unregister-ScheduledTask -TaskName "ZoteroPdf2ZhMonitor" -Confirm:$false
    ```

    此命令会立即、无提示地删除之前创建的计划任务。执行完毕后，所有相关的后台监控都将停止，你的系统会恢复到配置前的状态。