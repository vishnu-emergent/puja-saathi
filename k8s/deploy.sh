#!/usr/bin/env bash
# Build the image, load it into kind, create the secret from .env, deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
CLUSTER=${CLUSTER:-puja}
kind get clusters | grep -qx "$CLUSTER" || kind create cluster --name "$CLUSTER" --config k8s/kind.yaml
docker build -t puja-saathi:latest .
kind load docker-image puja-saathi:latest --name "$CLUSTER"
kubectl apply -f k8s/puja-saathi.yaml
kubectl -n puja-saathi create secret generic puja-saathi-env --from-env-file=.env --dry-run=client -o yaml | kubectl apply -f -
kubectl -n puja-saathi rollout restart deploy/puja-saathi deploy/puja-saathi-web
kubectl -n puja-saathi rollout status deploy/puja-saathi-web && kubectl -n puja-saathi rollout status deploy/puja-saathi
echo "🪔 http://localhost:8787  ·  control room: http://localhost:8787/ops"
