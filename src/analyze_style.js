import fs from 'fs/promises';
import ollama from 'ollama';
import { generate } from './generator.js';

const postsDatabaseFile = './src/posts_database.json';
const stylePromptsFile = './src/style_prompts.json';
const promptsDir = './src/prompts';

export async function loadPostsDatabase() {
    try {
        const data = await fs.readFile(postsDatabaseFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading posts database:', error);
        throw error;
    }
}

export async function loadStylePrompts() {
    try {
        const data = await fs.readFile(stylePromptsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function saveStylePrompt(promptText) {
    try {
        // Create prompts directory if it doesn't exist
        await fs.mkdir(promptsDir, { recursive: true });

        // Generate a unique filename
        const timestamp = Date.now();
        const filename = `prompt-${timestamp}.txt`;
        const filePath = `${promptsDir}/${filename}`;

        // Save the prompt to a text file
        await fs.writeFile(filePath, promptText);
        console.log(`Saved prompt to ${filePath}`);

        // Load existing prompts
        const existingPrompts = await loadStylePrompts();

        // Add new prompt reference
        const newPrompt = {
            promptFile: filename,
            score: 0
        };

        const updatedPrompts = [...existingPrompts, newPrompt];
        await fs.writeFile(stylePromptsFile, JSON.stringify(updatedPrompts, null, 2));

        return filename;
    } catch (error) {
        console.error('Error saving style prompt:', error);
        throw error;
    }
}

async function analyzeStyleFromPosts(posts) {
    try {


        // Initialize chat session
        let messages = [{
            role: 'user',
            content: `
                You are a style analyzer. Analyze the following blog posts and create a system prompt that captures their common writing style. Include information about tone, sentence structure and length, paragraph length, and other specifics to a persons writing style. Don't focus on the content of the posts, only the style.

                The goal is to be able to replicate this writing style with high precision regardless of the topic.
                
                Please analyze the writing style of these posts and generate a system prompt that captures their common style characteristics. This prompt should be generic enough to be used for any topic.
                
                Return ONLY the system prompt text. Do not add any explanations, introductions, or JSON formatting.
                
                Example of correct format:
                You are a professional writer...
                
                Important notes:
                1. Return ONLY the system prompt text
                2. No extra text, explanations, or JSON formatting
                3. The prompt should be complete and ready to use as a system prompt
                
                I will send you the posts one by one. After I've sent all posts, I'll ask you to generate the style prompt.
                Please wait for all posts before generating the prompt.
            `
        }];

        // Send posts one by one
        for (const [index, post] of posts.entries()) {
            console.log(`Sending post ${index + 1}/${posts.length}...`);

            // Add post to messages
            messages.push({
                role: 'user',
                content: `
                    Post ${index + 1}:
                    Title: "${post.title}"
                    Date: ${post.date}
                    Content:
                    ${post.content}
                `
            });
        }

        // Ask for style prompt
        console.log('Asking for style prompt...');

        try {
            const response = await ollama.chat({
                model: 'llama3',
                messages: messages.concat([
                    {
                        role: 'user',
                        content: 'I have sent you all the posts. Please generate the style prompt now.'
                    }
                ]),
                stream: false
            });

            // Log the raw response for debugging
            return JSON.stringify(response, null, 2);
        } catch (error) {
            console.error('Error in final response:', error);
            throw error;
        }
    } catch (error) {
        console.error('Error analyzing style:', error);
        if (error.cause && error.cause.code === 'ECONNREFUSED') {
            console.error('Connection to Ollama refused. Is the Ollama server running?');
        }
        process.exit(1);
    }
}
async function createPrompts() {
    // Load posts database
    const postsDatabase = await loadPostsDatabase();
    const posts = Array.isArray(postsDatabase) ? postsDatabase : postsDatabase.posts || [];

    if (posts.length === 0) {
        throw new Error('No posts found in database');
    }

    // Shuffle posts once
    const shuffledPosts = [...posts].sort(() => Math.random() - 0.5);

    // Process posts in batches of 10
    const batchSize = 10;
    const totalBatches = Math.ceil(shuffledPosts.length / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, shuffledPosts.length);
        const batchPosts = shuffledPosts.slice(start, end);

        console.log(`\nProcessing batch ${batch + 1}/${totalBatches} (${batchPosts.length} posts)`);

        const response = JSON.parse(await analyzeStyleFromPosts(batchPosts));
        await saveStylePrompt(response.message.content);
    }
}

// This function now evaluates a single post against a single system prompt
async function evaluateStyle(post, promptIndex) {
    try {
        console.log(`\nEvaluating style for post: "${post.title}" using prompt index ${promptIndex}`);

        // Generate a prompt for the AI from the post's keywords
        const keywords = post.ai_keywords || [];
        const prompt = `Write a blog post about ${keywords.slice(0, 3).join(', ')} in the style of ${post.title}`;
        console.log(`Generated prompt: ${prompt}`);

        // Generate a response using the specified system prompt
        const generatedResponse = await generate(prompt, promptIndex);
        console.log('\nGenerated response:', generatedResponse);

        // Compare the generated post with the original to get a likeness score
        const likenessScore = await getLikenessScoreFromAI(post.content, generatedResponse);
        return likenessScore;
    } catch (error) {
        console.error(`Error during style evaluation for prompt index ${promptIndex}:`, error);
        return 0; // Return a score of 0 on error to not penalize other prompts
    }
}

async function getLikenessScoreFromAI(original, generated) {
    // If generated content is empty or invalid, likeness is 0
    if (!generated || typeof generated !== 'string') {
        return 0;
    }

    const prompt = `
You are a text analysis expert. Compare the writing style of the following two blog posts.
The first is the 'Original Post' and the second is the 'Generated Post'.
Provide a likeness score from 0.0 to 1.0, where 1.0 means the styles are identical and 0.0 means they are completely different.
IMPORTANT: Only return the numerical score and nothing else. Do not add any explanation or context.

Original Post:
---
${original}
---

Generated Post:
---
${generated}
---
`;

    try {
        console.log('\nGetting likeness score from AI...');
        const response = await ollama.chat({
            model: 'llama3',
            messages: [{ role: 'user', content: prompt }],
        });

        // The AI might return more than just the number. Let's find the number.
        const scoreMatch = response.message.content.match(/(\d*\.?\d+)/);
        if (scoreMatch && scoreMatch[0]) {
            const score = parseFloat(scoreMatch[0]);
            return isNaN(score) ? 0 : score;
        }
        console.warn('Could not parse likeness score from AI response:', response.message.content);
        return 0; // Return 0 if no score could be parsed
    } catch (error) {
        console.error('Error getting likeness score from AI:', error);
        return 0; // Return 0 on error
    }
}

// New function to loop through all system prompts and find the winner
async function evaluateSystemPrompts(post) {
    try {
        console.log('--- Starting System Prompt Evaluation ---');

        // Load all available system prompts
        const stylePrompts = await loadStylePrompts();
        if (!stylePrompts || stylePrompts.length === 0) {
            throw new Error('No system prompts found in style_prompts.json.');
        }
        console.log(`Found ${stylePrompts.length} system prompts to evaluate.`);



        // Evaluate each prompt and store its score
        const scores = [];
        for (let i = 0; i < stylePrompts.length; i++) {
            console.log(`\n=> Evaluating Prompt ${i + 1}/${stylePrompts.length}...`);
            const likenessScore = await evaluateStyle(post, i);
            scores.push({ index: i, score: likenessScore });
            console.log(`Likeness score for prompt ${i + 1}: ${likenessScore.toFixed(2)}`);
        }

        // --- Score Adjudication ---
        if (scores.length === 0) {
            throw new Error('No scores were recorded during evaluation.');
        }

        // Calculate the average score for this round
        const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
        const averageScore = totalScore / scores.length;
        console.log(`\n--- Evaluation Complete ---`);
        console.log(`Average likeness score for this round: ${averageScore.toFixed(2)}`);

        // Update each prompt's 'score' based on its performance relative to the average
        console.log('Updating prompt scores...');
        scores.forEach(({ index, score }) => {
            const difference = score - averageScore;
            const currentScore = stylePrompts[index].score || 0;
            stylePrompts[index].score = currentScore + difference;
            console.log(`Prompt #${index + 1}: Score of ${score.toFixed(2)} (${difference >= 0 ? '+' : ''}${difference.toFixed(2)} vs avg). New total score: ${stylePrompts[index].score.toFixed(2)}`);
        });

        // Save the updated scores back to the file
        await fs.writeFile(stylePromptsFile, JSON.stringify(stylePrompts, null, 2), 'utf-8');
        console.log('\nUpdated all prompt scores in style_prompts.json.');

    } catch (error) {
        console.error('An error occurred during system prompt evaluation:', error);
    }
}

// Helper function to shuffle an array in place (Fisher-Yates shuffle)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// New function to run the evaluation process in a continuous loop
async function startContinuousEvaluation(maxErrors = 3, postLimit = null) {
    console.log('--- Starting Continuous System Prompt Evaluation ---');

    // Load the post database once at the start
    const postsDatabase = await loadPostsDatabase();
    let posts = Array.isArray(postsDatabase) ? postsDatabase : postsDatabase.posts || [];
    if (posts.length === 0) {
        console.error('No posts found in the database. Stopping evaluation.');
        return; // Exit if there are no posts
    }
    console.log(`Loaded ${posts.length} posts from the database.`);

    if (postLimit) {
        posts = posts.slice(0, postLimit);
        console.log(`Using a limit of ${postLimit} posts for evaluation.`);
    }

    let round = 1;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = maxErrors; // Exit after maxErrors consecutive errors

    while (true) {
        console.log(`\n\n--- Starting Evaluation Round ${round} ---`);
        try {
            // Shuffle posts for each new round
            shuffleArray(posts);
            console.log(`Shuffled ${posts.length} posts for this round.`);

            for (let i = 0; i < posts.length; i++) {
                const post = posts[i];
                console.log(`\n--- Evaluating with Post ${i + 1}/${posts.length}: "${post.title}" ---`);
                await evaluateSystemPrompts(post);
            }

            console.log(`--- Finished Evaluation Round ${round} ---`);
            round++;
            consecutiveErrors = 0; // Reset error count on a successful round

        } catch (error) {
            console.error('A critical error occurred during the evaluation round:', error);
            consecutiveErrors++;
            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error(`Exceeded max consecutive errors (${maxConsecutiveErrors}). Stopping evaluation.`);
                break; // Exit the loop
            }
            // Optional: wait a bit before restarting to avoid fast-fail loops
            console.log(`Restarting evaluation in 10 seconds... (Error ${consecutiveErrors}/${maxConsecutiveErrors})`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

export { createPrompts, startContinuousEvaluation };
