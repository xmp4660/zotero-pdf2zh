<div align="center">

![Zotero PDF2zh](./addon/content/icons/favicon@0.5x.svg)

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
![Downloads release](https://img.shields.io/github/downloads/guaguastandup/zotero-pdf2zh/total?color=yellow)
[![License](https://img.shields.io/github/license/guaguastandup/zotero-pdf2zh)](https://github.com/guaguastandup/zotero-pdf2zh/blob/main/LICENSE)

在Zotero中使用[PDF2zh](https://github.com/Byaidu/PDFMathTranslate)和[PDF2zh_next](https://github.com/PDFMathTranslate/PDFMathTranslate-next)

[使用pdf2zh教程(Stable)](./README.md) | [使用pdf2zh_next教程(本页面, Experimental)](./README_babeldoc.md)

</div>

# 如何使用本插件

本指南将引导您完成 Zotero PDF2zh 插件的安装和配置。

遇到问题：

- 请先访问：[常见问题](https://github.com/guaguastandup/zotero-pdf2zh/issues/64)
- 尝试问一下AI
- 提issue或到插件群发自己的终端报错截图（一定要有终端截图，谢谢！）

## 第一步 安装与启动

**第一步：创建目录，存放本插件需要的所有文件**

```shell
# 1. 创建并进入zotero-pdf2zh文件夹
mkdir zotero-pdf2zh-next && cd zotero-pdf2zh-next
# 2. 下载server.py文件
wget https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/refs/heads/main/server.py
# 3. 创建translated文件夹，存放翻译输出文件
mkdir translated
```

文件夹结构如下：

```shell
zotero-pdf2zh-next
    ├── config.toml
    ├── server.py
    └── translated
```

**第二步：安装pdf2zh_next**

1. [**Windows EXE**](https://pdf2zh-next.com/getting-started/INSTALLATION_winexe.html) <small>Recommand for Windows</small>

2. [**Docker**](https://pdf2zh-next.com/getting-started/INSTALLATION_docker.html) <small>Recommand for Linux</small>

3. [**uv** (a Python package manager)](https://pdf2zh-next.com/getting-started/INSTALLATION_uv.html) <small>Recommand for macOS</small>

**uv安装**

进入`zotero-pdf2zh-next`文件夹：

1.  安装uv环境

```shell
# 方法一: 使用pip安装uv
pip install uv
# 方法二: 下载脚本安装
# macOS/Linux
wget -qO- https://astral.sh/uv/install.sh | sh
# windows
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

2.  uv安装Python 3.13

```shell
uv python install 3.13  # 安装3.13版本python
uv venv --python 3.13   # 创建3.13版本python虚拟环境
```

3.  启动虚拟环境

- Linux/macOS执行

    ```shell
    source .venv/bin/activate
    ```

- windows执行

    ```shell
    .\.venv\Scripts\activate
    ```

3.  第三步: 安装需要的包

    ```shell
    uv pip install pdf2zh_next pypdf flask
    ```

**第三步: 测试安装并启动gui**

1. 在命令行输入`pdf2zh_next --gui`进入图形界面。

2. 在图形界面中选择一个本地PDF进行翻译，按照[翻译服务文档](https://pdf2zh-next.com/zh/advanced/Documentation-of-Translation-Services.html)和[高级选项文档](https://pdf2zh-next.com/zh/advanced/advanced.html)完成配置，进行翻译。

3. 翻译成功后，退出图形界面

在第一步创建的`zotero-pdf2zh-next`文件路径中, 在命令行执行：

MacOS/Linux
```shell
cp ~/.config/pdf2zh/config.v3.toml ./config.toml
```

Windows(cmd)
```shell
copy "%USERPROFILE%\.config\pdf2zh\config.v3.toml" config.toml
```

Windows (PowerShell)
```shell
Copy-Item "$env:USERPROFILE\.config\pdf2zh\config.v3.toml" -Destination "config.toml"
```

- 本步骤创建的`config.toml`可用于未来配置其他LLM服务和翻译选项。

**第四步: zotero插件设置**

打开zotero-pdf2zh插件设置

- 将翻译引擎选择为: `pdf2zh_next`
- 将配置文件路径改为: `./config.toml`

可配置字段:

- 翻译服务
- 线程数 (对应pdf2zh_next里的qps)
- 翻译文件输出路径
- 配置文件路径(格式为toml)
- 跳过最后几页不翻译
- 重命名条目为短标题
- 默认生成文件(不支持生成双语对照文件-单栏PDF)

各字段功能请参考[PDF2zh教程](./README.md)
