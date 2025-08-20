## server.py v3.0.2
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

__version__ = "3.0.1" # NEW: 定义当前脚本版本  # Current version of the script

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

# ##################### NEW: 自动更新函数 #####################
# NEW (v2): 更智能的自动更新函数，会保留用户自建的文件
# NEW (v3): 基于用户思路的“备份-迁移”式更新，更安全、更清晰
def perform_update():
    """
    采用“先备份，再迁移”的逻辑进行更新。
    1. 将当前文件夹重命名为 backup。
    2. 解压新版。
    3. 将 backup 中的 config 和用户自建文件迁移到新版中。
    4. 清理 backup。
    """
    print("🚀 开始更新 (安全模式)...请稍候。")
    zip_url = "https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/refs/heads/main/server.zip"
    zip_path = os.path.join(os.path.dirname(root_path), "server_latest.zip") # 把zip下载到server文件夹的外面
    # root_path 指向当前的 server 文件夹
    backup_path = os.path.join(os.path.dirname(root_path), "server_backup")
    # --- 防御性检查 ---
    if os.path.exists(backup_path):
        print(f"⚠️ 检测到已存在的备份文件夹: {backup_path}，请先手动处理。")
        sys.exit()

    try:
        # --- 第1步: 下载 ZIP 文件 ---
        print("  - 正在下载最新版本...")
        urllib.request.urlretrieve(zip_url, zip_path)
        print("  - 下载完成。")

        # --- 第2步: 备份当前整个 server 文件夹 ---
        print(f"  - 正在备份当前目录 -> {backup_path}")
        os.rename(root_path, backup_path)

        # --- 第3步: 解压出新的 server 文件夹 ---
        print(f"  - 正在解压新版本 -> {root_path}")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # server.zip 解压出来会包含一个 server/ 目录
            zip_ref.extractall(os.path.dirname(root_path))
        # --- 第4步: 迁移核心配置和用户自建文件 ---
        print("  - 正在从备份中迁移您的文件...")
        # 4a. 迁移 config 文件夹 (最重要)
        backup_config_path = os.path.join(backup_path, 'config')
        new_config_path = os.path.join(root_path, 'config')
        if os.path.exists(backup_config_path):
            if os.path.exists(new_config_path):
                shutil.rmtree(new_config_path) # 删除新版的默认config
            shutil.move(backup_config_path, new_config_path) # 移动备份的config
            print("    - 核心配置 `config` 已迁移。")
        # 4b. 迁移用户自己添加的文件或文件夹
        migrated_count = 0
        for item_name in os.listdir(backup_path):
            # config 已经处理过了，跳过
            if item_name == 'config':
                continue
            backup_item_path = os.path.join(backup_path, item_name)
            new_item_path = os.path.join(root_path, item_name)
            
            # 如果备份中的文件在新版里不存在，说明是用户自建的，需要迁移
            if not os.path.exists(new_item_path):
                print(f"    - 发现并迁移用户自建文件: {item_name}")
                if os.path.isdir(backup_item_path):
                    shutil.copytree(backup_item_path, new_item_path)
                else:
                    shutil.copy2(backup_item_path, new_item_path)
                migrated_count += 1
        if migrated_count > 0:
            print(f"  - {migrated_count} 个用户自建文件/文件夹已迁移。")
        else:
            print("  - 未发现其他用户自建文件。")
        # --- 第5步: 清理 ---
        print("  - 正在清理备份文件...")
        shutil.rmtree(backup_path)
        os.remove(zip_path)
        print("\n✅ 更新成功！")
        print("请重新启动 server.py 脚本以应用新版本。")
    except Exception as e:
        print(f"\n❌ 更新失败: {e}")
        print("  - 正在尝试回滚...")
        # 如果更新失败，尝试恢复备份
        if os.path.exists(backup_path):
            if os.path.exists(root_path):
                shutil.rmtree(root_path) # 移除不完整的更新
            os.rename(backup_path, root_path) # 恢复原始目录
            print("  - 已成功回滚到更新前的状态。")
        else:
            print("  - 无法找到备份，可能需要手动恢复。")
    finally:
        # 确保下载的 zip 文件最终被删除
        if os.path.exists(zip_path):
            os.remove(zip_path)
        sys.exit()

def check_for_updates():
    # 从 GitHub 检查是否有新版本, 并询问用户是否更新。
    print("💡 [自动更新] 正在检查更新...")
    remote_script_url = "https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/main/server/server.py"
    try:
        with urllib.request.urlopen(remote_script_url, timeout=5) as response:
            remote_content = response.read().decode('utf-8')
        # 使用正则表达式匹配版本号
        match = re.search(r'__version__\s*=\s*["\'](.+?)["\']', remote_content)
        if not match:
            print("⚠️ [自动更新] 无法在远程文件中找到版本号。")
            return
        remote_version = match.group(1)
        local_version = __version__
        if tuple(map(int, remote_version.split('.'))) > tuple(map(int, local_version.split('.'))): # 比较版本号 (例如 '3.1.0' > '3.0.1')
            print(f"🎉 发现新版本！当前版本: {local_version}, 最新版本: {remote_version}")
            answer = input("是否要立即更新? (y/n): ").lower()
            if answer in ['y', 'yes']:
                perform_update()
            else:
                print("👌 已取消更新。")
        else:
            print("✅ 您的程序已是最新版本。请重启脚本体验最新版本。")
    except Exception as e:
        print(f"⚠️ [自动更新] 检查更新失败 (可能是网络问题)，已跳过。错误: {e}")

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

if __name__ == '__main__':
    # 读取命令行参数
    parser = argparse.ArgumentParser()
    parser.add_argument('--enable_venv', type=bool, default=enable_venv, help='脚本自动开启虚拟环境')
    parser.add_argument('--env_tool', type=str, default=default_env_tool, help='虚拟环境管理工具, 默认使用 uv')
    parser.add_argument('--port', type=int, default=PORT, help='Port to run the server on')
    parser.add_argument('--debug', type=bool, default=False, help='Enable debug mode')
    parser.add_argument('--check_update', action='store_true', help='是否检查更新')
    args = parser.parse_args()

    if args.check_update():
        check_for_updates()

    prepare_path()
    translator = PDFTranslator(args)
    translator.run(args.port, debug=args.debug)