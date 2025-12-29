const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');
const cheerio = require('cheerio');
const http = require('http');
require('dotenv').config();

// Configuration
const CONFIG = {
  GITHUB: {
    OWNER: 'rishabhjava',
    REPO: 'portfolio',
    DATA_PATH: 'ai-data.json'
  },
  SERVER: {
    PORT: process.env.PORT || 3000,
    TIMEOUT: 10000
  },
  OPENAI: {
    MODEL: 'gpt-4',
    TEMPERATURE: 0.1
  }
};

// Initialize services with error handling
let bot, openai, octokit;

try {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not found - bot polling disabled');
  } else {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
      polling: {
        interval: 1000,
        autoStart: true,
        params: {
          timeout: 10
        }
      }
    });

    // Add error handling for the bot
    bot.on('polling_error', (error) => {
      console.error('Polling error:', error);
    });

    bot.on('error', (error) => {
      console.error('Bot error:', error);
    });
  }
} catch (error) {
  console.error('Failed to initialize Telegram bot:', error.message);
}

try {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY not found - AI features disabled');
  } else {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (error) {
  console.error('Failed to initialize OpenAI:', error.message);
}

try {
  if (!process.env.GITHUB_PAT) {
    console.warn('⚠️ GITHUB_PAT not found - GitHub integration disabled');
  } else {
    octokit = new Octokit({ auth: process.env.GITHUB_PAT });
  }
} catch (error) {
  console.error('Failed to initialize GitHub client:', error.message);
}

// Store user sessions for category selection
const userSessions = new Map();

// Health check server for Railway
const server = http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'OK', 
      service: 'AI Catalog Bot',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        telegram: !!bot,
        openai: !!openai,
        github: !!octokit
      },
      environment: {
        node_version: process.version,
        port: CONFIG.SERVER.PORT
      }
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(CONFIG.SERVER.PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check server running on port ${CONFIG.SERVER.PORT}`);
});

// Add startup verification
console.log('🤖 AI Catalog Bot starting...');
console.log('📋 Environment check:');
console.log(`   PORT: ${CONFIG.SERVER.PORT}`);
console.log(`   TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   GITHUB_PAT: ${process.env.GITHUB_PAT ? '✅ Set' : '❌ Missing'}`);
console.log('🤖 AI Catalog Bot started!');

// Main message handler
if (bot) {
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (!messageText) return;

  try {
    // Handle special commands first (these work regardless of session state)
    if (messageText.toLowerCase() === '/start' || messageText.toLowerCase() === '/restart') {
      userSessions.delete(chatId); // Clear any existing session
      await sendWelcomeMessage(chatId);
      return;
    }

    if (messageText.toLowerCase() === '/help') {
      await sendHelpMessage(chatId);
      return;
    }

    if (messageText.toLowerCase() === 'exit' || messageText.toLowerCase() === '/exit' || messageText.toLowerCase() === '/cancel') {
      userSessions.delete(chatId); // Clear session
      await bot.sendMessage(chatId, '✅ Session cleared! Send me a link or type /start to begin again.');
      return;
    }

    // Handle category selection if user is in session
    if (userSessions.has(chatId)) {
      await handleCategorySelection(chatId, messageText);
      return;
    }

    // Extract URLs from message
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = messageText.match(urlRegex);

    if (urls?.length > 0) {
      await processUrl(chatId, urls[0]);
    } else {
      // Handle general questions or provide guidance
      await handleGeneralMessage(chatId, messageText);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await bot.sendMessage(chatId, '❌ Something went wrong. Please try again.');
  }
});
} else {
  console.log('⚠️ Bot not initialized - message handling disabled');
}

// Process URL and extract content
async function processUrl(chatId, url) {
  try {
    await bot.sendMessage(chatId, '🔍 Analyzing link...');
    
    const extractedData = await extractContentFromUrl(url);
    userSessions.set(chatId, { extractedData, url });
    
    const categoryOptions = {
      reply_markup: {
        keyboard: [
          ['📄 Content'],
          ['🛠️ Tools'], 
          ['💡 Prompts'],
          ['👨‍💻 People']
        ],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    };
    
    const message = `✨ Content extracted!\n\n**Title:** ${extractedData.title}\n**Description:** ${extractedData.description}\n\nWhich category should this go in?`;
    
    await bot.sendMessage(chatId, message, categoryOptions);
  } catch (error) {
    console.error('Error extracting content:', error);
    await bot.sendMessage(chatId, '❌ Failed to extract content from the URL. Please try again.');
  }
}

// Send welcome message
async function sendWelcomeMessage(chatId) {
  const welcomeText = `👋 Hi! I'm your AI Catalog Bot.

Send me any AI-related link and I'll automatically:
• Extract the content
• Categorize it (content, tools, prompts, people)  
• Save it to your GitHub portfolio

Just paste a link to get started!

💡 **Commands:**
• /help - Show all available commands
• /restart - Start over 
• exit - Cancel current operation`;
  
  await bot.sendMessage(chatId, welcomeText);
}

// Send help message
async function sendHelpMessage(chatId) {
  const helpText = `🤖 **AI Catalog Bot Help**

**What I do:**
I help you catalog AI-related content by extracting information from URLs and organizing them in your GitHub portfolio.

**How to use:**
1. Send me any AI-related link
2. I'll extract the content and ask you to choose a category
3. I'll save it to your GitHub repository

**Categories:**
📄 Content - Articles, papers, research
🛠️ Tools - AI applications and services  
💡 Prompts - Useful AI prompts
👨‍💻 People - AI researchers and thought leaders

**Commands:**
• /start or /restart - Start over
• /help - Show this help message
• exit, /exit, /cancel - Cancel current operation
• Just paste any URL to analyze it

**Supported links:**
• Websites, blogs, articles
• Twitter/X posts
• GitHub repositories
• And more!`;

  await bot.sendMessage(chatId, helpText);
}

// Handle general messages (non-URLs when not in session)
async function handleGeneralMessage(chatId, messageText) {
  const standardResponses = [
    "I'm designed to catalog AI content from URLs. Please send me a link to get started! 🔗",
    "Send me any AI-related URL and I'll help you catalog it. Type /help for more info! 💡",
    "I can analyze AI content from links. Just paste any URL you'd like me to process! 🚀",
    "To get started, send me a link to an AI tool, article, or resource you'd like to catalog! 📖"
  ];
  
  // Check if it's a question about AI or the bot
  const isQuestion = messageText.includes('?') || 
                    messageText.toLowerCase().includes('how') || 
                    messageText.toLowerCase().includes('what') ||
                    messageText.toLowerCase().includes('why') ||
                    messageText.toLowerCase().includes('when') ||
                    messageText.toLowerCase().includes('where') ||
                    messageText.toLowerCase().includes('help');
  
  const isAiRelated = messageText.toLowerCase().includes('ai') ||
                      messageText.toLowerCase().includes('artificial intelligence') ||
                      messageText.toLowerCase().includes('machine learning') ||
                      messageText.toLowerCase().includes('ml') ||
                      messageText.toLowerCase().includes('llm') ||
                      messageText.toLowerCase().includes('chatgpt') ||
                      messageText.toLowerCase().includes('openai') ||
                      messageText.toLowerCase().includes('claude') ||
                      messageText.toLowerCase().includes('bot');

  if (isQuestion) {
    if (isAiRelated) {
      // Answer AI-related questions using OpenAI
      await answerAiQuestion(chatId, messageText);
    } else {
      // Show help for bot-related questions
      await sendHelpMessage(chatId);
    }
  } else {
    // Random helpful response for non-questions
    const randomResponse = standardResponses[Math.floor(Math.random() * standardResponses.length)];
    await bot.sendMessage(chatId, randomResponse);
  }
}

// Answer AI-related questions using OpenAI
async function answerAiQuestion(chatId, question) {
  try {
    if (!openai) {
      await bot.sendMessage(chatId, '❌ AI question answering is currently unavailable. Environment variables may be missing.');
      return;
    }

    await bot.sendMessage(chatId, '🤔 Let me think about that...');
    
    const prompt = `You are an AI assistant helping users with AI-related questions. Please provide a helpful, accurate, and concise answer to this question: "${question}"
    
    Keep your response informative but not too long (2-3 paragraphs max). If the question is about AI cataloging or organizing AI resources, mention that the user can also send links for automatic cataloging.`;

    const completion = await openai.chat.completions.create({
      model: CONFIG.OPENAI.MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });

    const answer = completion.choices[0].message.content;
    
    await bot.sendMessage(chatId, `🤖 ${answer}

💡 *Tip: You can also send me AI-related links to automatically catalog them!*`);
    
  } catch (error) {
    console.error('Error answering AI question:', error);
    await bot.sendMessage(chatId, `❌ Sorry, I couldn't process your question right now. 

For now, you can send me AI-related links to catalog, or type /help to see what I can do!`);
  }
}

async function handleCategorySelection(chatId, category) {
  const session = userSessions.get(chatId);
  if (!session) return;

  const { extractedData, url } = session;
  
  let categoryKey;
  switch (category) {
    case '📄 Content':
      categoryKey = 'content';
      break;
    case '🛠️ Tools':
      categoryKey = 'tools';
      break;
    case '💡 Prompts':
      categoryKey = 'prompts';
      break;
    case '👨‍💻 People':
      categoryKey = 'people';
      break;
    default:
      // More helpful error message with restart option
      await bot.sendMessage(chatId, `❌ Please select a valid category using the buttons.

Available options:
📄 Content
🛠️ Tools  
💡 Prompts
👨‍💻 People

Type "exit" to cancel or /restart to start over.`);
      return;
  }

  try {
    await bot.sendMessage(chatId, '⏳ Adding to catalog...');
    
    // Add to GitHub repo
    await addToAiCatalog(extractedData, categoryKey, url);
    
    await bot.sendMessage(chatId, '✅ Successfully added to your AI catalog!');
    
    // Clear session
    userSessions.delete(chatId);
    
  } catch (error) {
    console.error('Error adding to catalog:', error);
    await bot.sendMessage(chatId, '❌ Failed to add to catalog. Please try again.');
  }
}

async function extractContentFromUrl(url) {
  try {
    // Check if it's a Twitter/X URL
    if (url.includes('x.com') || url.includes('twitter.com')) {
      return await extractTwitterContent(url);
    } else {
      return await extractWebsiteContent(url);
    }
  } catch (error) {
    console.error('Error in extractContentFromUrl:', error);
    throw error;
  }
}

async function extractTwitterContent(url) {
  const prompt = `Extract information from this Twitter/X URL: ${url}
  
  Please provide:
  - Author username (without @)
  - Tweet content
  - Category (AI Research, AI Tools, AI News, etc.)
  
  Return as JSON with keys: author, content, category`;

  try {
    const completion = await openai.chat.completions.create({
      model: CONFIG.OPENAI.MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.OPENAI.TEMPERATURE
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return {
      title: `Tweet by @${response.author}`,
      description: response.content,
      author: `@${response.author}`,
      category: response.category || 'AI Research'
    };
  } catch (error) {
    console.warn('Failed to parse OpenAI response for Twitter content:', error);
    return {
      title: 'Twitter Post',
      description: 'Content extraction failed',
      author: 'Unknown',
      category: 'AI Research'
    };
  }
}

async function extractWebsiteContent(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: CONFIG.SERVER.TIMEOUT,
      maxRedirects: 5
    });
    
    const $ = cheerio.load(response.data);
    
    const title = extractTitle($);
    const description = extractDescription($);

    const aiAnalysis = await analyzeContentWithAI(url, title, description);
    
    return {
      title: title,
      description: aiAnalysis.enhancedDescription || description,
      category: aiAnalysis.category || 'AI Tool',
      features: aiAnalysis.features || []
    };
  } catch (error) {
    console.error('Error fetching website:', error.message);
    throw new Error(`Failed to fetch website content: ${error.message}`);
  }
}

function extractTitle($) {
  return $('title').text().trim() || 
         $('meta[property="og:title"]').attr('content') || 
         $('h1').first().text().trim() ||
         'Untitled';
}

function extractDescription($) {
  return $('meta[name="description"]').attr('content') || 
         $('meta[property="og:description"]').attr('content') || 
         $('p').first().text().trim() || 
         'No description available';
}

async function analyzeContentWithAI(url, title, description) {
  const prompt = `Analyze this website content and categorize it for an AI catalog:
    
    URL: ${url}
    Title: ${title}
    Description: ${description}
    
    Please determine:
    1. What category this fits: AI Tool, AI Research, AI News, AI Resource, etc.
    2. A concise description (2-3 sentences max)
    3. Key features if it's a tool
    
    Return as JSON with keys: category, enhancedDescription, features (array)`;

  try {
    const completion = await openai.chat.completions.create({
      model: CONFIG.OPENAI.MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.OPENAI.TEMPERATURE
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.warn('Failed to analyze content with AI:', error);
    return {
      category: 'AI Tool',
      enhancedDescription: description,
      features: []
    };
  }
}

async function addToAiCatalog(extractedData, categoryKey, originalUrl) {
  try {
    const { data: fileData } = await octokit.repos.getContent({
      owner: CONFIG.GITHUB.OWNER,
      repo: CONFIG.GITHUB.REPO,
      path: CONFIG.GITHUB.DATA_PATH
    });

    const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString());
    const newEntry = createCatalogEntry(extractedData, categoryKey, originalUrl);
    
    // Initialize category if it doesn't exist
    if (!currentContent[categoryKey]) {
      currentContent[categoryKey] = [];
    }
    
    // Add new entry to beginning of array
    currentContent[categoryKey].unshift(newEntry);
    
    // Update last modified timestamp
    currentContent.lastUpdated = new Date().toISOString();
    
    const commitMessage = `Add ${categoryKey.slice(0, -1)}: ${extractedData.title.slice(0, 50)}${extractedData.title.length > 50 ? '...' : ''}`;
    
    await octokit.repos.createOrUpdateFileContents({
      owner: CONFIG.GITHUB.OWNER,
      repo: CONFIG.GITHUB.REPO,
      path: CONFIG.GITHUB.DATA_PATH,
      message: commitMessage,
      content: Buffer.from(JSON.stringify(currentContent, null, 2)).toString('base64'),
      sha: fileData.sha
    });

    console.log(`✅ Added new ${categoryKey} entry: ${extractedData.title}`);
  } catch (error) {
    console.error('Error updating GitHub:', error.message);
    throw new Error(`Failed to save to GitHub: ${error.message}`);
  }
}

function createCatalogEntry(extractedData, categoryKey, originalUrl) {
  const baseEntry = {
    dateAdded: new Date().toISOString().split('T')[0],
    link: originalUrl
  };

  switch (categoryKey) {
    case 'content':
      return {
        author: extractedData.author || 'Unknown',
        content: extractedData.description,
        category: extractedData.category,
        ...baseEntry
      };
    
    case 'tools':
      return {
        name: extractedData.title,
        description: extractedData.description,
        category: extractedData.category,
        features: extractedData.features || [],
        ...baseEntry
      };
    
    case 'prompts':
      return {
        title: extractedData.title,
        prompt: extractedData.description,
        category: extractedData.category,
        source: originalUrl,
        ...baseEntry
      };
    
    case 'people':
      return {
        name: extractedData.title,
        description: extractedData.description,
        notableFor: extractedData.category,
        ...baseEntry
      };
    
    default:
      return {
        title: extractedData.title,
        description: extractedData.description,
        category: extractedData.category,
        ...baseEntry
      };
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Bot shutting down...');
  if (bot) {
    try {
      bot.stopPolling();
    } catch (error) {
      console.error('Error stopping bot polling:', error.message);
    }
  }
  server.close(() => {
    console.log('🌐 Health check server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🛑 Bot received SIGTERM, shutting down...');
  if (bot) {
    try {
      bot.stopPolling();
    } catch (error) {
      console.error('Error stopping bot polling:', error.message);
    }
  }
  server.close(() => {
    console.log('🌐 Health check server closed');
    process.exit(0);
  });
});