import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const chat = read('../src/components/BusinessChatWidget.tsx');
const dialog = read('../src/components/ui/dialog.tsx');

test('chat messages use readable dark-mode surfaces and foreground colors', () => {
  assert.match(chat, /bg-white dark:bg-muted/);
  assert.match(chat, /bg-\[#d9fdd3\] dark:bg-emerald-950\/80/);
  assert.match(chat, /text-\[#17211b\] dark:text-foreground/);
  assert.match(chat, /text-\[#667781\] dark:text-muted-foreground/);
});

test('dialogs ignore outside interactions unless a caller already handled them', () => {
  assert.match(dialog, /onInteractOutside\?\.\(event\)/);
  assert.match(dialog, /if \(!event\.defaultPrevented\) event\.preventDefault\(\)/);
});
