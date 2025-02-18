from flask import Flask, request, jsonify
import os
import base64
import subprocess
import copy
from flask import Flask, send_file, abort
from pypdf import PdfWriter, PdfReader
from pypdf.generic import RectangleObject
import sys

######################################## 默认配置 ########################################
port_num = 8888                     # 设置端口号: 默认为8888
pdf2zh = "pdf2zh"                   # 设置pdf2zh指令: 默认为'pdf2zh'

######### 可以在Zotero偏好设置中配置以下参数, Zotero配置会覆盖本文件中的配置参数 #########
thread_num = 4                      # 设置线程数: 默认为4
service = 'bing'                    # 设置翻译服务: 默认为bing
translated_dir = "./translated/"    # 设置翻译文件的输出路径(临时路径, 可以在翻译后删除)
config_path = './config.json'       # 设置PDF2zh配置文件路径
##########################################################################################

class Config:
    def __init__(self, request):
        self.thread_num = request.get_json().get('threadNum')
        if self.thread_num == None or self.thread_num == "":
            self.thread_num = thread_num

        self.service = request.get_json().get('engine')
        if self.service == None or self.service == "":
            self.service = service

        self.translated_dir = request.get_json().get('outputPath')
        if self.translated_dir == None or self.translated_dir == "":
            self.translated_dir = translated_dir

        self.config_path = request.get_json().get('configPath')
        if self.config_path == None or self.config_path == "":
            self.config_path = config_path

        self.mono_cut = request.get_json().get('mono_cut')
        self.dual_cut = request.get_json().get('dual_cut')
        self.compare = request.get_json().get('compare')
        self.mono = request.get_json().get('mono')
        self.dual = request.get_json().get('dual')

        print("################# Config #################")
        print("thread_num: ", self.thread_num)
        print("service: ", self.service)
        print("translated_dir: ", self.translated_dir)
        print("config_path: ", self.config_path)
        print("mono_cut: ", self.mono_cut)
        print("dual_cut: ", self.dual_cut)
        print("compare: ", self.compare)
        print("mono", self.mono)
        print("dual", self.dual)
        print("##########################################")

def get_absolute_path(path):
    if os.path.isabs(path):
        return path 
    else:
        return os.path.abspath(path)

def get_file_from_request(request): 
    config = Config(request)
    data = request.get_json()
    path = data.get('filePath')
    path = path.replace('\\', '/') # 把所有反斜杠\替换为正斜杠/ (Windows->Linux/MacOS)
    if not os.path.exists(path):
        file_content = data.get('fileContent')
        input_path = os.path.join(config.translated_dir, os.path.basename(path))
        if file_content:
            if file_content.startswith('data:application/pdf;base64,'): # 移除 Base64 编码中的前缀(如果有)
                file_content = file_content[len('data:application/pdf;base64,'):]
            file_data = base64.b64decode(file_content) # 解码 Base64 内容
            with open(input_path, 'wb') as f:
                f.write(file_data)
    else:
        input_path = path
    return input_path, config

def translate_pdf(input_path, config):
    os.makedirs(config.translated_dir, exist_ok=True)
    print("### translating ###: ", input_path)
    # 执行pdf2zh翻译, 用户可以自定义命令内容:
    command = [
        pdf2zh,
        input_path,
        '--t', str(config.thread_num),
        '--output', config.translated_dir,
        '--service', config.service,
        '--config', config.config_path
    ]
    subprocess.run(command, check=False)
    abs_translated_dir = get_absolute_path(config.translated_dir)  
    print("abs_translated_dir: ", abs_translated_dir)
    mono =  os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-mono.pdf'))
    dual = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-dual.pdf'))
    return mono, dual

app = Flask(__name__)
@app.route('/translate', methods=['POST'])
def translate():
    input_path, config = get_file_from_request(request)
    try:
        mono, dual = translate_pdf(input_path, config)
        if config.mono_cut == "true":
            path = mono.replace('-mono.pdf', '-mono-cut.pdf')
            split_and_merge_pdf(mono, path, compare = False)
        if config.dual_cut == "true":
            path = dual.replace('-dual.pdf', '-dual-cut.pdf')
            split_and_merge_pdf(dual, path, compare = False)
        if config.compare == "true":
            path = dual.replace('.pdf', '-compare.pdf')
            split_and_merge_pdf(dual, path, compare=True)
        if not os.path.exists(mono) or not os.path.exists(dual):
            raise Exception("pdf2zh failed to generate translated files")
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/translatedFile/<filename>')
def download(filename):
    print("filename: ", filename)
    directory = translated_dir
    abs_directory = get_absolute_path(directory)
    file_path = os.path.join(abs_directory, filename)
    print("file_path: ", file_path)
    if not os.path.isfile(file_path):
        return "File not found", 404
    return send_file(file_path, as_attachment=True, download_name=filename)

# 新增了一个cut pdf函数，用于切割双栏pdf文件
def split_and_merge_pdf(input_pdf, output_pdf, compare=False):
    writer = PdfWriter()
    print("### cutting file ###: ", input_pdf)
    if 'dual' in input_pdf:
        readers = [PdfReader(input_pdf) for i in range(4)]
        for i in range(0, len(readers[0].pages), 2):
            original_media_box = readers[0].pages[i].mediabox
            width = original_media_box.width
            height = original_media_box.height

            left_page_1 = readers[0].pages[i]
            left_page_1.mediabox= RectangleObject((0, 0, width / 2, height))
            left_page_2 = readers[1].pages[i+1]
            left_page_2.mediabox = RectangleObject((0, 0, width / 2, height))

            right_page_1 = readers[2].pages[i]
            right_page_1.mediabox = RectangleObject((width / 2, 0, width, height))
            right_page_2 = readers[3].pages[i+1]
            right_page_2.mediabox = RectangleObject((width / 2, 0, width, height))

            if compare == True:
                blank_page_1 = writer.add_blank_page(width, height)
                blank_page_1.merge_transformed_page(left_page_1, (1, 0, 0, 1, 0, 0))
                blank_page_1.merge_transformed_page(left_page_2, (1, 0, 0, 1, width / 2, 0))
                blank_page_2 = writer.add_blank_page(width, height)
                blank_page_2.merge_transformed_page(right_page_1, (1, 0, 0, 1, -width / 2, 0))
                blank_page_2.merge_transformed_page(right_page_2, (1, 0, 0, 1, 0, 0))
            else:
                writer.add_page(left_page_1)
                writer.add_page(left_page_2)
                writer.add_page(right_page_1)
                writer.add_page(right_page_2)
    else: 
        reader = PdfReader(input_pdf)
        for i in range(len(reader.pages)):
            page = reader.pages[i]

            original_media_box = page.mediabox
            width = original_media_box.width
            height = original_media_box.height

            left_page = copy.deepcopy(page)
            left_page.mediabox = RectangleObject((0, 0, width / 2, height))
            right_page = copy.deepcopy(page)
            right_page.mediabox = RectangleObject((width / 2, 0, width, height))

            writer.add_page(left_page)
            writer.add_page(right_page)

    with open(output_pdf, "wb") as output_file:
        writer.write(output_file)

# 新增了一个cut接口，用于切割双栏pdf文件
@app.route('/cut', methods=['POST'])
def cut():
    input_path, _ = get_file_from_request(request)
    try:
        os.makedirs(translated_dir, exist_ok=True)
        print("### cut ###: ", input_path)
        abs_translated_dir = get_absolute_path(translated_dir)  
        translated_path = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-cut.pdf'))
        split_and_merge_pdf(input_path, translated_path)
        if not os.path.exists(translated_path):
            raise Exception("failed to generate cutted files")
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 新增了一个cut-compare接口，用于生成中英对照文件
@app.route('/cut-compare', methods=['POST'])
def cut_compare():
    input_path, config = get_file_from_request(request)
    try:
        os.makedirs(config.translated_dir, exist_ok=True)
        print("### compare ###: ", input_path)
        abs_translated_dir = get_absolute_path(translated_dir)  
        if 'dual' in input_path:
            translated_path = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-compare.pdf'))
            split_and_merge_pdf(input_path, translated_path, compare=True)
        else:
            _, dual = translate_pdf(input_path, config)
            translated_path = dual.replace('-dual.pdf', '-compare.pdf')
            split_and_merge_pdf(dual, translated_path, compare=True)

        if not os.path.exists(translated_path):
            raise Exception("failed to generate cutted files")
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
    
if __name__ == '__main__':
    if len(sys.argv) > 1:
        port_num = int(sys.argv[1])
    app.run(host='0.0.0.0', port=port_num)
