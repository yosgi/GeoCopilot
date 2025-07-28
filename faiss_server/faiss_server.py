from flask import Flask, request, jsonify, send_file
import faiss
import numpy as np
import openai
import os
import pickle
import threading
import time
import json
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime
import zipfile
import tempfile

load_dotenv(dotenv_path="../.env")

app = Flask(__name__)
CORS(app)

openai.api_key = os.getenv("VITE_OPENAI_API_KEY")
embedding_dim = 1536
INDEX_PATH = "faiss.index"
META_PATH = "metadata.pkl"
EXPORT_DIR = "exports"

# create export directory
os.makedirs(EXPORT_DIR, exist_ok=True)

# ========== LOAD INDEX & METADATA IF EXISTS ==========
if os.path.exists(INDEX_PATH):
    index = faiss.read_index(INDEX_PATH)
    print("[FAISS] Loaded index from disk.")
else:
    index = faiss.IndexFlatL2(embedding_dim)
    print("[FAISS] Created new index.")

if os.path.exists(META_PATH):
    with open(META_PATH, "rb") as f:
        metadata_store = pickle.load(f)
    print("[FAISS] Loaded metadata from disk.")
else:
    metadata_store = []
    print("[FAISS] Created new metadata store.")

def format_equipment_text(e):
    return f"""
    Equipment {e.get('name')} (element ID {e.get('element')}) is part of the {e.get('system')}.
    It is a {e.get('equipment_concept')} with function: {e.get('function')}.
    It adheres to codes: {', '.join(e.get('applicable_codes', []))}.
    Maintenance strategy: {e.get('maintenance_strategy')}.
    Inspection includes: {', '.join(e.get('inspection_requirements', []))}.
    """

def get_embedding_batch(texts):
    response = openai.embeddings.create(
        input=texts,
        model="text-embedding-3-small"
    )
    return [np.array(item.embedding, dtype=np.float32) for item in response.data]

# ========== SIMPLIFIED GLOBAL BATCH POOL ==========
batch_pool = []
batch_pool_lock = threading.Lock()
last_append_time = [0]

def save_complete_database():
    """save complete database to json"""
    filename = "complete_database.json"
    filepath = os.path.join(EXPORT_DIR, filename)
    
    try:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        print(f"[EXPORT] Creating database JSON at: {filepath}")
        
        equipment_by_system = {}
        equipment_by_category = {}
        
        for item in metadata_store:
            system = item.get('system', 'Unknown')
            category = item.get('subcategory', 'Unknown')
            
            equipment_by_system[system] = equipment_by_system.get(system, 0) + 1
            equipment_by_category[category] = equipment_by_category.get(category, 0) + 1
        
        complete_data = {
            "metadata": {
                "export_time": datetime.now().isoformat(),
                "database_version": "1.0",
                "total_equipment": len(metadata_store),
                "faiss_index_size": index.ntotal,
                "statistics": {
                    "equipment_by_system": equipment_by_system,
                    "equipment_by_category": equipment_by_category,
                    "data_consistency": index.ntotal == len(metadata_store)
                }
            },
            "equipment_database": metadata_store
        }
        
        with open(filepath, "w", encoding='utf-8') as f:
            json.dump(complete_data, f, indent=2, ensure_ascii=False)
        
        print(f"[EXPORT] Complete database saved as {filename} ({len(metadata_store)} items)")
        return filepath
        
    except Exception as e:
        print(f"[ERROR] Failed to save complete database: {e}")
        raise

def create_three_file_export():
    """create a zip file with three core files"""
    zip_filename = "three_file_export.zip"
    zip_filepath = os.path.join(EXPORT_DIR, zip_filename)
    
    try:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        print(f"[EXPORT] Creating ZIP at: {zip_filepath}")
        
        with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # 1. complete_database.json
            print("[EXPORT] Creating database JSON...")
            db_json_path = save_complete_database()
            zipf.write(db_json_path, "complete_database.json")
            print(f"[EXPORT] Added complete_database.json to ZIP")
            
            # 2. faiss.index
            if os.path.exists(INDEX_PATH):
                zipf.write(INDEX_PATH, "faiss.index")
                print(f"[EXPORT] Added faiss.index to ZIP")
            else:
                print(f"[WARNING] FAISS index file not found")
            
            # 3. metadata.pkl
            if os.path.exists(META_PATH):
                zipf.write(META_PATH, "metadata.pkl")
                print(f"[EXPORT] Added metadata.pkl to ZIP")
            else:
                print(f"[WARNING] Metadata file not found")
        
        print(f"[EXPORT] Three-file export created: {zip_filename}")
        return zip_filepath
        
    except Exception as e:
        print(f"[ERROR] Failed to create three-file export: {e}")
        raise
        print(f"[EXPORT] Three-file export created: {zip_filename}")
        return zip_filepath
        
    except Exception as e:
        print(f"[ERROR] Failed to create three-file export: {e}")
        raise

def save_and_clear_pool():
    """save pool data and add to main storage"""
    with batch_pool_lock:
        if batch_pool:
            print(f"[FAISS] Processing {len(batch_pool)} items from pool")
            batch_pool.clear()

def pool_monitor():
    """monitor batch pool"""
    while True:
        time.sleep(10)
        with batch_pool_lock:
            if batch_pool and (time.time() - last_append_time[0] > 30):
                save_and_clear_pool()

threading.Thread(target=pool_monitor, daemon=True).start()

# ========== AUTO SAVE THREAD ==========
def periodic_save():
    """periodically save FAISS index and metadata"""
    while True:
        time.sleep(60) 
        try:
            faiss.write_index(index, INDEX_PATH)
            with open(META_PATH, "wb") as f:
                pickle.dump(metadata_store, f)
            print("[FAISS] Auto-saved index and metadata")
        except Exception as e:
            print(f"[ERROR] Auto-save failed: {e}")

threading.Thread(target=periodic_save, daemon=True).start()

# ========== API ROUTES ==========

@app.route("/insert_json_batch", methods=["POST"])
def insert_json_batch():
    equipment_list = request.json
    
    unique_equipment = {}
    for e in equipment_list:
        element_id = str(e.get("element"))
        unique_equipment[element_id] = e
    
    existing_ids = set(str(item.get("element")) for item in metadata_store)
    new_equipment = [e for eid, e in unique_equipment.items() if eid not in existing_ids]
    
    if not new_equipment:
        return jsonify({"status": "duplicate", "message": "All elements already exist.", "inserted": 0}), 409
    
    texts = [format_equipment_text(e) for e in new_equipment]
    vectors = get_embedding_batch(texts)
    faiss_vectors = np.stack(vectors)
    index.add(faiss_vectors)
    metadata_store.extend(new_equipment)
    
    with batch_pool_lock:
        batch_pool.extend(new_equipment)
        last_append_time[0] = time.time()
    
    return jsonify({
        "status": "ok", 
        "inserted": len(new_equipment),
        "total_in_db": len(metadata_store),
        "pool_size": len(batch_pool)
    })

@app.route("/export/three_files", methods=["GET"])
def export_three_files():
    """export a zip file with three core files"""
    try:
        print("[EXPORT] Starting three-file export...")
        
        if len(metadata_store) == 0:
            return jsonify({"error": "No data to export. Database is empty."}), 400
        
        zip_filepath = create_three_file_export()
        
        if not os.path.exists(zip_filepath):
            return jsonify({"error": f"Export file was not created successfully"}), 500
        
        print(f"[EXPORT] Sending file: {zip_filepath}")
        return send_file(
            zip_filepath, 
            as_attachment=True, 
            download_name=os.path.basename(zip_filepath),
            mimetype='application/zip'
        )
    except Exception as e:
        print(f"[ERROR] Export failed: {e}")
        return jsonify({"error": f"Export failed: {str(e)}"}), 500

@app.route("/export/database_json", methods=["GET"])
def export_database_json():
    """export complete_database.json"""
    try:
        print("[EXPORT] Starting database JSON export...")
        
        if len(metadata_store) == 0:
            return jsonify({"error": "No data to export. Database is empty."}), 400
        
        filepath = save_complete_database()
        
        if not os.path.exists(filepath):
            return jsonify({"error": "Database JSON file was not created successfully"}), 500
        
        print(f"[EXPORT] Sending file: {filepath}")
        return send_file(
            filepath, 
            as_attachment=True, 
            download_name="complete_database.json",
            mimetype='application/json'
        )
    except Exception as e:
        print(f"[ERROR] Database JSON export failed: {e}")
        return jsonify({"error": f"Database JSON export failed: {str(e)}"}), 500

@app.route("/export/faiss_index", methods=["GET"])
def export_faiss_index():
    """export faiss.index"""
    try:
        print("[EXPORT] Starting FAISS index export...")
        
        if not os.path.exists(INDEX_PATH):
            return jsonify({"error": "FAISS index file not found. Try saving data first."}), 404
        
        if index.ntotal == 0:
            return jsonify({"error": "FAISS index is empty. No vectors to export."}), 400
        
        print(f"[EXPORT] Sending FAISS index with {index.ntotal} vectors")
        return send_file(
            INDEX_PATH, 
            as_attachment=True, 
            download_name="faiss.index",
            mimetype='application/octet-stream'
        )
    except Exception as e:
        print(f"[ERROR] FAISS index export failed: {e}")
        return jsonify({"error": f"FAISS index export failed: {str(e)}"}), 500

@app.route("/export/metadata_pkl", methods=["GET"])
def export_metadata_pkl():
    """export metadata.pkl"""
    try:
        print("[EXPORT] Starting metadata pickle export...")
        
        if not os.path.exists(META_PATH):
            return jsonify({"error": "Metadata pickle file not found. Try saving data first."}), 404
        
        if len(metadata_store) == 0:
            return jsonify({"error": "Metadata store is empty. No data to export."}), 400
        
        print(f"[EXPORT] Sending metadata with {len(metadata_store)} items")
        return send_file(
            META_PATH, 
            as_attachment=True, 
            download_name="metadata.pkl",
            mimetype='application/octet-stream'
        )
    except Exception as e:
        print(f"[ERROR] Metadata pickle export failed: {e}")
        return jsonify({"error": f"Metadata pickle export failed: {str(e)}"}), 500

@app.route("/save_now", methods=["POST"])
def save_now():
    """save all data immediately"""
    try:
        faiss.write_index(index, INDEX_PATH)
        
        with open(META_PATH, "wb") as f:
            pickle.dump(metadata_store, f)
        
        return jsonify({
            "status": "ok",
            "message": "All data saved successfully",
            "faiss_vectors": index.ntotal,
            "metadata_items": len(metadata_store)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/status", methods=["GET"])
def get_status():
    """get system status"""
    try:
        return jsonify({
            "database_status": "ready",
            "total_equipment": len(metadata_store),
            "faiss_index_size": index.ntotal,
            "pool_size": len(batch_pool),
            "data_consistency": index.ntotal == len(metadata_store),
            "files_exist": {
                "faiss_index": os.path.exists(INDEX_PATH),
                "metadata_pkl": os.path.exists(META_PATH)
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/query", methods=["POST"])
def query_equipment():
    """query equipment"""
    try:
        q = request.json.get("query")
        k = request.json.get("top_k", 50)
        
        response = openai.embeddings.create(
            input=[q],
            model="text-embedding-3-small"
        )
        query_vector = np.array(response.data[0].embedding, dtype=np.float32)
        
        D, I = index.search(np.array([query_vector]), k)
        results = [metadata_store[i] for i in I[0] if i < len(metadata_store)]
        
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/query/summary", methods=["POST"])
def query_summary():
    """query summary"""
    try:
        q = request.json.get("query")
        k = request.json.get("top_k", 50)
        
        response = openai.embeddings.create(
            input=[q],
            model="text-embedding-3-small"
        )
        query_vector = np.array(response.data[0].embedding, dtype=np.float32)
        
        D, I = index.search(np.array([query_vector]), k)
        
        context = ""
        for i in I[0]:
            if i < len(metadata_store):
                context += format_equipment_text(metadata_store[i]) + "\n\n"

        prompt = f"""
You are an engineering assistant. Given the following equipment information:

{context}

Answer the question: "{q}"
"""
        completion = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        answer = completion.choices[0].message.content
        
        return jsonify({"answer": answer})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print(f"[SERVER] Starting simplified three-file export server")
    print(f"[SERVER] Export directory: {EXPORT_DIR}")
    print(f"[SERVER] Available exports:")
    print(f"  - GET /export/three_files (ZIP contains 3 files)")
    print(f"  - GET /export/database_json (single JSON)")
    print(f"  - GET /export/faiss_index (single index)")
    print(f"  - GET /export/metadata_pkl (single metadata)")
    app.run(host="0.0.0.0", port=5002)