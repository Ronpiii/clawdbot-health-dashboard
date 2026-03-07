#!/usr/bin/env python3
"""
Context Memory - Embedding & Search
Uses fastembed (ONNX) for local embeddings, numpy for vector store.
No external APIs required.

Features:
- Full rebuild: `python embed.py build`
- Incremental update: `python embed.py update` (only changed files)
- Search: `python embed.py search "query"`
"""

import json
import os
import sys
import hashlib
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
HASH_FILE = INDEX_DIR / "hashes.json"

DEFAULT_SOURCES = [
    WORKSPACE / "memory",
    WORKSPACE / "MEMORY.md",
    WORKSPACE / "learnings",
]


def file_hash(path: Path) -> str:
    """Get MD5 hash of file content."""
    return hashlib.md5(path.read_bytes()).hexdigest()


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
    query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    doc_norms = doc_vecs / (np.linalg.norm(doc_vecs, axis=1, keepdims=True) + 1e-9)
    return np.dot(doc_norms, query_norm)


def get_source_files(source_dirs: Optional[list[Path]] = None) -> list[Path]:
    """Get all markdown files from sources."""
    if source_dirs is None:
        source_dirs = DEFAULT_SOURCES
    
    files = []
    for source in source_dirs:
        if source.is_file() and source.suffix == ".md":
            files.append(source)
        elif source.is_dir():
            files.extend(source.glob("**/*.md"))
    return sorted(set(files))


def load_hashes() -> dict[str, str]:
    """Load stored file hashes."""
    if HASH_FILE.exists():
        return json.loads(HASH_FILE.read_text())
    return {}


def save_hashes(hashes: dict[str, str]):
    """Save file hashes."""
    HASH_FILE.write_text(json.dumps(hashes, indent=2))


def build_index(source_dirs: Optional[list[Path]] = None, incremental: bool = False) -> dict:
    """Build vector index from markdown files.
    
    Args:
        source_dirs: List of directories/files to index
        incremental: If True, only re-index changed files
    """
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    
    files = get_source_files(source_dirs)
    old_hashes = load_hashes() if incremental else {}
    new_hashes = {}
    
    # Load existing index if incremental
    existing_vectors = None
    existing_meta = []
    if incremental and INDEX_FILE.exists() and META_FILE.exists():
        data = np.load(INDEX_FILE)
        existing_vectors = data["vectors"]
        with open(META_FILE) as f:
            existing_meta = json.load(f)
    
    # Track which files changed
    changed_files = set()
    unchanged_files = set()
    
    for file_path in files:
        rel_path = str(file_path.relative_to(WORKSPACE))
        current_hash = file_hash(file_path)
        new_hashes[rel_path] = current_hash
        
        if incremental and old_hashes.get(rel_path) == current_hash:
            unchanged_files.add(rel_path)
        else:
            changed_files.add(rel_path)
    
    # Keep chunks from unchanged files
    kept_chunks = []
    kept_meta = []
    kept_indices = []
    
    if incremental and existing_meta:
        for i, m in enumerate(existing_meta):
            if m["path"] in unchanged_files:
                kept_chunks.append(i)
                kept_meta.append(m)
                kept_indices.append(i)
    
    # Process changed files
    new_chunks = []
    new_meta = []
    
    for file_path in files:
        rel_path = str(file_path.relative_to(WORKSPACE))
        if rel_path not in changed_files:
            continue
        
        try:
            content = file_path.read_text(encoding="utf-8")
            file_chunks = chunk_text(content)
            
            for i, chunk in enumerate(file_chunks):
                new_chunks.append(chunk)
                new_meta.append({
                    "path": rel_path,
                    "chunk_index": i,
                    "total_chunks": len(file_chunks),
                    "text": chunk,
                })
        except Exception as e:
            print(f"Error reading {file_path}: {e}", file=sys.stderr)
    
    # Combine kept and new
    if kept_indices and existing_vectors is not None:
        kept_vectors = existing_vectors[kept_indices]
    else:
        kept_vectors = None
    
    if new_chunks:
        print(f"Embedding {len(new_chunks)} new chunks from {len(changed_files)} files...", file=sys.stderr)
        new_vectors = embed_texts(new_chunks)
    else:
        new_vectors = None
    
    # Merge
    if kept_vectors is not None and new_vectors is not None:
        final_vectors = np.vstack([kept_vectors, new_vectors])
        final_meta = kept_meta + new_meta
    elif kept_vectors is not None:
        final_vectors = kept_vectors
        final_meta = kept_meta
    elif new_vectors is not None:
        final_vectors = new_vectors
        final_meta = new_meta
    else:
        print("No chunks to index.", file=sys.stderr)
        return {"indexed": 0}
    
    # Save
    np.savez_compressed(INDEX_FILE, vectors=final_vectors)
    with open(META_FILE, "w") as f:
        json.dump(final_meta, f)
    save_hashes(new_hashes)
    
    total_files = len(set(m["path"] for m in final_meta))
    print(f"Index: {len(final_meta)} chunks from {total_files} files.", file=sys.stderr)
    if incremental:
        print(f"  Changed: {len(changed_files)}, Unchanged: {len(unchanged_files)}", file=sys.stderr)
    
    return {
        "indexed": len(final_meta),
        "files": total_files,
        "changed": len(changed_files),
        "unchanged": len(unchanged_files) if incremental else 0,
    }


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


def stats() -> dict:
    """Get index statistics."""
    if not INDEX_FILE.exists() or not META_FILE.exists():
        return {"status": "no index"}
    
    with open(META_FILE) as f:
        metadata = json.load(f)
    
    hashes = load_hashes()
    
    files = set(m["path"] for m in metadata)
    return {
        "chunks": len(metadata),
        "files": len(files),
        "tracked_files": len(hashes),
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Context Memory - Semantic Search")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Build command
    build_parser = subparsers.add_parser("build", help="Build the vector index (full rebuild)")
    
    # Update command
    update_parser = subparsers.add_parser("update", help="Update index (incremental)")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search the index")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-k", "--top-k", type=int, default=5, help="Number of results")
    search_parser.add_argument("-m", "--min-score", type=float, default=0.3, help="Minimum similarity score")
    search_parser.add_argument("-j", "--json", action="store_true", help="Output as JSON")
    
    # Stats command
    stats_parser = subparsers.add_parser("stats", help="Show index statistics")
    
    args = parser.parse_args()
    
    if args.command == "build":
        result = build_index(incremental=False)
        print(json.dumps(result))
    
    elif args.command == "update":
        result = build_index(incremental=True)
        print(json.dumps(result))
    
    elif args.command == "stats":
        result = stats()
        print(json.dumps(result, indent=2))
    
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
                    text = r['text']
                    print(text[:300] + "..." if len(text) > 300 else text)


if __name__ == "__main__":
    main()
