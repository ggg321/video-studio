# Experiment: which per-video features separate bad avatar footage from good? Usage: python feat.py video
import sys, numpy as np, cv2, mediapipe as mp
cap = cv2.VideoCapture(sys.argv[1]); fm = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=False, min_detection_confidence=0.4, min_tracking_confidence=0.4)
pts, sharp, face = [], [], []
LIPS = [61, 291, 13, 14, 78, 308, 0, 17]
while True:
    ok, fr = cap.read()
    if not ok: break
    h, w = fr.shape[:2]
    r = fm.process(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
    if not r.multi_face_landmarks: pts.append(None); continue
    lm = r.multi_face_landmarks[0].landmark
    iod = np.hypot(lm[33].x - lm[263].x, lm[33].y - lm[263].y) + 1e-6
    # lip points relative to nose tip (stabilises vs head motion), normalised by inter-ocular distance
    nx, ny = lm[1].x, lm[1].y
    pts.append(np.array([[(lm[i].x - nx) / iod, (lm[i].y - ny) / iod] for i in LIPS]).ravel())
    xs = [lm[i].x for i in LIPS]; ys = [lm[i].y for i in LIPS]
    x0, x1, y0, y1 = int(min(xs) * w) - 8, int(max(xs) * w) + 8, int(min(ys) * h) - 8, int(max(ys) * h) + 8
    roi = cv2.cvtColor(fr[max(0, y0):y1, max(0, x0):x1], cv2.COLOR_BGR2GRAY)
    sharp.append(cv2.Laplacian(roi, cv2.CV_64F).var() if roi.size else 0)
idx = [i for i, p in enumerate(pts) if p is not None]
P = np.array([pts[i] for i in idx])
# jitter: high-frequency component of landmark trajectories (frame-to-frame second difference), relative to total motion
d2 = np.abs(P[2:] - 2 * P[1:-1] + P[:-2]).mean()
mot = np.abs(P - P.mean(0)).mean()
print(sys.argv[1].split('/')[-1], 'frames', len(pts), 'facefound %.2f' % (len(idx) / len(pts)), 'jitter(d2) %.4f' % d2, 'motion %.4f' % mot, 'jitter/motion %.3f' % (d2 / mot), 'mouthSharp med %.0f' % np.median(sharp))
