#!/usr/bin/env python3
"""Create downloadable copies of the catalog's embedded video reviews."""
import concurrent.futures, hashlib, importlib.util, json, pathlib, subprocess, os, shutil
spec=importlib.util.spec_from_file_location('small',pathlib.Path(__file__).with_name('prepare-small-videos.py'))
small=importlib.util.module_from_spec(spec);spec.loader.exec_module(small)
ROOT=small.ROOT
OUT=ROOT/'katalog/video-reviews';OUT.mkdir(exist_ok=True)
YTDLP=os.environ.get('YTDLP') or shutil.which('yt-dlp')
if not YTDLP: raise SystemExit('Install yt-dlp or set YTDLP to its executable path')
def prepare(url):
    name=hashlib.sha256(url.encode()).hexdigest()[:24]
    dest=OUT/(name+'.mp4')
    if not dest.exists():
        subprocess.run([YTDLP,'--js-runtimes','node','--remote-components','ejs:github','--no-playlist','--no-progress','--retries','3','--socket-timeout','30','-f','bestvideo[vcodec^=avc1][height<=1920][width<=1920]+bestaudio[ext=m4a]/best[ext=mp4][height<=1920][width<=1920]/best[height<=1920][width<=1920]','--merge-output-format','mp4','-o',str(dest),url],check=True,stdout=subprocess.DEVNULL)
    key,result=small.prepare({'url':'/katalog/video-reviews/'+name+'.mp4','size':dest.stat().st_size})
    result['original']='/katalog/video-reviews/'+name+'.mp4'
    return url,result
urls=sorted({m['video'] for m in json.loads((ROOT/'katalog/data.json').read_text())['models'] if m.get('video')})
results={};errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    pending={pool.submit(prepare,url):url for url in urls}
    for future in concurrent.futures.as_completed(pending):
        url=pending[future]
        try:
            key,value=future.result();results[key]=value;print('OK',len(results),len(urls),url,flush=True)
        except Exception as e:errors.append(url);print('ERROR',url,str(e),flush=True)
        (OUT/'manifest.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print('Errors:',errors,flush=True)
if errors:raise SystemExit(1)
