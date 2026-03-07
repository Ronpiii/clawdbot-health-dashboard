#!/usr/bin/env python3
"""
Context Memory - Embedding & Search
Uses fastembed (ONNX) for local embeddings, numpy for vector store.
No external APIs required.
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional
import numpy as np

# Lazy load fastembed (slow import)
_model = None

def get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding('BAAI/bge-small-en-v1.5')
    return _model

# Paths
WORKSPACE = Path(__file__).parent.parent.parent.parent  # clawd/
INDEX_DIR = WORKSPACE / "projects" / "context-memory" / "index"
INDEX_FILE = INDEX_DIR / "vectors.npz"
META_FILE = INDEX_DIR / "meta.json"


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap
    return chunks


def embed_texts(texts: list[str]) -> np.ndarray:
    """Generate embeddings for a list of texts."""
    model = get_model()
    embeddings = list(model.embed(texts))
    return np.array(embeddings)


def cosine_similarity(query_vec: np.ndarray, doc_vecs: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between query and all documents."""
    # Normalize
    query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    doc_norms = doc_vecs / (np.linalg.norm(doc_vecs, axis=1, keepdims=True) + 1e-9)
    return np.dot(doc_norms, query_norm)


def build_index(source_dirs: Optional[list[Path]] = None) -> dict:
    """Build vector index from markdown files."""
    if source_dirs is None:
        source_dirs = [
            WORKSPACE / "memory",
            WORKSPACE / "MEMORY.md",
            WORKSPACE / "learnings",
        ]
    
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    
    chunks = []
    metadata = []
    
    for source in source_dirs:
        if source.is_file() and source.suffix == ".md":
            files = [source]
        elif source.is_dir():
            files = list(source.glob("**/*.md"))
        else:
            continue
        
        for file_path in files:
            try:
                content = file_path.read_text(encoding="utf-8")
                file_chunks = chunk_text(content)
                
                for i, chunk in enumerate(file_chunks):
                    chunks.append(chunk)
                    metadata.append({
                        "path": str(file_path.relative_to(WORKSPACE)),
                        "chunk_index": i,
                        "total_chunks": len(file_chunks),
                    })
            except Exception as e:
                print(f"Error reading {file_path}: {e}", file=sys.stderr)
    
    if not chunks:
        print("No chunks found to index.", file=sys.stderr)
        return {"indexed": 0}
    
    print(f"Embedding {len(chunks)} chunks...", file=sys.stderr)
    vectors = embed_texts(chunks)
    
    # Save
    np.savez_compressed(INDEX_FILE, vectors=vectors)
    
    # Save metadata with chunks for retrieval
    for i, m in enumerate(metadata):
        m["text"] = chunks[i]
    
    with open(META_FILE, "w") as f:
        json.dump(metadata, f)
    
    print(f"Indexed {len(chunks)} chunks from {len(set(m['path'] for m in metadata))} files.", file=sys.stderr)
    return {"indexed": len(chunks), "files": len(set(m['path'] for m in metadata))}


def search(query: str, top_k: int = 5, min_score: float = 0.3) -> list[dict]:
    """Search the index for similar chunks."""
    if not INDEX_FILE.exists() or not META_FILE.exists():
        return []
    
    # Load index
    data = np.load(INDEX_FILE)
    vectors = data["vectors"]
    
    with open(META_FILE) as f:
        metadata = json.load(f)
    
    # Embed query
    query_vec = embed_texts([query])[0]
    
    # Search
    scores = cosine_similarity(query_vec, vectors)
    
    # Get top results
    top_indices = np.argsort(scores)[::-1][:top_k]
    
    results = []
    for idx in top_indices:
        score = float(scores[idx])
        if score >= min_score:
            result = metadata[idx].copy()
            result["score"] = round(score, 4)
            results.append(result)
    
    return results


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Context Memory - Semantic Search")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Build command
    build_parser = subparsers.add_parser("build", help="Build the vector index")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search the index")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-k", "--top-k", type=int, default=5, help="Number of results")
    search_parser.add_argument("-m", "--min-score", type=float, default=0.3, help="Minimum similarity score")
    search_parser.add_argument("-j", "--json", action="store_true", help="Output as JSON")
    
    args = parser.parse_args()
    
    if args.command == "build":
        result = build_index()
        print(json.dumps(result))
    
    elif args.command == "search":
        results = search(args.query, top_k=args.top_k, min_score=args.min_score)
        
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            if not results:
                print("No results found.")
            else:
                for r in results:
                    print(f"\n[{r['score']:.2f}] {r['path']}")
                    print("-" * 40)
                    print(r['text'][:300] + "..." if len(r['text']) > 300 else r['text'])


if __name__ == "__main__":
    main()
