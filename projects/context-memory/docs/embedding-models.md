# Local Embedding Models Research

## Executive Summary

For a shared hosting server with limited resources, **all-MiniLM-L6-v2** is the best balance of size/quality/ease. If slightly more RAM available, **gte-small** offers better quality. For node.js native without python, **fastembed** or **transformers.js** are the paths.

---

## Model Comparison

| Model | Size (disk) | RAM Usage | Quality (MTEB) | Dimensions | Speed |
|-------|-------------|-----------|----------------|------------|-------|
| all-MiniLM-L6-v2 | ~80MB | ~250MB | 0.630 | 384 | very fast |
| gte-small | ~67MB | ~200MB | 0.669 | 384 | very fast |
| gte-base | ~220MB | ~500MB | 0.693 | 768 | fast |
| bge-small-en-v1.5 | ~133MB | ~300MB | 0.659 | 384 | fast |
| nomic-embed-text | ~274MB | ~600MB | 0.702 | 768 | medium |
| mxbai-embed-large | ~670MB | ~1.5GB | 0.740 | 1024 | slow |

---

## What We Chose

**fastembed + BAAI/bge-small-en-v1.5**

- 133MB disk / ~300MB RAM
- 384 dimensions
- ONNX runtime (no pytorch bloat)
- Good quality (0.659 MTEB)
- Python API, callable from node via exec

---

## Key Gotchas

1. **Token limits matter** — MiniLM=256, gte-small=512. Chunk text accordingly.
2. **First load downloads** — cache models in persistent storage
3. **transformers.js is slower** — acceptable for small scale, not batch processing
4. **fastembed needs python** — but lighter than full pytorch
5. **Normalize embeddings** — always normalize for cosine similarity search

---

## Alternatives if Needed

### Node.js native (no python)
```javascript
import { pipeline } from '@xenova/transformers';
const embed = await pipeline('feature-extraction', 'Xenova/gte-small');
const output = await embed(text, { pooling: 'mean', normalize: true });
```

### If running ollama
```bash
ollama pull nomic-embed-text
```
```python
import ollama
embedding = ollama.embeddings(model='nomic-embed-text', prompt='your text')
```

---

## Storage Options

- **numpy + cosine** (what we use) — simplest, no deps
- **sqlite-vss** — sqlite extension for vector search
- **usearch** — fast, small, node + python bindings
- **hnswlib** — classic, efficient

*Research conducted 2026-03-07*
