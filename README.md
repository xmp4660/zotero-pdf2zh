<div align="center">

![Zotero PDF2zh](./plugin/addon/content/icons/favicon@0.5x.svg)

<h2 id="title">Zotero PDF2zh</h2>

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
![Downloads release](https://img.shields.io/github/downloads/guaguastandup/zotero-pdf2zh/total?color=yellow)
[![License](https://img.shields.io/github/license/guaguastandup/zotero-pdf2zh)](https://github.com/guaguastandup/zotero-pdf2zh/blob/main/LICENSE)

在Zotero中使用[PDF2zh](https://github.com/Byaidu/PDFMathTranslate)和[PDF2zh_next](https://github.com/PDFMathTranslate/PDFMathTranslate-next)

新版本v3.0.0 | [旧版本v2.4.3](./2.4.3%20version/README.md)

</div>

# 如何使用本插件

本指南将引导您完成 Zotero PDF2zh 插件的安装和配置。

❓ 遇到问题

- 尝试向AI提问
- 在github issue区提问
- 发送问题到本插件用户QQ群: 971960014 入群验证回答: github

🔮 v3.0.0更新日志

- 更新zotero配置端, 兼容pdf2zh和pdf2zh_next的多种翻译配置
- 更新zotero配置端, 用户可以在本界面添加、编辑、激活、删除LLM API配置
- 更新server.py脚本，自动切换pdf2zh/pdf2zh_next虚拟环境，用户可以选择conda/uv进行环境配置

## 第一步: 安装uv/conda

**uv安装(推荐)**

```shell
# 方法一: 使用pip安装uv
pip install uv
# 方法二: 下载脚本安装
# macOS/Linux
wget -qO- https://astral.sh/uv/install.sh | sh
# windows
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**conda安装**

```shell
# 1. 安装conda
# 省略
# 2. 测试conda
conda --version
# 3. 显示conda版本, 则conda安装完成
```

## 第二步: 下载项目文件

```shell
# 1. 创建并进入zotero-pdf2zh文件夹
mkdir zotero-pdf2zh && cd zotero-pdf2zh
# 2. 下载并解压server文件夹
wget https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/refs/heads/main/server.zip
upzip server.zip
# 3. 进入server文件夹
cd server
```

## 第三步: 执行

```shell
# 执行脚本
# 其中, 默认开启虚拟环境管理, 默认使用uv进行虚拟环境管理
python server.py

# 命令行参数:
# 如果要关闭虚拟环境管理
python server.py --enable_venv=False
# 如果要切换虚拟环境管理工具为conda
python server.py --env_tool=conda
# 如果要切换端口号
python server.py --port={Your Port Num}
```

## 第四步: 下载并安装插件

新版本v3.0.0[下载链接](https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/refs/heads/main/zotero-pdf-2-zh-v3.0.0.xpi)

## 第五步: Zotero端插件设置

<img src="./images/preference.png" alt="preference" style="width: 600px" align="center"/><img src="./images/preference2.png" alt="preference2" style="width: 600px" align="center"/>

**💡 注意事项**

- 切换翻译引擎, 界面将显示不同引擎的翻译配置
- 对于翻译引擎pdf2zh: 目前zotero端和server端并不传输字体文件, 字体文件路径为本地路径, 如果采用远端部署, 则需要手动修改`config.json`文件中的`NOTO_FONT_PATH`字段。

<img src="./images/editor.png" alt="editor" style="width: 600px" align="center"/>

**💡 注意事项**

- 目前, 额外配置参数名需要与config文件中的字段相同(例如在pdf2zh_next中, openai对应的额外配置: `openai_temperature`和`openai_send_temperature`与`config.toml`文件中的字段相对应), 本功能将在未来继续优化, 可参考[文档](./server/doc/翻译引擎服务额外字段.md)

# 关于翻译选项

对条目/附件单击右键, 可以看到四个翻译选项:

<img src="./images/menu.png" alt="menu" style="width: 400px" align="center"/>

💡 注意事项

- **翻译PDF**: 点击原文PDF或论文条目, 将会生成在Zotero插件设置端所选择的默认生成文件
- **裁剪PDF**: 选择dual/mono类型附件, 将会对选择的附件在宽度1/2处裁剪, 然后上下拼接, 此功能适合手机阅读
    - 本选项会将页面两侧空白处进行裁剪
    - 若产生截断了原文内容的情况, 可将`server/utils/config.py`中的`config.pdf_w_offset`值降低
- **双语对照**: 点击此选项, 会生成左边为原文, 右边为翻译后文本的PDF
    - 选择"Dual文件翻译页在前"可以交换生成顺序
    - 此选项等同于翻译引擎为pdf2zh_next, 且`双语(Dual)文件显示模式`为**Left&Right**时生成的文件
- **双语对照(裁剪):** 此选项针对双栏PDF论文, 将会在每页生成单栏双语对照内容

示例:

<img src="./images/dualmode.png" alt="dualmode" style="width: 600px" align="center"/>

# 致谢

- @Byaidu [PDF2zh](https://github.com/Byaidu/PDFMathTranslate)
- @awwaawwa [PDF2zh_next](https://github.com/PDFMathTranslate/PDFMathTranslate-next)
- @windingwind [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)

# 贡献者

<a href="https://github.com/guaguastandup/zotero-pdf2zh/graphs/contributors"> <img src="https://contrib.rocks/image?repo=guaguastandup/zotero-pdf2zh" /></a>

# # Support me

💐 免费开源插件，您的支持是我继续开发的动力～

- 🤖 SiliconFlow邀请链接: https://cloud.siliconflow.cn/i/WLYnNanQ
- ☕️ Buy me a coffee https://github.com/guaguastandup/guaguastandup
