# Zotero PDF2zh

[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![License](https://img.shields.io/github/license/guaguastandup/zotero-pdf2zh)](https://github.com/guaguastandup/zotero-pdf2zh/blob/master/LICENSE)
![Downloads release](https://img.shields.io/github/downloads/guaguastandup/zotero-pdf2zh/total?color=pink)
<!-- ![Downloads latest release](https://img.shields.io/github/downloads/guaguastandup/zotero-pdf2zh/latest/total?color=yellow) -->

> 在Zotero中使用[PDF2zh](https://github.com/Byaidu/PDFMathTranslate)

## 配置方法

### 第零步

在本地安装最新的[PDF2zh](https://github.com/Byaidu/PDFMathTranslate)

```cmd
pip install pdf2zh          # 安装pdf2zh
或
pip install --upgrade pdf2zh # 之前已经安装, 更新
```

本插件当前开发使用的 `pdf2zh`版本: v1.8.9

### 第一步

根据以下python脚本的注释, 按照个人需求修改配置，然后运行:

```python
from flask import Flask, request, jsonify
import subprocess
import os

pdf2zh = "pdf2zh"                   # 设置pdf2zh指令: 默认为'pdf2zh'
thread_num = 4                      # 设置线程数: 默认为4
translated_dir = "./translated/"    # 设置翻译文件的输出路径(临时路径, 可以在翻译后删除)
port_num = 8888                     # 设置端口号: 默认为8888

#####################################################################################################################
def get_absolute_path(path):
    if os.path.isabs(path): # 判断是否是绝对路径
        return path  # 如果已经是绝对路径，直接返回
    else:
        return os.path.abspath(path) # 如果是相对路径，转换为绝对路径

app = Flask(__name__)
@app.route('/translate', methods=['POST'])
def translate():
    data = request.get_json()
    input_path = data.get('filePath')
    try:
        os.makedirs(translated_dir, exist_ok=True)
        print("### translating ###: ", input_path)

        # 执行pdf2zh翻译, 用户可以自定义命令内容:
        os.system(pdf2zh + ' \"' + str(input_path) + '\" --t ' + str(thread_num)+ ' --output ' + translated_dir + " --config " + config_path)

        abs_translated_dir = get_absolute_path(translated_dir)
        translated_path1 = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-mono.pdf'))
        translated_path2 = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-dual.pdf'))

        translated_path1.replace('\\', '/')
        translated_path2.replace('\\', '/')

        return jsonify({'status': 'success', 'translatedPath1': translated_path1, 'translatedPath2': translated_path2}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port_num)
```

#### 添加配置文件 & 修改翻译中文字体（可选）

推荐使用霞鹜文楷字体, 配置方法:

0. 下载霞鹜文楷字体: https://github.com/lxgw/LxgwWenKai/releases/download/v1.510/LXGWWenKai-Regular.ttf
1. 新建config.json文件

```json
{
  "NOTO_FONT_PATH": "./LXGWWenKai-Regular.ttf"
}
```

`NOTO_FONT_PATH`为您的自定义字体路径

2. python脚本修改为:

```python
from flask import Flask, request, jsonify
import subprocess
import os

pdf2zh = "pdf2zh"                # 设置pdf2zh指令: 默认为'pdf2zh'
thread_num = 4                   # 设置线程数: 默认为4
translated_dir = "./translated/" # 设置翻译文件的输出路径(临时路径, 可以在翻译后删除)
port_num = 8888                  # 设置端口号: 默认为8888
config_path = 'config.json'      # 添加配置文件: 自定义字体, 指定翻译引擎等

app = Flask(__name__)
@app.route('/translate', methods=['POST'])
def translate():
    data = request.get_json()
    input_path = data.get('filePath')
    try:
        os.makedirs(translated_dir, exist_ok=True)
        print("### translating ###: ", input_path)

        # 执行带配置文件的pdf2zh翻译, 用户可以自定义命令内容:
        os.system(pdf2zh + ' \"' + str(input_path) + '\" --t ' + str(thread_num)+ ' --output ' + translated_dir + " --config " + config_path)

        abs_translated_dir = get_absolute_path(translated_dir)
        translated_path1 = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-mono.pdf'))
        translated_path2 = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-dual.pdf'))

        translated_path1.replace('\\', '/')
        translated_path2.replace('\\', '/')

        return jsonify({'status': 'success', 'translatedPath1': translated_path1, 'translatedPath2': translated_path2}), 200

    except subprocess.CalledProcessError as e:
        return jsonify({'status': 'error', 'message': e.stderr}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port_num)
```

3. 其他配置的修改同理: 修改config.json即可, 具体参考: [PDF2zh Config File](https://github.com/Byaidu/PDFMathTranslate/blob/main/docs/ADVANCED.md#cofig)

### 第二步

在Zotero-设置中，输入您的Python Server IP + '/translate'

默认为: `http://localhost:8888/translate`

![image2](./image2.png)

## 使用方法

右键选择条目或者附件 - 点击 Translate PDF ![image](./image.png)

条目中将会添加两个翻译后的文件

![image3](./image3.png)

# 致谢

- @Byaidu [PDF2zh](https://github.com/Byaidu/PDFMathTranslate)
- @windingwind [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)

# 💗

欢迎提issue或者参与贡献

# TODO LIST

- [] 支持远程部署
- [] 支持在zotero perference中设置pdf2zh参数
