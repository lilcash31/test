"""Bande-son générative du film (60 s, 48 kHz stéréo). Usage : python3 tools/audio.py out/audio.wav"""
import numpy as np, wave, sys
SR, DUR = 48000, 60.0
N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
T = [0, 4.5, 13, 21.5, 28, 36, 47.5, 53, 57.3]
def env(n, a, d):
    x = np.arange(n) / SR
    return np.minimum(x / a, 1) * np.exp(-x / d)
def add(buf, start, sig, g=1.0):
    i = int(start * SR)
    if i >= N or i < 0: return
    n = min(len(sig), N - i); buf[i:i + n] += sig[:n] * g
def lp(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (f / fc) ** 2), len(x))
midi = lambda m: 440 * 2 ** ((m - 69) / 12)
# nappe : un accord par chapitre
chords = [[38, 45, 57, 60, 64], [38, 45, 53, 57, 64], [34, 46, 53, 58, 62], [36, 48, 55, 60, 64], [38, 50, 57, 60, 65], [41, 48, 57, 60, 67], [36, 48, 55, 62, 64], [38, 50, 57, 62, 69], [38, 50, 57, 62, 69]]
for i, ch in enumerate(chords):
    a, b = T[i], (T[i + 1] if i + 1 < len(T) else DUR) + 1.2
    n = int((b - a) * SR); x = np.arange(n) / SR
    e = np.minimum(x / 1.2, 1) * np.minimum((x[-1] - x) / 1.2, 1)
    for k, m in enumerate(ch):
        f = midi(m)
        for det, pan in ((-.004, .25), (.004, .75)):
            s = sum(np.sin(2 * np.pi * f * (1 + det) * h * x + k) / h ** 1.6 for h in (1, 2, 3, 4)) * (1 + .25 * np.sin(2 * np.pi * (.11 + .03 * k) * x))
            g = .034 if m > 44 else .07
            add(L, a, s * e, g * (1 - pan) * 2); add(R, a, s * e, g * pan * 2)
# pulsation 100 BPM : kick + charley + arpège
BEAT = .6
nk = int(.35 * SR)
kick = np.sin(2 * np.pi * np.cumsum(45 + 90 * np.exp(-np.arange(nk) / SR / .03)) / SR) * env(nk, .002, .11)
hat = lp(rng.standard_normal(int(.05 * SR)), 12000) - lp(rng.standard_normal(int(.05 * SR)), 5000)
hat *= env(len(hat), .001, .012)
b = 4.5; nb = 0
scale = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84]
while b < 57.2:
    inten = min(1, (b - 4.5) / 6)
    add(L, b, kick, .5 * inten); add(R, b, kick, .5 * inten)
    for q in range(4):
        tt = b + q * BEAT / 4
        if q % 2 == 1: add(L, tt, hat, .05 * inten); add(R, tt, hat, .07 * inten)
        ch = max(i for i in range(len(T)) if T[i] <= tt)
        if ch >= 2 and (nb * 4 + q) % 8 in (0, 3, 5, 6):
            m = scale[(nb * 3 + q * 2 + ch) % (4 + min(ch, 5))] + (12 if (nb + q) % 5 == 0 else 0)
            n = int(.4 * SR); x = np.arange(n) / SR
            s = (np.sin(2 * np.pi * midi(m) * x) + .3 * np.sin(4 * np.pi * midi(m) * x)) * env(n, .003, .09)
            pan = .5 + .35 * np.sin(nb * 1.7 + q)
            add(L, tt, s, .06 * (1 - pan)); add(R, tt, s, .06 * pan)
            add(L, tt + BEAT * .75, s, .02 * pan); add(R, tt + BEAT * .75, s, .02 * (1 - pan))
    b += BEAT; nb += 1
# transitions : souffle montant + impact grave
for tc in T[1:]:
    n = int(1.1 * SR); x = np.arange(n) / SR
    w = lp(rng.standard_normal(n), 2500) * (x / 1.1) ** 3 * np.minimum((1.1 - x) / .03, 1)
    add(L, tc - 1.1, w, .5); add(R, tc - 1.08, w, .5)
    n = int(1.6 * SR); x = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-x / .06)) / SR) * env(n, .004, .4)
    sh = lp(rng.standard_normal(n), 6000) * env(n, .002, .22) * .3
    add(L, tc, boom + sh, .55); add(R, tc, boom + sh, .55)
# bips : un par token généré, puis flux de la réponse
for k, tt in enumerate([44.05] + [44.82 + i * .29 for i in range(9)] + [54.5 + i * .12 for i in range(20)]):
    n = int(.09 * SR); x = np.arange(n) / SR; f = midi(86 + (k * 5) % 12)
    s = np.sin(2 * np.pi * f * x) * env(n, .002, .02)
    add(L, tt, s, .05); add(R, tt, s, .05)
# réverbération simple + master
ir_n = int(1.8 * SR); ir = rng.standard_normal((2, ir_n)) * np.exp(-np.arange(ir_n) / SR / .45)
def rev(x, h):
    n = len(x) + len(h) - 1; return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(h, n), n)[:len(x)]
k = .5 / np.sqrt(np.sum(ir[0] ** 2))
L, R = L + rev(L, ir[0]) * k, R + rev(R, ir[1]) * k
fade = np.minimum(t / .8, 1) * np.minimum((DUR - t) / 2.2, 1)
M = np.stack([L, R], 1) * fade[:, None]
M = np.tanh(M / np.max(np.abs(M)) * 1.6) * .89
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((M * 32767).astype('<i2').tobytes()); w.close(); print('audio ok')
