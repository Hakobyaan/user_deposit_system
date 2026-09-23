#!/bin/bash

if [ -z "$1" ]; then
  echo "Error: No folder name provided"
  exit 1
fi

mkdir -p "./src/modules/$1"


if [ "$2" == "true" ]; then
  echo "/* eslint-disable @typescript-eslint/no-unused-vars */
import { Router } from 'src/types/module';
import service from './service';

export const module: Router = {
  routes: [
    {
      method: 'GET',
      path: '/:id',
      handler: async ({ params }) => service.getOne(params),
    },
    {
      method: 'GET',
      path: '/',
      auth: false,
      handler: async ({ query }) => service.createOne(),
    },
    {
      method: 'POST',
      path: '/',
      handler: async ({ body }) => service.create(body),
    },
    {
      method: 'PUT',
      path: '/:id',
      handler: async ({ params, body }) => service.update(params, body),
    },
    {
      method: 'DELETE',
      path: '/:id',
      handler: async ({ params }) => service.delete(params),
    }
  ]
};" > "./src/app/modules/$1/routers.ts"
  echo "Full routers.ts file has been created in $1 folder."
else
  echo "import { Router } from 'src/types/module';
export const module: Router = {
  routes: []
};" > "./src/modules/$1/router.ts"
  echo "Simple routers.ts file has been created in $1 folder."
fi
