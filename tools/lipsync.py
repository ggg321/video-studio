"""Lip-sync check: compares mouth opening (MediaPipe FaceMesh) with the speech energy of the audio.
Usage: python lipsync.py video.mp4 out.json
Output: per-window scores + merged "bad" segments (poor sync, face lost, mouth frozen while speech)."""
import sys, json, subprocess, tempfile, os
import numpy as np, cv2
import mediapipe as mp

video, out = sys.argv[1], sys.argv[2]
FPS_AN = 30.0

# ---- audio envelope ----
tmp = tempfile.mkdtemp()
wav = os.path.join(tmp, 'a.wav')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', wav], check=True)
import wave
with wave.open(wav) as w:
    sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
hop = int(sr / FPS_AN)
n_env = len(a) // hop
env = np.array([np.sqrt(np.mean(a[i*hop:(i+1)*hop] ** 2) + 1e-12) for i in range(n_env)])
env = np.log10(env + 1e-4)
env = (env - np.percentile(env, 10)) / (np.percentile(env, 95) - np.percentile(env, 10) + 1e-6)
env = np.clip(env, 0, 1.5)
speech = env > 0.35

# ---- mouth opening ----
cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
fm = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=False,
                                     min_detection_confidence=0.4, min_tracking_confidence=0.4)
mouth, found, iods = [], [], []
while True:
    ok, fr = cap.read()
    if not ok: break
    r = fm.process(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
    if r.multi_face_landmarks:
        lm = r.multi_face_landmarks[0].landmark
        iod = np.hypot(lm[33].x - lm[263].x, lm[33].y - lm[263].y) + 1e-6
        op = np.hypot(lm[13].x - lm[14].x, lm[13].y - lm[14].y) / iod
        wid = np.hypot(lm[61].x - lm[291].x, lm[61].y - lm[291].y) / iod
        mouth.append(op * 3 + wid * 0.5); found.append(True); iods.append(iod)
    else:
        mouth.append(np.nan); found.append(False); iods.append(np.nan)
cap.release()
mouth = np.array(mouth); found = np.array(found)
# framing jumps: sudden change of face size between frames (zoom/scene cut)
jumps = []
for i in range(1, len(iods)):
    a, b = iods[i - 1], iods[i]
    if a == a and b == b and abs(b - a) / a > 0.12: jumps.append(round(i / fps, 2))
# resample to analysis fps
T = min(len(mouth) / fps, len(env) / FPS_AN)
N = int(T * FPS_AN)
tt = np.arange(N) / FPS_AN
m = np.interp(tt, np.arange(len(mouth)) / fps, np.where(np.isnan(mouth), np.nanmean(mouth) if found.any() else 0, mouth))
fnd = np.interp(tt, np.arange(len(found)) / fps, found.astype(float)) > 0.5
e = env[:N]; sp = speech[:N]
# high-pass the mouth signal (remove head-pose drift)
k = int(FPS_AN * 0.6)
m_hp = m - np.convolve(m, np.ones(k) / k, mode='same')
e_s = np.convolve(e, np.ones(3) / 3, mode='same')

def corr(x, y):
    if x.std() < 1e-6 or y.std() < 1e-6: return 0.0
    return float(np.corrcoef(x, y)[0, 1])

W, S, LAG = int(FPS_AN * 1.0), int(FPS_AN * 0.25), int(FPS_AN * 0.17)
wins = []
for s0 in range(0, N - W + 1, S):
    x, y = m_hp[s0:s0+W], e_s[s0:s0+W]
    sp_ratio = float(sp[s0:s0+W].mean())
    face = float(fnd[s0:s0+W].mean())
    best = -1.0
    for lag in range(-LAG, LAG + 1, 2):
        if s0 + lag < 0 or s0 + lag + W > N: continue
        best = max(best, corr(m_hp[s0+lag:s0+lag+W], y))
    mv = float(x.std())
    wins.append({'t': s0 / FPS_AN, 'score': round(best, 3), 'speech': round(sp_ratio, 2), 'face': round(face, 2), 'mouthStd': round(mv, 4)})

# ---- classify ----
ms = np.array([w['mouthStd'] for w in wins]); med = float(np.median(ms[[w['speech'] > 0.5 for w in wins]])) if any(w['speech'] > 0.5 for w in wins) else 0.01
def reason(w):
    if w['speech'] < 0.4: return None
    if w['face'] < 0.6: return 'face lost'
    if w['mouthStd'] < med * 0.35: return 'mouth frozen'
    if w['score'] < 0.12: return 'poor sync'
    return None
bad = []
for w in wins:
    r = reason(w)
    if r:
        a, b = w['t'], w['t'] + 1.0
        if bad and a <= bad[-1]['end'] + 0.15 and bad[-1]['reason'] == r: bad[-1]['end'] = b
        else: bad.append({'start': round(a, 2), 'end': round(b, 2), 'reason': r})
bad = [b for b in bad if b['end'] - b['start'] >= 1.0]
valid = [w['score'] for w in wins if w['speech'] > 0.5 and w['face'] > 0.6]
json.dump({'jumps': jumps, 'duration': round(T, 2), 'meanScore': round(float(np.mean(valid)), 3) if valid else None, 'medianMouthStd': round(med, 4), 'bad': bad, 'windows': wins}, open(out, 'w'))
print(json.dumps({'meanScore': round(float(np.mean(valid)), 3) if valid else None, 'bad': bad}))
