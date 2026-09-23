#!/bin/bash

if [ -z "$1" ]; then
  echo "Error: No folder name provided"
  exit 1
fi

echo "" > "./src/modules/$1/associations.ts"
echo "associations.ts file has been created in $1 folder."
