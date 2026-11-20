#!/usr/bin/env python3
"""Prepare full-length H.264/AAC downloads <= 9,500,000 bytes; resumable."""
import concurrent.futures, hashlib, json, pathlib, subprocess, tempfile, time, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parents[1]
LIMIT = 9_500_000
OUT = ROOT / 'katalog/video-small'
OUT.mkdir(exist_ok=True)
SITE = 'https://manager-aprellshop.netlify.app'

def run(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE).decode()

def prepare(file):
    key = file.get('url') or file['path']
    original = file.get('url') or '/.netlify/functions/yadisk-media?path=' + urllib.parse.quote(file['path'], safe='') + '&download=1'
    name = hashlib.sha256(key.encode()).hexdigest()[:24] + '.mp4'
    dest = OUT / name
    if dest.exists() and 0 < dest.stat().st_size <= LIMIT:
        return key, {'url': '/katalog/video-small/' + name, 'size': dest.stat().st_size}
    # Existing small originals need no additional lossy encoding.
    if 0 < file.get('size', 0) <= LIMIT:
        return key, {'url': original, 'size': file['size']}
    with tempfile.TemporaryDirectory(prefix='aprell-video-') as tmp:
        source = pathlib.Path(tmp) / 'source.mp4'
        local = ROOT / original.lstrip('/')
        if file.get('url') and local.is_file():
            source = local
        else:
            url = original if original.startswith('https://') else SITE + original
            run(['curl','--http1.1','--fail','--location','--retry-all-errors','--retry','4','--max-time','600','--silent','--show-error',url,'-o',str(source)])
        meta = json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(source)]))
        duration = float(meta['format']['duration'])
        audio = any(s['codec_type']=='audio' for s in meta['streams'])
        rate = int(9_150_000 * 8 / duration) - (64000 if audio else 0)
        if rate < 20000: raise ValueError('Video is too long for the configured quality floor')
        for attempt in range(3):
            output = pathlib.Path(tmp) / 'small.mp4'
            common = ['ffmpeg','-y','-v','error','-i',str(source),'-map','0:v:0','-map','0:a:0?', '-vf',"scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",'-c:v','libx264','-preset','fast','-threads','2','-b:v',str(rate),'-pix_fmt','yuv420p','-passlogfile',str(pathlib.Path(tmp)/'pass')]
            run(common + ['-pass','1','-an','-f','null','/dev/null'])
            run(common + ['-pass','2','-c:a','aac','-b:a','64k','-movflags','+faststart',str(output)])
            if output.stat().st_size <= LIMIT:
                check=json.loads(run(['ffprobe','-v','error','-show_format','-of','json',str(output)]))
                if abs(float(check['format']['duration'])-duration)>0.2: raise ValueError('Duration changed')
                output.replace(dest)
                return key, {'url':'/katalog/video-small/'+name,'size':dest.stat().st_size}
            rate=int(rate*0.9)
        raise ValueError('Size limit not met')

def main():
    data=json.loads((ROOT/'katalog/yadisk-media.json').read_text())
    files={f.get('url') or f['path']:f for m in data['models'] for c in m['colors'] for f in c['files'] if f['type']=='video'}
    catalog=json.loads((ROOT/'katalog/data.json').read_text())
    for item in catalog['models']+catalog['acc']:
        u=item.get('vid') or item.get('vidLocal')
        if u and not item.get('video'):
            url=u if u.startswith('https://') else '/katalog/'+u.lstrip('./')
            local=ROOT/url.lstrip('/')
            files[url]={'url':url,'size':local.stat().st_size if local.is_file() else 0}
    manifest={}; errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pending={pool.submit(prepare,f):k for k,f in files.items()}
        for future in concurrent.futures.as_completed(pending):
            key=pending[future]
            try:
                k,result=future.result(); manifest[k]=result
                print(f'{len(manifest)}/{len(files)} OK {key} {result["size"]}',flush=True)
            except Exception as e:
                errors.append(key); print(f'ERROR {key}: {e}',flush=True)
            (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Completed:',len(manifest),'Errors:',errors,flush=True)
    if errors: raise SystemExit(1)
if __name__=='__main__': main()
