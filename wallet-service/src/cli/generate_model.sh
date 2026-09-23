#!/bin/bash

if [ -z "$1" ]; then
  echo "Error: No folder name provided"
  exit 1
fi

if [ -z "$2" ]; then
  echo "Error: No model type provided"
  exit 1
fi

FOLDER_NAME=$1
MODEL_TYPE=$2

INTERFACE_NAME=$(echo "$FOLDER_NAME" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')
MODEL_CLASS_NAME=$(echo "$FOLDER_NAME" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')
TABLE_NAME=$(echo "$FOLDER_NAME" | awk '{print tolower($0)}')

MODEL_CODE=""

if [ "$MODEL_TYPE" == "mongo" ]; then
  MODEL_CODE="import mongoose, { Schema, Document } from 'mongoose';

interface I$INTERFACE_NAME extends Document {}

const $MODEL_CLASS_NAME = mongoose.model<I$INTERFACE_NAME>('$MODEL_CLASS_NAME', new Schema({}));

export default $MODEL_CLASS_NAME;"
else
  MODEL_CODE="import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../database';

interface I$INTERFACE_NAME {
  id: number;
}

class $MODEL_CLASS_NAME extends Model<I$INTERFACE_NAME, Optional<I$INTERFACE_NAME, 'id'>> implements I$INTERFACE_NAME {
  public id!: number;
}

$MODEL_CLASS_NAME.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  }
}, { 
  sequelize, tableName: '$TABLE_NAME'
});

export default $MODEL_CLASS_NAME;"
fi

echo "$MODEL_CODE" > "./src/modules/$FOLDER_NAME/model.ts"

echo "model.ts file has been created in $FOLDER_NAME folder with $MODEL_TYPE model."
