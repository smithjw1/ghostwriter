# Ghostwriter CLI

A command-line tool to generate paragraph responses using your voice and tone from WordPress exports and a local AI model.

## Prerequisites

1.  **Node.js and npm**: Ensure you have Node.js (which includes npm) installed. You can download it from [https://nodejs.org/](https://nodejs.org/).
2.  **Local AI Model**: This tool is configured to work with [Ollama](https://ollama.ai/).
    *   Install Ollama.
    *   Pull a model, e.g., `ollama pull llama3` or `ollama pull mistral`.
    *   Start the Ollama server with `npm run start-ai` or `ollama serve`.
    *   The server must be running before using this script.
3.  **WordPress Export Files**: Place your WordPress XML export files into the `src/wordpress_exports/` directory (you'll need to create this directory if it doesn't exist).

## Setup

1.  Clone this repository (or create the files as described).
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create the `src/wordpress_exports/` directory if it's not already there:
    ```bash
    mkdir -p src/wordpress_exports
    ```
5.  Place your WordPress XML export files into `src/wordpress_exports/`.
6.  Run the preprocess script to extract keywords from your posts:
    ```bash
    node preprocess_posts.js
    ```
    This will create a `posts_database.json` file containing your posts' content, publication dates, and AI-extracted keywords.

## Usage

1. First, start the AI server:
```bash
npm run start-ai
```

2. Then, to generate a paragraph response, run:
```bash
node main.js --prompt "Your topic or prompt here"
```

Replace `"Your topic or prompt here"` with the actual prompt you want a response for.

## How it Works

This project operates in three main phases: Style Prompt Generation, Continuous Evaluation, and Content Generation.

### 1. Style Prompt Generation

First, the system analyzes your existing blog posts to create a set of "style prompts." Each prompt is a detailed instruction set for the AI on how to mimic your specific writing style.

`node main.js create-prompts [--limit <number>]`

1.  This command reads from `posts_database.json`.
2.  It sends the content of your posts to a local AI model, asking it to identify the core characteristics of your writing style (tone, sentence structure, paragraph length, etc.).
3.  The generated style prompt is saved as a `.txt` file in the `/prompts` directory.
4.  A reference to the new prompt is added to `style_prompts.json` with an initial score of `0`.

### 2. Continuous Evaluation & Refinement

This is the core of the system. It runs a continuous loop to test each style prompt against your actual posts and ranks them based on performance. This allows the system to automatically identify the most effective prompts over time.

`node main.js evaluate [--max-errors <number>]`

1.  The script loads all posts from the database and all system prompts from `style_prompts.json`.
2.  It enters an infinite loop, with each full loop constituting an "evaluation round."
3.  In each round, it iterates through your posts and, for each post, it tasks every system prompt with generating a new blog post on the same topic.
4.  An AI-powered judge compares the writing style of the original post to the generated post, assigning a **likeness score** (0.0 to 1.0).
5.  After all prompts have been tested, scores are adjudicated. Each prompt's permanent `score` in `style_prompts.json` is adjusted based on its performance relative to the average score for that round. Prompts that perform better than average gain points; those that perform worse lose points.
6.  This process repeats, constantly refining the scores and ensuring the best prompts rise to the top.

### 3. Content Generation

Once your style prompts have been evaluated, you can generate new content that accurately reflects your writing style.

`node main.js generate --prompt "<your topic>"`

1.  The script loads the evaluated system prompts from `style_prompts.json`.
2.  It automatically selects the prompt with the **highest score**.
3.  This top-performing style prompt is used as the instruction set for the AI, along with your new topic.
4.  The AI generates a new blog post that matches your topic and is written in your unique, proven style.

## Usage

This project is controlled via a command-line interface.

### `generate`
Generate a new blog post.
`node main.js generate --prompt "<your topic>" [--promptIndex <number>]`
*   `--prompt` or `-p`: (Required) The topic for the new blog post.
*   `--promptIndex` or `-i`: (Optional) Manually specify a style prompt index to use, overriding the highest-scoring one.

### `create-prompts`
Analyze posts to create new style prompts.
`node main.js create-prompts [--limit <number>]`
*   `--limit` or `-l`: (Optional) Limit the number of posts from your database to use for the analysis.

### `evaluate`
Start the continuous evaluation loop to score and rank style prompts.
`node main.js evaluate [--max-errors <number>]`
*   `--max-errors` or `-e`: (Optional) The number of consecutive failed rounds before the loop automatically stops. Defaults to 3.
