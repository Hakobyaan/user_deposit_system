Module Generator Cli

Usage

npm run cli - npm script to run cli;

EXAMPLE
 - npm run cli product

The cli create a module in modules directory, named {products}, it make module name always plural.
In the module router for this case we dont have any api routes generated.

 - npm run cli product -- route

In this case the cli create a module named {products}, and in module router we have a API default CRUD.

Use the --mongo flag to create a model extended by MongoModel if the model will be used with MongoDB. In this case, the repository will be configured for the MongoDB model. Otherwise, by default, the model will be configured for a PostgreSQL database using SqlModel.

EXAMPLE
  - npm run cli product -- route -- mongo

NOTES: 
  - check argument value you set as module name, i should not included one of not supported symbols.
    anyways that symbols will be converted to allowed symbol

    - NOT ALLOWED SYMBOLS [
        '/', ' ', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '+', '=', ',', '<', '>', '?',
        '[', ']', '{', '}', '|',
    ]

    -  ALLOWED SYMBOLS [
      '_'
    ]

PLEASE DONT TOUCH ANY FILE IN CLI DIRECTORY IF YOU DONT HOW TO USE IT.)
