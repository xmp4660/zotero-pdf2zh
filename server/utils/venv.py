## server.py v3.0.1
# guaguastandup
# zotero-pdf2zh
import platform
import json
import subprocess
import os
import shutil
# e.g. "pdf2zh": { "conda": { "packages": [...], "python_version": "3.12" } }

# TODO: 如果用户的conda/uv环境路径是自定义的, 需要支持自定义路径
# 目前我们默认为当用户在命令行中执行uv / conda时, 是可以正常使用的, 而不是执行/usr/local/bin/uv等等才可以使用
class VirtualEnvManager:
    def __init__(self, config_path, env_name, default_env_tool):
        self.is_windows = platform.system() == "Windows"
        self.config_path = config_path

        with open(config_path, 'r', encoding='utf-8') as f:
            self.env_configs = json.load(f)

        self.env_name = env_name
        self.curr_envtool = None
        self.curr_envname = None
        self.default_env_tool = default_env_tool

    """环境初始化"""
    def initialize_env(self, engine, envtool): 
        envname = self.env_name[engine]
        cfg = self.env_configs[engine][envtool]
        packages = cfg.get('packages', [])
        python_version = cfg.get('python_version', '3.12') # 目前的python环境都是3.12

        print(f"🔧 开始尝试创建 {envtool} 虚拟环境: {envname} (Python {python_version}) ...")

        try:
            if envtool == 'uv':
                env = os.environ.copy()
                env['UV_HTTP_TIMEOUT'] = '300'
                subprocess.run(
                    ['uv', 'venv', envname, '--python', python_version], 
                    check=True, timeout=600)
                if packages:
                    print("🔧 开始使用 uv 安装 packages: ", packages)
                    # python_path = os.path.join(envname, 'Scripts' if self.is_windows else 'bin', 'python')
                    python_executable = 'python.exe' if self.is_windows else 'python'
                    python_path = os.path.join(envname, 'Scripts' if self.is_windows else 'bin', python_executable)
                    subprocess.run(
                        ['uv', 'pip', 'install', *packages, '--python', python_path], 
                        check=True, timeout=600, env=env)
            elif envtool == 'conda':
                subprocess.run(['conda', 'create', '-n', envname, f'python={python_version}', '-y'], check=True, timeout=600)
                if packages:
                    print("🔧 开始使用 conda 安装 packages: ", packages)
                    subprocess.run(['conda', 'run', '-n', envname, 'pip', 'install', *packages], check=True, timeout=600)
            return True
        except subprocess.TimeoutExpired:
            print(f"⏰ 创建 {envname} 环境超时")
        except subprocess.CalledProcessError as e:
            print(f"❌ 创建 {envname} 环境失败: {e}")
        except Exception as e:
            print(f"❌ 创建 {envname} 环境出错: {e}")
        return False

    def check_envtool(self, envtool): # 检查 uv / conda 是否存在
        try:
            result = subprocess.run([envtool, '--version'], capture_output=True, text=True, timeout=600)
            return result.returncode == 0
        except Exception as e:
            print(f"❌ 检查 {envtool} 失败: {e}")
            return False
        
    def check_env(self, engine, envtool): # 检查 env 环境是否在uv / conda中存在
        envname = self.env_name.get(engine)
        if envtool == 'uv':
            try:
                uv_env_path = os.path.join('.', envname)
                # print("🔍 检查 uv 环境: ", uv_env_path)
                # TOCHECK: 对于windows, macOS, linux, 检查路径的区别
                return ( os.path.exists(uv_env_path) and os.path.exists(os.path.join(uv_env_path, 'pyvenv.cfg')))
            except Exception as e:
                print(f"❌ 检查 {envtool} 虚拟环境 {envname} 失败: {e}")
                return False
        elif envtool == 'conda':
            try: 
                result = subprocess.run(['conda', 'env', 'list'], capture_output=True, text=True, timeout=600)
                if result.returncode == 0:
                    envs = [line.split()[0] for line in result.stdout.splitlines() if line and not line.startswith("#")]
                    # print("🔍 检查 conda 环境列表: ", envs)
                    return envname in envs
            except Exception as e:
                print(f"❌ 检查 {envtool} 虚拟环境 {envname} 失败: {e}")
                return False
        return False
        
    def ensure_env(self, engine):
        envtools = ['conda', 'uv'] if self.default_env_tool == 'conda' else ['uv', 'conda']
        for envtool in envtools:
            if self.check_envtool(envtool): # 优先检查并配置conda
                if self.check_env(engine, envtool) or self.initialize_env(engine, envtool):
                    self.curr_envtool = envtool
                    self.curr_envname = self.env_name[engine]
                    print(f"✅ 使用 {envtool} 环境: {self.curr_envname}")
                    return True
                else:
                    print(f"❌ {envtool} 环境 {self.env_name[engine]} 不可用")
        print(f"❌ 无法找到可用的虚拟环境")
        return False
    
    # gemini
    def execute_in_env(self, command):
        engine = 'pdf2zh_next' if 'pdf2zh_next' in ' '.join(command).lower() else 'pdf2zh'
        if not self.ensure_env(engine):
            print(f"❌ 无法找到或创建 {engine} 的虚拟环境，尝试直接执行命令...")
            try: # 对于直接执行，同样让它继承终端
                # stdout 和 stderr 保持默认的 None，子进程将直接输出到当前终端
                process = subprocess.Popen(command) 
                process.wait()
                if process.returncode != 0:
                    raise subprocess.CalledProcessError(process.returncode, command)
                print(f"✅ 命令执行成功: {' '.join(command)}")
            except subprocess.CalledProcessError as e:
                print(f"\n❌ 执行命令失败: {e}")
            except Exception as e:
                print(f"\n❌ 执行命令出错: {e}")
            return
        try:
            # --- 虚拟环境路径计算 (这部分逻辑不变) ---
            if self.curr_envtool == 'uv':
                bin_dir = os.path.join(self.curr_envname, 'Scripts' if self.is_windows else 'bin')
            elif self.curr_envtool == 'conda':
                # conda_base = os.path.dirname(os.path.dirname(shutil.which('conda') or ''))
                # bin_dir = os.path.join(conda_base, 'envs', self.curr_envname, 'Scripts' if self.is_windows else 'bin')
                conda_base_path = shutil.which('conda')
                if not conda_base_path:
                    raise FileNotFoundError("Conda executable not found in PATH.")
                conda_base = os.path.dirname(os.path.dirname(conda_base_path))
                bin_dir = os.path.join(conda_base, 'envs', self.curr_envname, 'Scripts' if self.is_windows else 'bin')
            else:
                raise ValueError(f"⚠️ 未知的环境工具: {self.curr_envtool}")

            # --- 命令组装 (保留优点：优先可执行文件，并用-u强制无缓冲) ---
            python_executable = 'python.exe' if self.is_windows else 'python'
            python_path = os.path.join(bin_dir, python_executable)

            # if command[0].lower() in ['pdf2zh', 'pdf2zh_next']:
            #     executable_path = os.path.join(bin_dir, command[0])
            #     if os.path.exists(executable_path):
            #         cmd = [executable_path] + command[1:]
            #         print(f"🔍 已找到可执行文件: {executable_path}")
            #     else:
            #         python_path = os.path.join(bin_dir, 'python')
            #         # 使用 -u 参数，请求 Python 不要缓冲 stdout/stderr
            #         cmd = [python_path, '-u', '-m', command[0]] + command[1:]
            #         print(f"⚠️ 可执行文件不存在，使用 python -m -u 方式: {' '.join(cmd)}")
            # else:
            #     python_path = os.path.join(bin_dir, 'python')
            #     cmd = [python_path, '-u'] + command

            if command[0].lower() in ['pdf2zh', 'pdf2zh_next']:
                # 2. 检查可执行文件时，也考虑 .exe 后缀
                executable_name = command[0] + ('.exe' if self.is_windows else '')
                executable_path = os.path.join(bin_dir, executable_name)
                
                if os.path.exists(executable_path):
                    cmd = [executable_path] + command[1:]
                    print(f"🔍 已找到可执行文件: {executable_path}")
                else:
                    # 使用预先构建好的、路径正确的 python_path
                    cmd = [python_path, '-u', '-m', command[0]] + command[1:]
                    print(f"⚠️ 可执行文件不存在，使用 python -m -u 方式: {' '.join(cmd)}")
            else:
                # 运行其他python命令时，同样使用正确的 python_path
                cmd = [python_path, '-u'] + command

            print(f"🚀 在虚拟环境中执行命令: {' '.join(cmd)}\n")
            # --- 环境变量设置 (保留优点) ---
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'  # 再次确保无缓冲
            env['PATH'] = bin_dir + os.pathsep + env.get('PATH', '')

            # ===== 核心修改：让子进程直接继承终端，而不是捕获输出 =====
            # 将 stdout 和 stderr 设置为 None (默认值)，子进程的输出会直接打印到
            # 运行此脚本的控制台，就像直接在 shell 中执行一样。
            # 这使得子进程能正确检测到 TTY，从而显示进度条。
            process = subprocess.Popen(
                cmd,
                env=env,
                # stdout=None, # 无需捕获，保持默认
                # stderr=None, # 无需捕获，保持默认
            )
            # 只需等待它完成即可，输出由操作系统自动处理
            return_code = process.wait()
            if return_code != 0:
                # 失败时，在进度条覆盖的行后换行，让错误信息更清晰
                print()
                raise subprocess.CalledProcessError(return_code, cmd)
            # 成功时也换行，让成功信息在新的一行显示
            print()
            print(f"✅ 命令执行成功: {' '.join(cmd)}")

        except subprocess.CalledProcessError as e:
            print(f"❌ 执行命令失败: {e}")
        except FileNotFoundError as e:
            print(f"❌ 环境的可执行文件未找到: {e}")
            print(f"请检查虚拟环境是否正确安装: {self.curr_envname}")
        except Exception as e:
            print(f"❌ 执行命令出错: {e}")
            import traceback
            traceback.print_exc()