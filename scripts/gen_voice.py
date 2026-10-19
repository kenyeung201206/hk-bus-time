# Records the Cantonese reminder clips in public/voice/ (run once; needs: pip install edge-tts)
# Usage: python scripts/gen_voice.py public/voice
import asyncio, sys, os, edge_tts
D = '一二三四五六七八九'
def zh(n):
    if n == 2: return '兩'
    if n < 10: return D[n-1]
    if n == 10: return '十'
    t, u = divmod(n, 10)
    if t == 1: return '十' + D[u-1]
    if t == 2 and u: return '廿' + D[u-1]          # colloquial Cantonese: 廿五
    return D[t-1] + '十' + (D[u-1] if u else '')
INTRO = {'hiugaai': '你好呀！我係曉佳，等我提你搭巴士啦！', 'wanlung': '你好！我係雲龍，巴士嚟之前我會提你㗎！', 'kid': '你好呀！我係巴士仔，等我提你搭巴士呀！'}
VOICES = {'hiugaai': ('zh-HK-HiuGaaiNeural', '+6%', '+12Hz'), 'wanlung': ('zh-HK-WanLungNeural', '+4%', '+0Hz'),
          # cute child-like voice: a young female voice pitched up and a little quicker
          'kid': ('zh-HK-HiuMaanNeural', '+10%', '+38Hz')}
ONLY = sys.argv[2:]  # optionally regenerate just some voices
async def one(sem, voice, rate, pitch, text, path):
    async with sem:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(path)
                if os.path.getsize(path) > 8000: return
            except Exception as e:
                pass
            await asyncio.sleep(1 + attempt)
        print('FAILED', path)
async def main(out):
    sem = asyncio.Semaphore(4); jobs = []
    for key, (voice, rate, pitch) in VOICES.items():
        if ONLY and key not in ONLY: continue
        os.makedirs(f'{out}/{key}', exist_ok=True)
        for n in range(1, 61):
            jobs.append(one(sem, voice, rate, pitch, f'巴士仲有{zh(n)}分鐘就到喇！', f'{out}/{key}/m{n}.mp3'))
        jobs.append(one(sem, voice, rate, pitch, '收到！巴士嚟之前，我會提你㗎！', f'{out}/{key}/armed.mp3'))
        jobs.append(one(sem, voice, rate, pitch, '巴士就嚟到站喇！準備上車啦！', f'{out}/{key}/arriving.mp3'))
        jobs.append(one(sem, voice, rate, pitch, '巴士已經到站喇！快啲上車啦！', f'{out}/{key}/arrived.mp3'))
        jobs.append(one(sem, voice, rate, pitch, INTRO[key], f'{out}/{key}/intro.mp3'))
    await asyncio.gather(*jobs)

asyncio.run(main(sys.argv[1]))
