from flask import Flask, request, jsonify
import os
import base64
from flask import Flask, send_file, abort

####################################### 配置 #######################################
pdf2zh = "pdf2zh"                 # 设置pdf2zh指令: 默认为'pdf2zh'
thread_num = 4                    # 设置线程数: 默认为4
translated_dir = "./translated/"  # 设置翻译文件的输出路径(临时路径, 可以在翻译后删除)
port_num = 8888                   # 设置端口号: 默认为8888
config_path = './config.json'     # 设置配置文件路径
####################################################################################

def get_absolute_path(path):
    if os.path.isabs(path):
        return path 
    else:
        return os.path.abspath(path)
    
app = Flask(__name__)
@app.route('/translate', methods=['POST'])
def translate():
    data = request.get_json()
    path = data.get('filePath')
    if not os.path.exists(path):
        file_content = data.get('fileContent')
        input_path = os.path.join(translated_dir, os.path.basename(path))
        if file_content:
            if file_content.startswith('data:application/pdf;base64,'): # 移除 Base64 编码中的前缀(如果有)
                file_content = file_content[len('data:application/pdf;base64,'):]
            file_data = base64.b64decode(file_content) # 解码 Base64 内容
            with open(input_path, 'wb') as f:
                f.write(file_data)
    else:
        input_path = path

    try:
        os.makedirs(translated_dir, exist_ok=True)
        print("### translating ###: ", input_path)

        # 执行pdf2zh翻译, 用户可以自定义命令内容:
        os.system(pdf2zh + ' \"' + str(input_path) + '\" --t ' + str(thread_num)+ ' --output ' + translated_dir + " --config " + config_path)
        
        abs_translated_dir = get_absolute_path(translated_dir)  
        translated_path1 = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-mono.pdf'))
        translated_path2 = os.path.join(abs_translated_dir, os.path.basename(input_path).replace('.pdf', '-dual.pdf'))
        if not os.path.exists(translated_path1) or not os.path.exists(translated_path2):
            raise Exception("pdf2zh翻译失败, 请检查pdf2zh日志")
        return jsonify({'status': 'success', 'translatedPath1': translated_path1, 'translatedPath2': translated_path2}), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/translatedFile/<filename>')
def download(filename):
    directory = translated_dir
    abs_directory = get_absolute_path(directory)
    file_path = os.path.join(abs_directory, filename)
    if not os.path.isfile(file_path):
        return "File not found", 404
    return send_file(file_path, as_attachment=True, download_name=filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port_num)
