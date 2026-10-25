#!/usr/bin/env node
/* Usage: BACKUP_PASSPHRASE=... node backup-decrypt.mjs backup-2026-01-01.bin > backup.json */
import { readFileSync } from 'node:fs';
import { decrypt } from './backup-lib.mjs';
try { process.stdout.write(JSON.stringify(decrypt(readFileSync(process.argv[2]), process.env.BACKUP_PASSPHRASE), null, 2)); } catch (e) { console.error(e.message); process.exit(1); }
