import { generate } from './src/generator.js';
import { createPrompts, startContinuousEvaluation } from './src/analyze_style.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .command('generate', 'Generate a blog post', (yargs) => {
    return yargs
      .option('prompt', {
        alias: 'p',
        type: 'string',
        description: 'The prompt or topic for the blog post',
        demandOption: true,
      })
      .option('promptIndex', {
        alias: 'i',
        type: 'number',
        description: 'Index of the style prompt to use. If not provided, uses the prompt with the highest score.',
        default: null
      });
  }, (argv) => {
    console.log('Starting blog post generation...');
    generate(argv.prompt, argv.promptIndex);
  })
  .command('create-prompts', 'Analyze posts and create new style prompts', (yargs) => {
    return yargs
      .option('limit', {
        alias: 'l',
        type: 'number',
        description: 'Limit the number of posts to use for analysis.',
        default: null
      });
  }, (argv) => {
    console.log('Starting prompt creation...');
    createPrompts(argv.limit);
  })
  .command('evaluate', 'Start the continuous evaluation of system prompts', (yargs) => {
    return yargs
      .option('max-errors', {
        alias: 'e',
        type: 'number',
        description: 'Maximum number of consecutive errors before stopping.',
        default: 3
      });
  }, (argv) => {
    console.log('Starting continuous evaluation...');
    startContinuousEvaluation(argv.maxErrors);
  })
  .demandCommand(1, 'You must specify a command: generate, create-prompts, or evaluate.')
  .help()
  .alias('help', 'h')
  .argv;
