"""Gói toàn bộ Interview Copilot thành 1 file HTML (JS/CSS nội bộ được nhúng thẳng vào).
Thư viện CDN (pdf.js, mammoth, jszip, marked, Google sign-in) vẫn tải từ mạng — app cần mạng để gọi AI nên không ảnh hưởng.
Không nhúng API key hay hồ sơ: key/hồ sơ nằm trong trình duyệt, nhập lại bằng nút "Nhập hồ sơ".
Dùng:  python copilot/tools/build_single.py [đường_dẫn_ra.html]
"""
import os, re, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)                      # .../copilot
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(APP, 'Interview-Copilot-1-file.html')

html = open(os.path.join(APP, 'index.html'), encoding='utf-8').read()

def local(path):
    p = path.split('?')[0]
    return os.path.normpath(os.path.join(APP, p))

def css(m):
    href = m.group(1)
    if href.startswith('http') or href.startswith('data:'): return m.group(0)
    return '<style>\n' + open(local(href), encoding='utf-8').read() + '\n</style>'

def js(m):
    src = m.group(1)
    if src.startswith('http'): return m.group(0)
    code = open(local(src), encoding='utf-8').read().replace('</script', '<\\/script')
    return f'<script>/* {src.split("?")[0]} */\n' + code + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
left = re.findall(r'(?:src|href)="(?!https?:|data:|#)([^"]+\.(?:js|css)[^"]*)"', html)
if left: sys.exit('Còn file chưa nhúng: ' + ', '.join(left))
stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
html = html.replace('<head>', f'<head>\n<!-- Interview Copilot · bản 1 file · đóng gói {stamp} -->', 1)
open(out, 'w', encoding='utf-8').write(html)
print(out, round(len(html.encode('utf-8')) / 1024), 'KB')
