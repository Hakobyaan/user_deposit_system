#!/bin/bash

if [ -z "$1" ]; then
  echo "Error: No folder name provided"
  exit 1
fi

echo "import { CoreService } from '../../core/service';
import { Repository } from './repository';
import Model from './model';

const repository = new Repository(Model);

class Service extends CoreService<Model> {
  protected repository = repository;
}

export default new Service(repository);" > "./src/modules/$1/service.ts"
echo "service.ts file has been created in $1 folder."
