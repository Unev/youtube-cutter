#!/bin/bash
cd "$(dirname "$0")"
echo "Starting YouTube Cutter at http://localhost:5050"
open http://localhost:5050
venv/bin/python app.py
