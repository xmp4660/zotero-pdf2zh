## server.py v3.0.3
# guaguastandup
# zotero-pdf2zh
import os
from flask import Flask, request, jsonify, send_file
import base64
import subprocess
import json, toml
import shutil
from pypdf import PdfReader
from utils.venv import VirtualEnvManager
from utils.config import Config
from utils.cropper import Cropper
import traceback
import argparse
import sys  # NEW: 用于退出脚本
import re   # NEW: 用于解析版本号
import urllib.request # NEW: 用于下载文件
import zipfile # NEW: 用于解压文件
import tempfile # 引入tempfile来处理临时目录

# NEW: 定义当前脚本版本  # Current version of the script
__version__ = "3.0.3" 

############# config file #########
pdf2zh      = 'pdf2zh'
pdf2zh_next = 'pdf2zh_next'
venv        = 'venv' 

# 强制设置标准输出和标准错误的编码为 UTF-8
# sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
# sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 所有系统: 获取当前脚本server.py所在的路径
root_path     = os.path.dirname(os.path.abspath(__file__))
config_folder = os.path.join(root_path, 'config')
output_folder = os.path.join(root_path, 'translated')
config_path = { # 配置文件路径
    pdf2zh:      os.path.join(config_folder, 'config.json'),
    pdf2zh_next: os.path.join(config_folder, 'config.toml'),
    venv:        os.path.join(config_folder, 'venv.json'),
}
######### venv config #########
venv_name = { # venv名称
    pdf2zh:      'zotero-pdf2zh-venv',
    pdf2zh_next: 'zotero-pdf2zh-next-venv',
}

default_env_tool = 'uv' # 默认使用uv管理venv
enable_venv = True

PORT = 8890 # 默认端口号

class PDFTranslator:
    def __init__(self, args):
        self.app = Flask(__name__)
        if args.enable_venv:
            self.env_manager = VirtualEnvManager(config_path[venv], venv_name, default_env_tool)
        self.cropper = Cropper()
        self.setup_routes()

    def setup_routes(self):
        self.app.add_url_rule('/translate', 'translate', self.translate, methods=['POST'])
        self.app.add_url_rule('/crop', 'crop', self.crop, methods=['POST']) 
        self.app.add_url_rule('/crop-compare', 'crop-compare', self.crop_compare, methods=['POST']) 
        self.app.add_url_rule('/compare', 'compare', self.compare, methods=['POST'])
        self.app.add_url_rule('/translatedFile/<filename>', 'download', self.download_file)

    ##################################################################
    def process_request(self):
        data = request.get_json() # 获取请求的data
        config = Config(data)
        
        file_content = data.get('fileContent', '')
        if file_content.startswith('data:application/pdf;base64,'):
            file_content = file_content[len('data:application/pdf;base64,'):]

        input_path = os.path.join(output_folder, data['fileName'])
        with open(input_path, 'wb') as f:
            f.write(base64.b64decode(file_content))
        
        # input_path表示保存的pdf源文件路径
        return input_path, config

    # 下载文件 /translatedFile/<filename>
    def download_file(self, filename):
        try:
            file_path = os.path.join(output_folder, filename)
            if os.path.exists(file_path):
                return send_file(file_path, as_attachment=True)
        except Exception as e:
            traceback.print_exc()
            return jsonify({'status': 'error', 'message': str(e)}), 500

    ############################# 核心逻辑 #############################
    # 翻译 /translate
    def translate(self):
        try:
            input_path, config = self.process_request()
            infile_type = self.get_filetype(input_path)
            engine = config.engine
            if infile_type != 'origin':
                return jsonify({'status': 'error', 'message': 'Input file must be an original PDF file.'}), 400
            if engine == pdf2zh:
                print("🔍 [Zotero PDF2zh Server] PDF2zh_next 开始翻译文件...")
                fileList = self.translate_pdf(input_path, config)
                mono_path, dual_path = fileList[0], fileList[1]
                if config.mono_cut:
                    mono_cut_path = self.get_filename_after_process(mono_path, 'mono-cut', engine)
                    self.cropper.crop_pdf(config, mono_path, 'mono', mono_cut_path, 'mono-cut')
                    if os.path.exists(mono_cut_path):
                        fileList.append(mono_cut_path)
                if config.dual_cut:
                    dual_cut_path = self.get_filename_after_process(dual_path, 'dual-cut', engine)
                    self.cropper.crop_pdf(config, dual_path, 'dual', dual_cut_path, 'dual-cut')
                    if os.path.exists(dual_cut_path):
                        fileList.append(dual_cut_path)
                if config.crop_compare:
                    crop_compare_path = self.get_filename_after_process(dual_path, 'crop-compare', engine)
                    self.cropper.crop_pdf(config, dual_path, 'dual', crop_compare_path, 'crop-compare')
                    if os.path.exists(crop_compare_path):
                        fileList.append(crop_compare_path)
                if config.compare:
                    compare_path = self.get_filename_after_process(dual_path, 'compare', engine)
                    self.cropper.merge_pdf(dual_path, compare_path)
                    if os.path.exists(compare_path):
                        fileList.append(compare_path)
                
            elif engine == pdf2zh_next:
                print("🔍 [Zotero PDF2zh Server] PDF2zh_next 开始翻译文件...")

                if config.mono_cut:
                    config.no_mono = False
                if config.dual_cut or config.crop_compare or config.compare:
                    config.no_dual = False

                fileList = []
                retList = self.translate_pdf_next(input_path, config)
                if config.no_mono:
                    dual_path = retList[0]
                else:
                    mono_path, dual_path = retList[0], retList[1]
                    fileList.append(mono_path)
                
                LR_dual_path = dual_path.replace('.dual.pdf', '.LR_dual.pdf')
                TB_dual_path = dual_path.replace('.dual.pdf', '.TB_dual.pdf')

                if config.dual_cut or config.crop_compare or config.compare:
                    if config.dual_mode == 'LR':
                        self.cropper.pdf_dual_mode(dual_path, 'LR', 'TB')
                        fileList.append(LR_dual_path)
                    else:
                        os.rename(dual_path, TB_dual_path)
                        fileList.append(TB_dual_path)
                else:
                    fileList.append(dual_path)

                if config.mono_cut:
                    mono_cut_path = self.get_filename_after_process(mono_path, 'mono-cut', engine)
                    self.cropper.crop_pdf(config, mono_path, 'mono', mono_cut_path, 'mono-cut')
                    if os.path.exists(mono_cut_path):
                        fileList.append(mono_cut_path)

                if config.dual_cut: # use TB_dual_path
                    dual_cut_path = self.get_filename_after_process(TB_dual_path, 'dual-cut', engine)
                    self.cropper.crop_pdf(config, TB_dual_path, 'dual', dual_cut_path, 'dual-cut')
                    if os.path.exists(dual_cut_path):
                        fileList.append(dual_cut_path)

                if config.crop_compare: # use TB_dual_path
                    crop_compare_path = self.get_filename_after_process(TB_dual_path, 'crop-compare', engine)
                    self.cropper.crop_pdf(config, TB_dual_path, 'dual', crop_compare_path, 'crop-compare')
                    if os.path.exists(crop_compare_path):
                        fileList.append(crop_compare_path)

                if config.compare: # use TB_dual_path
                    if config.dual_mode == 'TB':
                        compare_path = self.get_filename_after_process(TB_dual_path, 'compare', engine)
                        self.cropper.merge_pdf(TB_dual_path, compare_path)
                        if os.path.exists(compare_path):
                            fileList.append(compare_path)
                    else:
                        print("🐲 无需生成compare文件, 等同于dual文件(Left&Right)")
            else:
                raise ValueError(f"⚠️ [Zotero PDF2zh Server] 输入了不支持的翻译引擎: {engine}, 目前脚本仅支持: pdf2zh/pdf2zh_next")
            
            fileNameList = [os.path.basename(path) for path in fileList]
            for file_path in fileList:
                size = os.path.getsize(file_path)
                print(f"🐲 翻译成功, 生成文件: {file_path}, 大小为: {size/1024.0/1024.0:.2f} MB")
            return jsonify({'status': 'success', 'fileList': fileNameList}), 200
        except Exception as e:
            print(f"❌ [Zotero PDF2zh Server] /translate Error: {e}\n")
            traceback.print_exc()
            return jsonify({'status': 'error', 'message': str(e)}), 500

    # 裁剪 /crop
    def crop(self):
        try:
            input_path, config = self.process_request()
            infile_type = self.get_filetype(input_path)

            new_type = self.get_filetype_after_crop(input_path)
            if new_type == 'unknown':
                return jsonify({'status': 'error', 'message': f'Input file is not valid PDF type {infile_type} for crop()'}), 400

            new_path = self.get_filename_after_process(input_path, new_type, config.engine)
            self.cropper.crop_pdf(config, input_path, infile_type, new_path, new_type)

            print(f"🔍 [Zotero PDF2zh Server] 开始裁剪文件: {input_path}, {infile_type}, 裁剪类型: {new_type}, {new_path}")
            
            if os.path.exists(new_path):
                fileName = os.path.basename(new_path)
                return jsonify({'status': 'success', 'fileList': [fileName]}), 200
            else:
                return jsonify({'status': 'error', 'message': f'Crop failed: {new_path} not found'}), 500
        except Exception as e:
            traceback.print_exc()
            print(f"❌ [Zotero PDF2zh Server] /crop Error: {e}\n")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def crop_compare(self):
        try:
            input_path, config = self.process_request()
            infile_type = self.get_filetype(input_path)
            engine = config.engine

            if infile_type == 'origin':
                if engine == pdf2zh or engine != pdf2zh_next: # 默认为pdf2zh
                    config.engine = 'pdf2zh'
                    fileList = self.translate_pdf(input_path, config)
                    dual_path = fileList[1] # 会生成mono和dual文件
                    if not os.path.exists(dual_path):
                        return jsonify({'status': 'error', 'message': f'Unable to translate origin file, could not generate: {dual_path}'}), 500
                    input_path = dual_path # crop_compare输入的是dual路径的文件

                else: # pdf2zh_next
                    config.dual_mode = 'TB'
                    config.no_dual = False
                    config.no_mono = True
                    fileList = self.translate_pdf_next(input_path, config)
                    dual_path = fileList[0] # 仅生成dual文件
                    if not os.path.exists(dual_path):
                        return jsonify({'status': 'error', 'message': f'Dual file not found: {dual_path}'}), 500
                    input_path = dual_path

            infile_type = self.get_filetype(input_path)
            new_type = self.get_filetype_after_cropCompare(input_path)
            if new_type == 'unknown':
                return jsonify({'status': 'error', 'message': f'Input file is not valid PDF type {infile_type} for crop-compare()'}), 400
            
            new_path = self.get_filename_after_process(input_path, new_type, engine)
            if infile_type == 'dual-cut':
                self.cropper.merge_pdf(input_path, new_path)
            else:
                new_path = self.get_filename_after_process(input_path, new_type, engine)
                self.cropper.crop_pdf(config, input_path, infile_type, new_path, new_type)
            if os.path.exists(new_path):
                fileName = os.path.basename(new_path)
                # 打印生成文件的大小
                size = os.path.getsize(new_path)
                print(f"🐲 双语对照成功(裁剪后拼接), 生成文件: {fileName}, 大小为: {size/1024.0/1024.0:.2f} MB")
                return jsonify({'status': 'success', 'fileList': [fileName]}), 200
            else:
                return jsonify({'status': 'error', 'message': f'Crop-compare failed: {new_path} not found'}), 500
        except Exception as e:
            traceback.print_exc()
            print(f"❌ [Zotero PDF2zh Server] /crop-compare Error: {e}\n")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def compare(self):
        try:
            input_path, config = self.process_request()
            infile_type = self.get_filetype(input_path)
            engine = config.engine
            if infile_type == 'origin': 
                if engine == pdf2zh or engine != pdf2zh_next:
                    config.engine = 'pdf2zh'
                    fileList = self.translate_pdf(input_path, config)
                    dual_path = fileList[1]
                    if not os.path.exists(dual_path):
                        return jsonify({'status': 'error', 'message': f'Dual file not found: {dual_path}'}), 500
                    input_path = dual_path
                    infile_type = self.get_filetype(input_path)
                    new_type = self.get_filetype_after_compare(input_path)
                    if new_type == 'unknown':
                        return jsonify({'status': 'error', 'message': f'Input file is not valid PDF type {infile_type} for compare()'}), 400
                    new_path = self.get_filename_after_process(input_path, new_type, engine)
                    self.cropper.merge_pdf(input_path, new_path)
                else:
                    config.dual_mode = 'LR' # 直接生成dualMode为LR的文件, 就是Compare模式
                    config.no_dual = True
                    config.no_mono = False
                    fileList = self.translate_pdf_next(input_path, config)
                    dual_path = fileList[0]
                    if not os.path.exists(dual_path):
                        return jsonify({'status': 'error', 'message': f'Dual file not found: {dual_path}'}), 500
                    new_path = self.get_filename_after_process(input_path, 'compare', engine)
            else:
                new_type = self.get_filetype_after_compare(input_path)
                if new_type == 'unknown':
                    return jsonify({'status': 'error', 'message': f'Input file is not valid PDF type {infile_type} for compare()'}), 400
                new_path = self.get_filename_after_process(input_path, new_type, engine)
                self.cropper.merge_pdf(input_path, new_path)
            if os.path.exists(new_path):
                fileName = os.path.basename(new_path)
                print(f"🐲 双语对照成功, 生成文件: {fileName}, 大小为: {os.path.getsize(new_path)/1024.0/1024.0:.2f} MB")
                return jsonify({'status': 'success', 'fileList': [fileName]}), 200
            else:
                return jsonify({'status': 'error', 'message': f'Compare failed: {new_path} not found'}), 500
        except Exception as e:
            traceback.print_exc()
            print(f"❌ [Zotero PDF2zh Server] /compare Error: {e}\n")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def get_filetype(self, path):
        if 'mono.pdf' in path:
            return 'mono'
        elif 'dual.pdf' in path:
            return 'dual'
        elif 'dual-cut.pdf' in path:
            return 'dual-cut'
        elif 'mono-cut.pdf' in path:
            return 'mono-cut'
        elif 'crop-compare.pdf' in path: # 裁剪后才merge
            return 'crop-compare'  
        elif 'compare.pdf' in path:      # 无需裁剪, 直接merge
            return 'compare'
        elif 'cut.pdf' in path:
            return 'origin-cut'
        return 'origin'

    def get_filetype_after_crop(self, path):
        filetype = self.get_filetype(path)
        print(f"🔍 [Zotero PDF2zh Server] 获取文件类型: {filetype} from {path}")
        if filetype == 'origin':
            return 'origin-cut'
        elif filetype == 'mono':
            return 'mono-cut'
        elif filetype == 'dual':
            return 'dual-cut'
        return 'unknown'

    def get_filetype_after_cropCompare(self, path):
        filetype = self.get_filetype(path)
        if filetype == 'origin' or filetype == 'dual' or filetype == 'dual-cut':
            return 'crop-compare'
        return 'unknown'

    def get_filetype_after_compare(self, path):
        filetype = self.get_filetype(path)
        if filetype == 'origin' or filetype == 'dual':
            return 'compare'
        return 'unknown'
        
    def get_filename_after_process(self, inpath, outtype, engine):
        if engine == pdf2zh or engine != pdf2zh_next:
            intype = self.get_filetype(inpath)
            if intype == 'origin':
                if outtype == 'origin-cut':
                    return inpath.replace('.pdf', '-cut.pdf')
                return inpath.replace('.pdf', f'-{outtype}.pdf')
            return inpath.replace(f'{intype}.pdf', f'{outtype}.pdf')
        else:
            intype = self.get_filetype(inpath)
            if intype == 'origin':
                if outtype == 'origin-cut':
                    return inpath.replace('.pdf', '.cut.pdf')
                return inpath.replace('.pdf', f'.{outtype}.pdf')
            return inpath.replace(f'{intype}.pdf', f'{outtype}.pdf')

    def translate_pdf(self, input_path, config):
        # TODO: 如果翻译失败了, 自动执行跳过字体子集化, 并且显示生成的文件的大小
        config.update_config_file(config_path[pdf2zh])
        if config.targetLang == 'zh-CN': # TOFIX, pdf2zh 1.x converter没有通过
            config.targetLang = 'zh'
        if config.sourceLang == 'zh-CN': # TOFIX, pdf2zh 1.x converter没有通过
            config.sourceLang = 'zh'
        cmd = [
            pdf2zh, 
            input_path, 
            '--t', str(config.thread_num),
            '--output', str(output_folder),
            '--service', str(config.service),
            '--lang-in', str(config.sourceLang),
            '--lang-out', str(config.targetLang),
            '--config', str(config_path[pdf2zh]), # 使用默认的config path路径
        ]

        if config.skip_last_pages and config.skip_last_pages > 0:
            end = len(PdfReader(input_path).pages) - config.skip_last_pages
            cmd.append('-p '+str(1)+'-'+str(end))
        if config.skip_font_subsets:
            cmd.append('--skip-subset-fonts')
        if config.babeldoc:
            cmd.append('--babeldoc')
        try:
            if args.enable_venv:
                self.env_manager.execute_in_env(cmd)
            else:
                subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            print(f"⚠️ 翻译失败, 错误信息: {e}, 尝试跳过字体子集化, 重新渲染\n")
            cmd.append('--skip-subset-fonts')
            if args.enable_venv:
                self.env_manager.execute_in_env(cmd)
            else:
                subprocess.run(cmd, check=True)

        fileName = os.path.basename(input_path).replace('.pdf', '')
        output_path_mono = os.path.join(output_folder, f"{fileName}-mono.pdf")
        output_path_dual = os.path.join(output_folder, f"{fileName}-dual.pdf")
        output_files = [output_path_mono, output_path_dual]
        for f in output_files: # 显示生成的文件的大小
            size = os.path.getsize(f)
            print(f"🐲 pdf2zh 翻译成功, 生成文件: {f}, 大小为: {size/1024.0/1024.0:.2f} MB")
        return output_files
    
    def translate_pdf_next(self, input_path, config):
        service_map = {
            'ModelScope': 'modelscope',
            'openailiked': 'openaicompatible',
            'tencent': 'tencentmechinetranslation',
            'silicon': 'siliconflow',
            'qwen-mt': 'qwenmt'
        }
        if config.service in service_map:
            config.service = service_map[config.service]
        config.update_config_file(config_path[pdf2zh_next])

        cmd = [
            pdf2zh_next,
            input_path,
            '--' + config.service,
            '--qps', str(config.thread_num),
            '--output', str(output_folder),
            '--lang-in', str(config.sourceLang),
            '--lang-out', str(config.targetLang),
            '--config', str(config_path[pdf2zh_next]), # 使用默认的config path路径
        ]
        # TODO: 术语表的地址
        if config.no_watermark:
            cmd.append('--watermark-output-mode')
            cmd.append('no_watermark')
        else:
            cmd.append('--watermark-output-mode')
            cmd.append('watermarked')
        if config.skip_last_pages and config.skip_last_pages > 0:
            end = len(PdfReader(input_path).pages) - config.skip_last_pages
            cmd.append('--pages')
            cmd.append(f'{1}-{end}')
        if config.no_dual:
            cmd.append('--no-dual')
            config.no_mono = False
        elif config.no_mono:
            cmd.append('--no-mono')
        if config.trans_first:
            cmd.append('--dual-translate-first')
        if config.skip_clean:
            cmd.append('--skip-clean')
        if config.disable_rich_text_translate:
            cmd.append('--disable-rich-text-translate')
        if config.enhance_compatibility:
            cmd.append('--enhance-compatibility')
        if config.save_auto_extracted_glossary:
            cmd.append('--save-auto-extracted-glossary')
        if config.disable_glossary:
            cmd.append('--no-auto-extract-glossary')
        if config.dual_mode == 'TB': # TB or LR, LR是defualt的
            cmd.append('--use-alternating-pages-dual')
        if config.translate_table_text:
            cmd.append('--translate-table-text')
        if config.ocr:
            cmd.append('--ocr-workaround')
        if config.auto_ocr:
            cmd.append('--auto-enable-ocr-workaround')
        
        fileName = os.path.basename(input_path).replace('.pdf', '')
        no_watermark_mono = os.path.join(output_folder, f"{fileName}.no_watermark.{config.targetLang}.mono.pdf")
        no_watermark_dual = os.path.join(output_folder, f"{fileName}.no_watermark.{config.targetLang}.dual.pdf")
        watermark_mono = os.path.join(output_folder, f"{fileName}.{config.targetLang}.mono.pdf")
        watermark_dual = os.path.join(output_folder, f"{fileName}.{config.targetLang}.dual.pdf")

        output_path = []
        if config.no_watermark: # 有水印
            if not config.no_mono:
                output_path.append(no_watermark_mono)
            if not config.no_dual:
                output_path.append(no_watermark_dual)
        else: # 无水印
            if not config.no_mono:
                output_path.append(watermark_mono)
            if not config.no_dual:
                output_path.append(watermark_dual)
        if args.enable_venv:
            self.env_manager.execute_in_env(cmd)
        else:
            subprocess.run(cmd, check=True)
        for f in output_path:
            size = os.path.getsize(f)
            print(f"🐲 pdf2zh_next 翻译成功, 生成文件: {f}, 大小为: {size/1024.0/1024.0:.2f} MB")
        return output_path

    def run(self, port, debug=False):
        self.app.run(host='0.0.0.0', port=port, debug=debug)

def prepare_path():
    print("📖 [Zotero PDF2zh Server] 检查文件路径中...")
    # output folder
    os.makedirs(output_folder, exist_ok=True)
    # config file 路径和格式检查
    for (_, path) in config_path.items():
        if not os.path.exists(path):
            example_file = os.path.join(config_folder, os.path.basename(path) + '.example')
            if os.path.exists(example_file):
                shutil.copyfile(example_file, path)
        try:
            if path.endswith('.json'):
                with open(path, 'r', encoding='utf-8') as f:  # Specify UTF-8 encoding
                    json.load(f)
            elif path.endswith('.toml'):
                with open(path, 'r', encoding='utf-8') as f:  # Specify UTF-8 encoding
                    toml.load(f)
        except Exception as e:
            traceback.print_exc()
            print(f"⚠️ [Zotero PDF2zh Server] {path} 文件格式错误, 请检查文件格式! 错误信息: {e}\n")
    print("📖 [Zotero PDF2zh Server] 文件路径检查完成\n")

# ================================================================================
# ######################### NEW: 自动更新模块 ############################
# ================================================================================

def get_xpi_info_from_repo(owner, repo, branch='main', expected_version=None):
    """
    通过 GitHub API 扫描文件树查找.xpi文件。
    优先根据 expected_version 精确查找，如果找不到，则回退到查找任意.xpi文件。
    """
    api_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    try:
        print("  - 正在从项目文件库中扫描插件...")
        with urllib.request.urlopen(api_url, timeout=10) as response:
            if response.status != 200:
                print(f"  - 访问GitHub API失败，状态码: {response.status}")
                return None, None
            data = json.load(response)

        all_xpis = [item['path'] for item in data.get('tree', []) if item['path'].endswith('.xpi')]
        if not all_xpis:
            print("  - ⚠️ 未在项目中找到任何.xpi文件。")
            return None, None

        if expected_version:
            target_filename = f"zotero-pdf-2-zh-v{expected_version}.xpi"
            for xpi_path in all_xpis:
                if os.path.basename(xpi_path) == target_filename:
                    print(f"  - 成功找到匹配版本的插件: {target_filename}")
                    download_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{xpi_path}"
                    return download_url, target_filename
            print(f"  - ⚠️ 未找到与服务端版本 {expected_version} 匹配的插件。将尝试查找任意版本...")
        
        fallback_path = all_xpis[0]
        fallback_name = os.path.basename(fallback_path)
        download_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{fallback_path}"
        print(f"  - 查找到一个插件文件: {fallback_name} (作为备用选项)")
        return download_url, fallback_name
    except Exception as e:
        print(f"  - ⚠️ 扫描插件失败 (可能是网络问题): {e}")
        return None, None

def perform_update_new_logic(expected_version=None):
    """
    采用“合并更新”逻辑，确保用户文件和配置的绝对安全。
    流程: 1. 备份 -> 2. 下载解压到临时目录 -> 3. 合并文件 -> 4. 清理
    """
    print("🚀 开始更新 (安全模式 v2)...请稍候。")
    owner, repo = 'guaguastandup', 'zotero-pdf2zh'
    # 假设 root_path 是你当前的 server 文件夹路径
    # 例如: root_path = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(root_path) 
    print(f"   - 项目根目录: {project_root}")
    print(f"   - 当前服务目录: {root_path}")
    # --- 步骤 0: 定义路径 ---
    backup_path = os.path.join(project_root, f"server_backup_{expected_version or 'latest'}")
    zip_filename = f"server_{expected_version or 'latest'}.zip"
    server_zip_path = os.path.join(project_root, zip_filename)
    # 如果旧的备份存在，先清理，防止混淆
    if os.path.exists(backup_path):
        print(f"   - 发现旧的备份文件夹，正在清理: {backup_path}")
        shutil.rmtree(backup_path)
    try:
        # --- 步骤 1: 备份当前server目录 ---
        print(f"  - 正在备份当前目录 -> {backup_path}")
        shutil.copytree(root_path, backup_path, dirs_exist_ok=True)
        print("  - ✅ 备份完成。")
        # --- 步骤 2: 下载并解压到临时目录 ---
        # 下载 XPI 插件（此逻辑保持不变）
        xpi_url, xpi_filename = get_xpi_info_from_repo(owner, repo, 'main', expected_version)
        if xpi_url:
            xpi_save_path = os.path.join(project_root, xpi_filename)
            print(f"  - 正在下载插件文件 ({xpi_filename})...")
            if os.path.exists(xpi_save_path): os.remove(xpi_save_path)
            urllib.request.urlretrieve(xpi_url, xpi_save_path)
            print("  - 插件文件下载完成。")
        # 下载服务端压缩包
        server_zip_url = f"https://github.com/{owner}/{repo}/raw/main/server.zip" # 使用raw链接更稳定
        print(f"  - 正在下载服务端文件 ({zip_filename})...")
        urllib.request.urlretrieve(server_zip_url, server_zip_path)
        print("  - 服务端文件下载完成。")

        # 创建一个临时目录来解压新版本，这是关键！
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"  - 正在解压新版本到临时目录: {temp_dir}")
            with zipfile.ZipFile(server_zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            # 假设解压后，所有文件都在 temp_dir/server/ 目录下
            new_server_path = os.path.join(temp_dir, 'server')
            if not os.path.exists(new_server_path):
                # 有时候zip包里可能没有顶层'server'目录
                new_server_path = temp_dir 

            # --- 步骤 3: 合并文件到现有目录 ---
            print("  - 正在合并新文件...")
            migrated_count = 0
            # 遍历新版本目录下的所有文件和文件夹
            for item_name in os.listdir(new_server_path):
                source_item = os.path.join(new_server_path, item_name)
                dest_item = os.path.join(root_path, item_name)
                print(f"    - 正在同步: {item_name}")
                if os.path.isdir(source_item): # 如果是目录，则递归地复制和覆盖
                    shutil.copytree(source_item, dest_item, dirs_exist_ok=True)
                else: # 如果是文件，则直接复制和覆盖
                    shutil.copy2(source_item, dest_item)
                migrated_count += 1
            print(f"  - ✅ {migrated_count} 个项目文件/文件夹已同步更新。")
            print("  - 您的 `config` 文件夹和自建文件均未受影响。")
        # --- 步骤 4: 清理 ---
        print("  - 正在清理临时文件...")
        shutil.rmtree(backup_path)      # 成功后删除备份
        os.remove(server_zip_path)      # 删除下载的zip包
        print("  - ✅ 清理完成。")
        print("\n✅ 更新成功！")
        if xpi_filename:
            print(f"   - 最新的插件文件 '{xpi_filename}' 已下载到您的项目主目录, 请将插件文件重新安装到Zotero中。")
        print("   - 请重新启动 server.py 脚本以应用新版本。")

    except Exception as e:
        print(f"\n❌ 更新失败: {e}")
        print("  - 正在尝试从备份回滚...")
        # 回滚机制：如果备份存在，用备份覆盖当前目录
        if os.path.exists(backup_path):
            # 先删除可能被破坏的当前目录
            if os.path.exists(root_path): 
                shutil.rmtree(root_path)
            # 将备份移动回来
            shutil.move(backup_path, root_path)
            print("  - ✅ 已成功回滚到更新前的状态。")
        else:
            print("  - ⚠️ 无法找到备份，回滚失败。可能需要手动恢复。")
    finally:
        if os.path.exists(server_zip_path): # 无论成功失败，都确保删除下载的zip文件
            os.remove(server_zip_path)
        sys.exit()


def check_for_updates():
    """
    从 GitHub 检查是否有新版本。如果存在，则返回(本地版本, 远程版本)，否则返回None。
    """
    print("💡 [自动更新] 正在检查更新...")
    remote_script_url = "https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/main/server/server.py"
    try:
        with urllib.request.urlopen(remote_script_url, timeout=10) as response:
            remote_content = response.read().decode('utf-8')
        match = re.search(r'__version__\s*=\s*["\'](.+?)["\']', remote_content)
        if not match:
            print("⚠️ [自动更新] 无法在远程文件中找到版本号。")
            return None
        remote_version = match.group(1)
        local_version = __version__
        if tuple(map(int, remote_version.split('.'))) > tuple(map(int, local_version.split('.'))):
            return local_version, remote_version
        else:
            print("✅ 您的程序已是最新版本。")
            return None
    except Exception as e:
        print(f"⚠️ [自动更新] 检查更新失败 (可能是网络问题)，已跳过。错误: {e}")
        return None

# ================================================================================
# ######################### 主程序入口 ############################
# ================================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser() 
    parser.add_argument('--enable_venv', type=bool, default=enable_venv, help='脚本自动开启虚拟环境')
    parser.add_argument('--env_tool', type=str, default=default_env_tool, help='虚拟环境管理工具, 默认使用 uv')
    parser.add_argument('--port', type=int, default=PORT, help='Port to run the server on')
    parser.add_argument('--debug', type=bool, default=False, help='Enable debug mode')
    # 添加一个 --no-update 参数，方便用户在需要时跳过更新检查
    parser.add_argument('--check_update', type=bool, default=True, help='启动时检查更新')
    args = parser.parse_args()
    # 启动时自动检查更新 (除非用户指定 --no-update)
    if args.check_update:
        update_info = check_for_updates()
        if update_info:
            local_v, remote_v = update_info
            print(f"🎉 发现新版本！当前版本: {local_v}, 最新版本: {remote_v}")
            try:
                answer = input("是否要立即更新? (y/n): ").lower()
            except (EOFError, KeyboardInterrupt):
                # 修复在某些非交互式环境中 input() 可能报错的问题
                answer = 'n'
                print("\n无法获取用户输入，已自动取消更新。")
            if answer in ['y', 'yes']:
                perform_update_new_logic(expected_version=remote_v) 
            else:
                print("👌 已取消更新。")
    # 正常的启动流程
    prepare_path()
    translator = PDFTranslator(args)
    translator.run(args.port, debug=args.debug)