#!/bin/bash

echo "正在彻底清理所有大文件..."

# 移除所有可能的大文件
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch \
    faiss_server/faiss.index \
    faiss_server/metadata.pkl \
    faiss_server/exports/three_file_export.zip \
    faiss_server/exports/*.zip \
    faiss_server/*.index \
    faiss_server/*.pkl \
    faiss_server/*.zip \
    *.index \
    *.pkl \
    *.zip \
    *.tar.gz \
    *.rar \
    *.bin \
    *.model \
    *.weights \
    *.h5 \
    *.pb \
    *.onnx \
    *.pt \
    *.pth \
    *.ckpt \
    *.safetensors' \
  --prune-empty --tag-name-filter cat -- --all

# 清理备份
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "完成！所有大文件已从git历史中移除。" 