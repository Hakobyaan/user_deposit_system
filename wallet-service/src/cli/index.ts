import fs from 'fs';
import { exec } from 'child_process';

import logger from '../utils/logger';

const NOT_ALLOWED_SYMBOLS = [
  '/', ' ', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '+', '=', ',', '<', '>', '?',
  '[', ']', '{', '}', '|',
];

function makeSingular(word: string): string {
  const irregularSingulars: Record<string, string> = {
    people: 'person',
    men: 'man',
    women: 'woman',
    children: 'child',
    teeth: 'tooth',
    feet: 'foot',
    mice: 'mouse',
    geese: 'goose',
    oxen: 'ox',
  };

  if (irregularSingulars[word.toLowerCase()]) {
    return irregularSingulars[word.toLowerCase()];
  }

  if (word.endsWith('ies') && word.length > 3) {
    return `${word.slice(0, -3)}y`;
  }

  if (word.endsWith('es') && (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') || word.endsWith('ches') || word.endsWith('shes'))) {
    return word.slice(0, -2);
  }

  if (word.endsWith('s') && word.length > 1 && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }

  return word;
}

function ensureSingular(word: string): string {
  return makeSingular(word);
}
let md = ensureSingular(process.argv[3]);

const regex = new RegExp(`[${NOT_ALLOWED_SYMBOLS.join('')}]`, 'g');
md = md.replace(regex, '_');

const withRoute = process.argv.includes('route');
const into = process.argv.includes('mongo');
const model = into ? 'mongo' : 'sql';

if (!md || fs.existsSync(`../modules/${md}`)) {
  logger.error(`Error: Module ${md} already exists`);

  // eslint-disable-next-line no-process-exit
  process.exit(1);
}

function runShellCommand(command: string) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (stderr) {
        logger.error(`Error executing ${command}: ${stderr}`);
        logger.error(`Stderr: ${stderr}`);

        reject(error ?? stderr);
      }
      if (error) {
        logger.error(`Error executing ${command}: ${stderr}`);
        reject(error);
      } else {
        logger.info(stdout);
        resolve(stdout);
      }
    });
  });
}

async function generateFiles() {
  try {
    if (!fs.existsSync(`./src/modules/${md}`)) {
      await runShellCommand(`./src/cli/generate_folder.sh ${md}`);
      await runShellCommand(`./src/cli/generate_model.sh ${md} ${model}`);
      await runShellCommand(`./src/cli/generate_repository.sh ${md}`);
      await runShellCommand(`./src/cli/generate_service.sh ${md}`);
      await runShellCommand(`./src/cli/generate_assocations.sh ${md}`);
      await runShellCommand(`./src/cli/generate_assocations.sh ${md}`);
      await runShellCommand(`./src/cli/generate_module_assocations.sh ${md}`);
      await runShellCommand(`./src/cli/gnerate_router.sh ${md} ${withRoute}`);
      await runShellCommand(`./src/cli/generate_middleware.sh ${md}`);
    } else {
      logger.error(`Error generating files: Module ${md} already exists!`);
    }
  } catch (error) {
    logger.error('Error generating files:', error);
  }
}

generateFiles();
