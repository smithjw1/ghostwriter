import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs/promises';
import ollama from 'ollama';

const postsDatabaseFile = 'posts_database.json';

// A set of common English stop words to filter out from user prompts.
const stopWords = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s',
  'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself',
  'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
  'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d',
  'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where',
  'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t',
  'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  // Common query words that aren't useful for searching content
  'tell', 'give', 'show', 'explain', 'what', 'who', 'when', 'where', 'why', 'how', 'can', 'write', 'compose', 'generate'
]);

// Function to get RELEVANT context based on prompt keywords
async function getRelevantContext(userPrompt) {
  console.log(`Reading posts database from ${postsDatabaseFile}...`);
  try {
    const dbData = await fs.readFile(postsDatabaseFile, 'utf-8');
    const allPosts = JSON.parse(dbData);

    if (!allPosts || allPosts.length === 0) {
      console.warn(`No posts found in ${postsDatabaseFile}. Please run the preprocessing script.`);
      return '';
    }

    const keywords = userPrompt
      ? userPrompt
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(kw => kw && !stopWords.has(kw))
      : [];
    let relevantPosts = [];

    relevantPosts = allPosts.filter(post => {
      const titleMatch = post.title && keywords.some(kw => post.title.toLowerCase().includes(kw));
      const keywordMatch = post.ai_keywords && post.ai_keywords.some(dbKw => keywords.some(promptKw => dbKw.toLowerCase().includes(promptKw)));
      return titleMatch || keywordMatch;
    });

    // Sort relevant posts by date, most recent first, to prioritize newer context
    relevantPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

    let allPostsContent = '';
    for (const post of relevantPosts) {
      allPostsContent += post.content + '\n\n'; // Add post content
    }

    console.log(`Found ${relevantPosts.length} relevant posts in the database. Extracted ${allPostsContent.length} characters of text for context.`);
    return allPostsContent;
  } catch (error) {
    console.error(`Error reading or parsing ${postsDatabaseFile}:`, error);
    if (error.code === 'ENOENT') {
      console.error(`${postsDatabaseFile} not found. Please run the preprocessing script (e.g., node preprocess_posts.js).`);
    }
    return '';
  }
}




// Function to generate blog post using local AI
async function generateBlogPost(prompt, relevantContext) {
  console.log('\nGenerating blog post with local AI...');
  if (!prompt) {
    console.error('Prompt cannot be empty.');
    return 'Error: Prompt was empty.';
  }

  // Split the relevant context into individual posts
  const posts = relevantContext.split('\n\n').filter(p => p.trim());

  // Create a conversation with multiple messages
  const messages = posts.map(post => ({
    role: 'user',
    content: `
Here is one of my previous posts. Use it to understand my style, voice, and tone:

${post}

---
    `
  }));

  // Add the final prompt asking for the response
  messages.push({
    role: 'user',
    content: `
Based on the writing style demonstrated in the previous posts, please write a one or two paragraph response to this prompt:

Prompt: "${prompt}"

Please write a first draft and then please review and revise the draft. Your goal is to make it sound more like my writing style. Pay close attention to word choice, sentence structure, and the overall tone demonstrated in the sample writing. 

Response:
    `
  });

  try {
    // Ensure Ollama server is running and the model is available (e.g., 'llama3')
    // You might want to make the model name configurable
    const response = await ollama.chat({
      model: 'llama3', // Or your preferred model like 'mistral'
      messages: messages,
      stream: true,
    });
    let finalBlogPost = '';
    process.stdout.write(' '); // Start with a space for clean stream start
    for await (const part of response) {
      process.stdout.write(part.message.content);
      finalBlogPost += part.message.content;
    }
    console.log('\n--- End of Blog Post ---\n');
    return finalBlogPost;
  } catch (error) {
    console.error('Error communicating with local AI model (Ollama):', error);
    if (error.cause && error.cause.code === 'ECONNREFUSED') {
      console.error('Connection to Ollama refused. Is the Ollama server running?');
    }
    return 'Error generating blog post. Please check AI model setup and logs.';
  }
}

// Main function
async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'The prompt or topic for the blog post',
      demandOption: true, // Makes the prompt a required argument
    })
    .usage('Usage: node main.js --prompt "Your blog post topic"')
    .help()
    .alias('help', 'h')
    .argv;

  console.log('AI Blog Writer CLI');
  console.log('--------------------');
  console.log(`Prompt received: "${argv.prompt}"`);

  const relevantPastPostsContent = await getRelevantContext(argv.prompt);

  if (!relevantPastPostsContent && !argv.ignoreStyle) {
    console.warn(`\nCould not retrieve past post content from ${postsDatabaseFile}. The AI will generate content without your specific style. Please ensure '${postsDatabaseFile}' exists and is populated by running 'node preprocess_posts.js'.`);
    // For now, we'll proceed but the AI won't have style context.
  }

  await generateBlogPost(argv.prompt, relevantPastPostsContent);

  console.log('\nProcess finished.');
}

main().catch(console.error);
