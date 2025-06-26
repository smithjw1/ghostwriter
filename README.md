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
npm start -- --prompt "Your topic or prompt here"
```

Or directly using node:
```bash
node main.js --prompt "Your topic or prompt here"
```

Replace `"Your topic or prompt here"` with the actual prompt you want a response for.

## How it Works

### Preprocessing Phase
1.  The preprocess script (`preprocess_posts.js`) reads your WordPress XML export files
2.  For each post, it:
    *   Extracts the post content and publication date
    *   Uses a local AI model to analyze the post and extract relevant keywords
    *   Stores this information in a structured format
3.  All processed post data is saved to `posts_database.json`, which includes:
    *   Original post content
    *   Publication dates
    *   AI-extracted keywords for each post

### Response Generation Phase
1.  When generating a new response:
    *   The main script reads from `posts_database.json`
    *   Uses keywords to find relevant past posts for context
    *   Analyzes your writing style and patterns from the database
2.  It combines:
    *   A selection of relevant past content (based on keyword matching)
    *   Your writing style patterns
    *   The new prompt you provide
6.  This combined context is sent to your local AI model (e.g., Ollama)
7.  The AI model generates a paragraph response that matches your voice and tone
8.  The paragraph response is displayed in the console for review
