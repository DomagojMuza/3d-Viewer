#!/usr/bin/env node
'use strict';

const bcrypt = require('bcrypt');
const readline = require('readline');

// Bootstrap env before loading db
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { db, init } = require('./database');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  await init();
  const username = (await ask('Admin username: ')).trim();
  if (!username) { console.error('Username cannot be empty.'); process.exit(1); }

  const password = (await ask('Admin password: ')).trim();
  if (password.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }

  rl.close();

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) { console.error(`User "${username}" already exists.`); process.exit(1); }

  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);

  console.log(`Admin user "${username}" created successfully.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
