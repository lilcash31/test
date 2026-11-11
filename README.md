# La stack de l'IA — du data center à votre intention

Film motion design 3D d'une minute (1920×1080, 30 i/s, son stéréo) qui explique en français
toute la chaîne technique de l'IA générative, couche par couche :

| Temps | Chapitre | Ce qu'on y voit |
|---|---|---|
| 0:00 | Intro | La stack en 7 couches qui s'assemble |
| 0:04 | 01 · Data center | Baies de serveurs, énergie, refroidissement liquide, fibre |
| 0:13 | 02 · GPU NVIDIA | Vue éclatée : cœurs parallèles, mémoire HBM, plaque froide |
| 0:21 | 03 · CUDA | Application → PyTorch → cuDNN/TensorRT → CUDA → GPU |
| 0:28 | 04 · Le modèle | Réseau Transformer, paramètres, attention |
| 0:36 | 05 · Inférence | Tokenisation → embeddings → calcul → probabilités → boucle |
| 0:47 | 06 · Serving | API, répartition de charge, batching, streaming |
| 0:53 | 07 · Vous | La réponse qui s'écrit mot à mot, puis conclusion |

**Le film final : [`out/ia-stack-next-gen.mp4`](out/ia-stack-next-gen.mp4)**

## Comment c'est fait

- `film/` — la scène : Three.js (3D temps réel + bloom) et une couche HTML/CSS pour la typographie.
  Tout est une fonction pure du temps `renderAt(t)`, donc le rendu est déterministe.
- `tools/render.mjs` — rendu image par image avec Chromium headless (Playwright).
- `tools/audio.py` — bande-son générative (nappe, pulsation, transitions) synthétisée avec NumPy.

## Régénérer

```bash
npm install
node tools/render.mjs --workers 3          # 1800 images dans frames/
python3 tools/audio.py out/audio.wav
ffmpeg -framerate 30 -i frames/f_%05d.jpg -i out/audio.wav \
  -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -c:a aac -b:a 192k \
  -movflags +faststart -shortest out/ia-stack-next-gen.mp4
```

Aperçu interactif : servir la racine du dépôt en HTTP puis ouvrir `film/index.html?play`
(ou `?t=42` pour figer un instant précis).

Les ordres de grandeur affichés (100 kW par baie, ~1 kW par puce, 800 Gb/s, etc.) sont des
valeurs indicatives de l'état de l'art, simplifiées pour la pédagogie.
