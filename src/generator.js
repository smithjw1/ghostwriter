import fs from 'fs/promises';
import ollama from 'ollama';
import { loadPostsDatabase, loadStylePrompts } from './analyze_style.js';

const promptsDir = './src/prompts';

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
    console.log(`Loading posts database...`);
    try {
        const allPosts = await loadPostsDatabase();

        if (!allPosts || allPosts.length === 0) {
            console.warn(`No posts found. Please run the preprocessing script.`);
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

        const relevantPostObjects = relevantPosts.map(post => ({
            title: post.title,
            content: post.content,
            date: post.date,
            ai_keywords: post.ai_keywords
        }));

        console.log(`Found ${relevantPosts.length} relevant posts in the database.`);
        return relevantPostObjects;
    } catch (error) {
        console.error(`Error loading posts database:`, error);
        return '';
    }
}

// Function to load system prompts
async function loadSystemPrompt(index = null) {
    try {
        const prompts = await loadStylePrompts();

        if (prompts.length === 0) {
            throw new Error('No style prompts found');
        }

        if (index !== null) {
            const prompt = prompts[index];
            if (!prompt) {
                throw new Error(`Prompt with index ${index} not found.`);
            }
            const promptPath = promptsDir + '/' + prompt.promptFile;
            console.log(`Loading system prompt from: ${promptPath}`);
            return await fs.readFile(promptPath, 'utf-8');
        }

        // Find prompt with highest score
        const bestPrompt = prompts.reduce((prev, current) =>
            (prev.score || 0) > (current.score || 0) ? prev : current
        );
        const bestPromptPath = promptsDir + '/' + bestPrompt.promptFile;
        console.log(`Loading system prompt from: ${bestPromptPath}`);
        return await fs.readFile(bestPromptPath, 'utf-8');
    } catch (error) {
        console.error('Error loading system prompt:', error);
        throw error;
    }
}

// Function to generate blog post using local AI
async function generateBlogPost(userPrompt, relevantPosts, systemPrompt = null) {
    console.log('\nGenerating blog post with local AI...');
    if (!userPrompt) {
        console.error('Prompt cannot be empty.');
        return 'Error: Prompt was empty.';
    }

    try {
        // Create the conversation messages
        const messages = [
            {
                role: 'system',
                content: systemPrompt || 'You are a professional blog writer. Write a blog post that is engaging, informative, and well-structured.'
            }
        ];

        messages.push({
            role: 'user',
            content: `I am about to send you a series of posts related to ${userPrompt}. Each one will be in it's own message.`
        });

        // Add relevant posts context if available
        if (relevantPosts && relevantPosts.length > 0) {
            for (const post of relevantPosts) {
                messages.push({
                    role: 'user',
                    content: `
Title: "${post.title}"
Date: ${post.date}
Keywords: ${post.ai_keywords ? post.ai_keywords.join(', ') : 'N/A'}
Content:
${post.content}

---
`
                });
            }
        }

        // Add the user prompt with context
        messages.push({
            role: 'user',
            content: `Please write a new blog post on ${userPrompt}. The post should use the content I just sent a source material. Folowing the system prompt guidelines.
      
      Only post content should be returned. No additional text or explinations.
      `
        });

        // Make the chat request
        const response = await ollama.chat({
            model: 'llama3',
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
export async function generate(userPrompt, promptIndex = null) {
    console.log('AI Blog Writer CLI');
    console.log('--------------------');
    console.log(`Prompt received: "${userPrompt}"`);

    const relevantPastPostsContent = await getRelevantContext(userPrompt);

    // Load the system prompt
    let systemPrompt;
    try {
        systemPrompt = await loadSystemPrompt(promptIndex);
        console.log('Using system prompt:', systemPrompt);
    } catch (error) {
        console.warn('Could not load system prompt:', error);
        systemPrompt = null;
    }

    if (!relevantPastPostsContent) {
        console.warn(`\nCould not retrieve past post content from ${postsDatabaseFile}. The AI will generate content without your specific style. Please ensure '${postsDatabaseFile}' exists and is populated by running 'node preprocess_posts.js'.`);
        // For now, we'll proceed but the AI won't have style context.
    }

    const blogPost = await generateBlogPost(userPrompt, relevantPastPostsContent, systemPrompt);

    console.log('\nProcess finished.');
    return blogPost;
}
