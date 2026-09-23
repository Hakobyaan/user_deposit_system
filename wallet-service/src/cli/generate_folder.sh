#!/bin/bash

if [ -z "$1" ]; then
  echo "Error: No folder not creaetd!"
  exit 1
fi
mkdir -p "./src/modules/$1"
echo "Folder $1 created."