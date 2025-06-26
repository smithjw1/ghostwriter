import fs from 'fs/promises';
import path from 'path';
import xml2js from 'xml2js';
import ollama from 'ollama';
import { htmlToText } from 'html-to-text';

const wordpressExportsDir = path.join('src', 'wordpress_exports');
const outputDatabaseFile = path.join('posts_database.json'); // Output in project root

async function extractKeywordsWithAI(postContent) {
    if (!postContent || postContent.trim().length < 50) { // Basic check for minimal content
        // console.log('Skipping keyword extraction for very short content.');
        return [];
    }
    // Trim content to a reasonable length for keyword extraction to save tokens/time
    const content = postContent.substring(0, 4000);
    const prompt = `Analyze the following blog post content. Identify and list the 5-7 most important and relevant keywords or keyphrases. Your response MUST be a comma-separated list of these keywords/keyphrases ONLY. Do not include any introductory phrases, explanations, numbering, bullet points, or any text other than the keywords themselves. If no relevant keywords can be found, or the text is too short/generic, output the exact string 'N/A'.\n\nCONTENT:\n${content}`;

    try {
        const response = await ollama.chat({
            model: 'llama3', // Or your preferred model
            messages: [{ role: 'user', content: prompt }],
            stream: false,
        });

        let cleanedKeywordsText = response.message.content.trim();

        if (cleanedKeywordsText.toLowerCase() === 'n/a' || cleanedKeywordsText === '') {
            return [];
        }

        // Attempt to remove common conversational prefixes/suffixes using regex
        // This looks for phrases like "Here are the keywords:", etc., and removes them.
        cleanedKeywordsText = cleanedKeywordsText.replace(/^(?:here are|these are|the keywords are|sure, here are|based on the text|i extracted|the following are)?[^a-zA-Z0-9_("]*?(?:keywords|keyphrases|list|is|are)?:?\s*/i, '');

        // Remove any text that looks like a lead-up sentence ending with a colon, if it's on its own line before keywords
        const lines = cleanedKeywordsText.split('\n');
        if (lines.length > 1 && lines[0].includes(':') && !lines[0].includes(',')) {
            cleanedKeywordsText = lines.slice(1).join('\n').trim();
        }

        // Final check for N/A after cleaning attempts
        if (cleanedKeywordsText.toLowerCase() === 'n/a' || cleanedKeywordsText === '') {
            return [];
        }

        // Split by comma, then trim and filter. Also handle cases where newlines might be used instead of commas by the AI.
        const potentialKeywords = cleanedKeywordsText.split(/[,\n]/).map(kw => kw.trim()).filter(kw => kw.length > 0 && kw.length < 100); // Added length constraint

        // Filter out any remaining conversational artifacts or very generic terms if possible
        // This is a basic filter; more sophisticated NLP might be needed for perfect results
        const commonChatter = ["keywords", "keyphrases", "relevant", "important", "extracted", "phrases"];
        return potentialKeywords.filter(kw => !commonChatter.some(chatter => kw.toLowerCase().includes(chatter) && kw.split(' ').length > 2));

    } catch (error) {
        console.error('Error extracting keywords with AI:', error);
        return []; // Return empty on error
    }
}

async function preprocessWordPressExports() {
    console.log('Starting preprocessing of WordPress export files...');
    let allPostsData = [];
    let processedGuids = new Set();

    // Try to load existing database to make the script resumable
    try {
        const existingData = await fs.readFile(outputDatabaseFile, 'utf-8');
        allPostsData = JSON.parse(existingData);
        // Populate the set with IDs (GUIDs) from the existing database
        allPostsData.forEach(p => {
            if (p.id) { // p.id should be the GUID
                processedGuids.add(p.id);
            }
        });
        console.log(`Loaded ${allPostsData.length} posts from existing database. ${processedGuids.size} unique GUIDs identified for skipping.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No existing database found. Starting from scratch.');
        } else {
            console.error('Error reading existing database file:', error);
            // Decide if you want to continue or stop. For now, we'll start fresh.
            allPostsData = [];
        }
    }

    try {
        const files = await fs.readdir(wordpressExportsDir);
        const xmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.xml');

        if (xmlFiles.length === 0) {
            console.warn(`No XML files found in ${wordpressExportsDir}.`);
            return;
        }

        const parser = new xml2js.Parser();
        let postCount = 0;

        for (const xmlFile of xmlFiles) {
            const filePath = path.join(wordpressExportsDir, xmlFile);
            console.log(`Processing XML file: ${filePath}...`);
            const xmlData = await fs.readFile(filePath, 'utf-8');
            const result = await parser.parseStringPromise(xmlData);
            const channel = result.rss.channel[0];
            const blogTitle = channel.title && channel.title[0] ? channel.title[0] : 'Unknown Blog Title';
            const items = channel.item;

            if (items) {
                for (const item of items) { // Changed to allow await inside loop
                    const postType = item['wp:post_type'] && item['wp:post_type'][0];
                    const status = item['wp:status'] && item['wp:status'][0];
                    const contentEncoded = item['content:encoded'] && item['content:encoded'][0];
                    const pubDateString = item['pubDate'] && item['pubDate'][0];
                    const title = item['title'] && item['title'][0];
                    const guid = item['guid'] && item['guid'][0] && (typeof item['guid'][0] === 'string' ? item['guid'][0] : item['guid'][0]._);

                    // Skip if post has no GUID or has already been processed
                    if (!guid) {
                        console.warn(`Post titled "${title ? title.substring(0,30) : 'Untitled'}" has no GUID, skipping.`);
                        continue;
                    }

                    if (processedGuids.has(guid)) {
                        // console.log(`Skipping already processed GUID: ${guid}`);
                        continue;
                    }

                    // Skip X-posts
                    if (title && title.trim().startsWith('X-post:')) {
                        process.stdout.write(`Skipping X-post: ${title.substring(0, 50)}...\n`);
                        continue;
                    }

                    // Skip AFK posts
                    if (title && title.trim().startsWith('AFK for smithjw1')) {
                        process.stdout.write(`Skipping AFK post: ${title.substring(0, 50)}...\n`);
                        continue;
                    }

                    if (postType === 'post' && status === 'publish' && contentEncoded && pubDateString) {
                        postCount++;
                        process.stdout.write(`  Processing post ${postCount}: ${title.substring(0, 50)}... `);
                        const textContent = htmlToText(contentEncoded, {
                            wordwrap: false,
                            selectors: [
                                { selector: 'a', options: { ignoreHref: true } },
                                { selector: 'img', format: 'skip' },
                            ]
                        }).trim();

                        if (textContent) {
                            const aiKeywords = await extractKeywordsWithAI(textContent);

                            if (aiKeywords.length > 0) {
                                allPostsData.push({
                                    id: guid, // Use the GUID from XML
                                    title: title,
                                    blog_title: blogTitle,
                                    date: new Date(pubDateString).toISOString(),
                                    content: textContent,
                                    ai_keywords: aiKeywords,
                                });
                                process.stdout.write(`Keywords: [${aiKeywords.join(', ')}]\n`);

                                // Save progress every 25 posts
                                if (postCount > 0 && postCount % 25 === 0) {
                                    console.log(`\n--- Reached batch of 25 posts, saving progress... ---`);
                                    allPostsData.sort((a, b) => new Date(b.date) - new Date(a.date));
                                    await fs.writeFile(outputDatabaseFile, JSON.stringify(allPostsData, null, 2));
                                    console.log(`--- Progress saved. Total posts in database: ${allPostsData.length} ---`);
                                }
                            } else {
                                process.stdout.write(`No keywords extracted, skipping post.\n`);
                            }
                        } else {
                            process.stdout.write(`No content found, skipping.
`);
                        }
                    }
                }
            }

            // Save intermediate progress after processing each file
            console.log(`
Finished processing ${xmlFile}. Saving intermediate progress...`);
            // Sort before saving to keep the file tidy
            allPostsData.sort((a, b) => new Date(b.date) - new Date(a.date));
            await fs.writeFile(outputDatabaseFile, JSON.stringify(allPostsData, null, 2));
            console.log('Progress saved.');
        }

        console.log(`
Preprocessing complete. A total of ${allPostsData.length} posts are now in ${outputDatabaseFile}`);

    } catch (error) {
        console.error('Error during preprocessing:', error);
    }
}

preprocessWordPressExports();
