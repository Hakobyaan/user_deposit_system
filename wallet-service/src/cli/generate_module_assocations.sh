#!/bin/bash

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <required argument!>"
  exit 1
fi

argument="$1"
import_associations_line="import '../modules/${argument}/associations';"

associations_file="./src/core/associations.ts"

echo "Updating associations file: $associations_file"

if [ ! -f "$associations_file" ]; then
  echo "File $associations_file does not exist."
  exit 1
fi

if ! grep -q "$import_associations_line" "$associations_file"; then

  echo "$import_associations_line" >> "$associations_file"
  echo "Associations file updated successfully!"
else
  echo "Import line already exists in associations.ts. Skipping update."
fi
