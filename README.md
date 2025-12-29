# AI Catalog Bot

A Telegram bot that automatically catalogs AI-related content by analyzing links and committing them to your GitHub portfolio.

## Features

- 📱 **Telegram Integration**: Send links via Telegram
- 🤖 **AI Content Extraction**: Uses OpenAI GPT-4 to analyze and categorize content
- 📊 **Smart Categorization**: Automatically suggests categories (tweets, tools, prompts, people)
- 🔄 **GitHub Auto-commit**: Automatically updates your portfolio's ai-data.json
- 🚀 **Railway Deployment**: Ready for easy cloud deployment

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your tokens:

```bash
cp .env.example .env
```

Required tokens:
- `TELEGRAM_BOT_TOKEN`: Get from [@BotFather](https://t.me/BotFather)
- `OPENAI_API_KEY`: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- `GITHUB_TOKEN`: Fine-grained personal access token with repo write permissions

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Locally

```bash
npm run dev
```

### 4. Deploy to Railway

1. Connect your GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Deploy!

## Usage

1. Start a chat with your bot
2. Send any AI-related link (Twitter, tools, articles, etc.)
3. Bot analyzes content and asks for category
4. Select category using provided buttons
5. Content is automatically added to your AI catalog!

## Supported Link Types

- **Twitter/X Posts**: Extracts tweet content and author
- **AI Tools**: Extracts features and descriptions
- **Articles/Blogs**: Analyzes content for relevance
- **Any URL**: Uses AI to determine best categorization

## Architecture

```
Telegram Message → OpenAI Analysis → Category Selection → GitHub Commit → Live Update
```

The bot maintains session state for category selection and handles errors gracefully.