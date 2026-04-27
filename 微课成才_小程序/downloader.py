import requests
import json
import time

def get_bilibili_video(bvid):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/"
    }
    
    # 1. Get View Info (CID)
    view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    print(f"Fetching view info for {bvid}...")
    r = requests.get(view_url, headers=headers)
    data = r.json()
    
    if data['code'] != 0:
        print(f"Error getting view info: {data['message']}")
        return
    
    cid = data['data']['cid']
    title = data['data']['title']
    print(f"Title: {title}, CID: {cid}")
    
    # 2. Get Play URL
    # qn=80 is 1080P, qn=32 is 480P. 480P usually doesn't need login/WBI.
    play_url = f"https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={cid}&qn=32&type=&otype=json&platform=html5&high_quality=1"
    print(f"Fetching play URL...")
    r = requests.get(play_url, headers=headers)
    play_data = r.json()
    
    if play_data['code'] != 0:
        print(f"Error getting play URL: {play_data['message']}")
        return
    
    # Bilibili HTML5 platform usually returns a durl (direct url) list with mp4
    video_url = play_data['data']['durl'][0]['url']
    print(f"Direct Video URL found!")
    
    # 3. Download
    print(f"Downloading {title}...")
    r = requests.get(video_url, headers=headers, stream=True)
    with open(f"E:\\.cc项目\\微课成才_小程序\\temp_input\\test_video.mp4", 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    print("Download complete!")

if __name__ == "__main__":
    get_bilibili_video("BV1ixfFBrEhG")
