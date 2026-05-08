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
const { Jimp, intToRGBA } = require('jimp');
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

        case 'photo':
          await handlePhotoArt(bot, parts[2]);
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

async function handlePhotoArt(bot, id) {
  if (!id) return bot.chat('Usage: !cat photo <id>');

  bot.chat(`⏳ Fetching photo for cat ${id}...`);

  const res = await request({
    ...API_SERVER,
    method: 'GET',
    path: `/api/cats/${id}/photo`,
  });

  if (res.statusCode !== 200) {
    return bot.chat(`😿 No photo found for cat ${id} (Status: ${res.statusCode})`);
  }

  try {
    // res.body is a string with binary data (latin1/binary encoding from httpClient)
    const buffer = Buffer.from(res.body, 'binary');
    const image = await Jimp.read(buffer);
    
    // Resize to fit chat (7 pixels wide to stay strictly under 256 char limit per message)
    image.resize({ w: 7 }); 

    bot.chat(`🎨 Rendering ${image.bitmap.width}x${image.bitmap.height} pixel art...`);

    for (let y = 0; y < image.bitmap.height; y++) {
      let components = [""]; // Minecraft JSON chat format
      for (let x = 0; x < image.bitmap.width; x++) {
        const { r, g, b, a } = intToRGBA(image.getPixelColor(x, y));
        
        // Skip/Space for transparent pixels
        if (a < 128) {
          components.push({ text: " " });
          continue;
        }

        // Hex color format #RRGGBB
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        components.push({ text: "█", color: hex });
      }
      
      // Send as tellraw to allow true RGB colors and avoid § kick
      bot.chat(`/tellraw @a ${JSON.stringify(components)}`);
      
      // Small delay to avoid spam kick
      await new Promise(r => setTimeout(r, 100));
    }
  } catch (err) {
    console.error('[MC BOT ERROR]', err);
    bot.chat(`❌ Error processing image: ${err.message}`);
  }
}

// Start the bot
createBot();
