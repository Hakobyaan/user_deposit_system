#!/bin/bash

if [ -z "$1" ]; then
  echo "Error: No folder name provided"
  exit 1
fi

echo "import { CoreRepository } from '../../core/repository';
import Model from './model';

export class Repository extends CoreRepository<Model> {}" > "./src/modules/$1/repository.ts"
echo "repository.ts file has been created in $1 folder."
