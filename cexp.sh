#!/bin/bash

# Remove output.txt if it exists to start fresh
rm -f output.txt

# Find all .ts and .tsx files excluding node_modules, and concatenate filename and contents into output.txt
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "*/node_modules/*" | while read -r file; do
  echo -e "\n// File: $file\n" >> output.txt
  cat "$file" >> output.txt
done

echo "All TypeScript (.ts and .tsx) code has been combined into output.txt with filenames as headers, excluding node_modules"
