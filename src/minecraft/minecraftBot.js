/**
 * minecraftBot.js
 * 🎮 Minecraft integration for the Cat Shelter project.
 *
 * This bot connects to a Minecraft server and allows players to:
 * - !cat list : List all cats in the shelter
 * - !cat info <id> : Get details of a specific cat
 * - !cat add <name> <breed> : Register a new cat
 * - !cat owners : List all owners
 */

'use strict';

const mineflayer = require('mineflayer');
const { request } = require('../client/httpClient');

// ─── Configuration ────────────────────────────────────────────────────────────

const MC_SERVER = {
  host: 'localhost',
  port: 25565,
  username: 'CatShelterBot',
};

const API_SERVER = {
  host: '127.0.0.1',
  port: 3000,
  apiKey: 'supersecret-key-123',
};

// ─── Bot Initialization ───────────────────────────────────────────────────────

function createBot() {
  console.log(`[MC BOT] Connecting to Minecraft server at ${MC_SERVER.host}:${MC_SERVER.port}...`);
  
  const bot = mineflayer.createBot({
    host: MC_SERVER.host,
    port: MC_SERVER.port,
    username: MC_SERVER.username,
  });

  bot.on('login', () => {
    console.log(`[MC BOT] Logged in as ${bot.username}`);
  });

  bot.on('spawn', () => {
    bot.chat('🐱 Cat Shelter Bot is here! Type !cat help for commands.');
  });

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return; // ignore self
    if (!message.startsWith('!cat')) return;

    const parts = message.split(' ').filter(Boolean);
    const cmd = parts[1];

    try {
      switch (cmd) {
        case 'help':
          bot.chat('Available commands: !cat list, !cat info <id>, !cat add <name> <breed>, !cat owners');
          break;

        case 'list':
          await handleList(bot);
          break;

        case 'info':
          await handleInfo(bot, parts[2]);
          break;

        case 'add':
          await handleAdd(bot, parts[3], parts[4]);
          break;

        case 'owners':
          await handleOwners(bot);
          break;

        default:
          bot.chat('Unknown command. Type !cat help');
      }
    } catch (err) {
      console.error('[MC BOT ERROR]', err.message);
      bot.chat(`❌ Error: ${err.message}`);
    }
  });

  bot.on('kicked', (reason) => console.log(`[MC BOT] Kicked: ${reason}`));
  bot.on('error', (err) => console.error('[MC BOT ERROR]', err.message));
  bot.on('end', () => {
    console.log('[MC BOT] Disconnected. Retrying in 5s...');
    setTimeout(createBot, 5000);
  });
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleList(bot) {
  const res = await request({
    ...API_SERVER,
    method: 'GET',
    path: '/api/cats',
  });

  if (res.statusCode !== 200) {
    return bot.chat('Failed to fetch cats.');
  }

  const data = JSON.parse(res.body);
  if (data.data.length === 0) {
    return bot.chat('The shelter is empty! 😿');
  }

  bot.chat(`🐱 Shelter has ${data.data.length} cats:`);
  data.data.forEach(cat => {
    bot.chat(`- [${cat.id}] ${cat.name} (${cat.breed})`);
  });
}

async function handleInfo(bot, id) {
  if (!id) return bot.chat('Usage: !cat info <id>');

  const res = await request({
    ...API_SERVER,
    method: 'GET',
    path: `/api/cats/${id}`,
  });

  if (res.statusCode === 404) {
    return bot.chat(`Cat ${id} not found.`);
  }

  const data = JSON.parse(res.body);
  const cat = data.data;
  bot.chat(`🐱 Details for ${cat.name}:`);
  bot.chat(`- Breed: ${cat.breed}`);
  bot.chat(`- Age: ${cat.age || 'Unknown'}`);
  bot.chat(`- Color: ${cat.color || 'Unknown'}`);
}

async function handleAdd(bot, name, breed) {
  if (!name || !breed) return bot.chat('Usage: !cat add <name> <breed>');

  const res = await request({
    ...API_SERVER,
    method: 'POST',
    path: '/api/cats',
    body: JSON.stringify({ name, breed }),
  });

  if (res.statusCode === 201) {
    const data = JSON.parse(res.body);
    bot.chat(`✅ Successfully added ${data.data.name}! (ID: ${data.data.id})`);
  } else {
    bot.chat(`❌ Failed to add cat: ${res.statusCode}`);
  }
}

async function handleOwners(bot) {
  const res = await request({
    ...API_SERVER,
    method: 'GET',
    path: '/api/owners',
  });

  if (res.statusCode !== 200) {
    return bot.chat('Failed to fetch owners.');
  }

  const data = JSON.parse(res.body);
  bot.chat(`👤 Shelter has ${data.data.length} owners:`);
  data.data.forEach(owner => {
    bot.chat(`- ${owner.name} (${owner.cats.length} cats)`);
  });
}

// Start the bot
createBot();
