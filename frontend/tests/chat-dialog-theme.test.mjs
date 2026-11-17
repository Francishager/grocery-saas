import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const chat = read('../src/components/BusinessChatWidget.tsx');
const advisor = read('../src/pages/BusinessAdvisorPage.tsx');
const networkChat = read('../src/pages/JibuNetworkPage.tsx');
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

test('chat explains the send permission needed to discover contacts and distinguishes loading from empty results', () => {
  assert.match(chat, /grant “Send Team Messages” to discover contacts and start chats/);
  assert.match(chat, /Loading business contacts/);
  assert.match(chat, /No other active users are available in this business account/);
});

test('chat messages show sender profile photos and expose reply and emoji controls', () => {
  assert.match(chat, /function ChatAvatar/);
  assert.match(chat, /senderAvatar = own \? user\?\.avatar : activePeer\?\.avatar/);
  assert.match(chat, /aria-label="Reply to message"/);
  assert.match(chat, /aria-label="Choose an emoji"/);
  assert.match(chat, /function insertEmoji\(emoji: string\)/);
});

test('business chats support image captions and deduplicate sends by message ID without inbox tabs', () => {
  assert.doesNotMatch(chat, /role="tablist" aria-label="Conversation type"/);
  assert.doesNotMatch(chat, /inboxType/);
  assert.match(chat, /No business chats yet/);
  assert.match(chat, /aria-label="Open JibuSales Network"/);
  assert.match(chat, /aria-label="Attach image"/);
  assert.match(chat, /message\.imageUrl && <img src=\{message\.imageUrl\}/);
  assert.match(chat, /sendingRef\.current/);
  assert.match(chat, /current\.some\(\(row\) => row\.id === message\.id\)/);
  assert.match(networkChat, /aria-label="Attach image"/);
  assert.match(networkChat, /message\.imageUrl && <img src=\{message\.imageUrl\}/);
  assert.match(networkChat, /sendingMessageRef\.current/);
  assert.match(networkChat, /clientMessageId/);
});

test('JibuSales Network incoming messages use the shared popup notification flow', () => {
  assert.match(chat, /seenNetworkMessages/);
  assert.match(chat, /latestUnread\?: NetworkMessage/);
  assert.match(chat, /sent a JibuSales Network message/);
  assert.match(chat, /loadNetworkMessages\(incoming\.chat\)/);
});

test('JibuSales Network new-chat action is hidden while a conversation is open', () => {
  assert.match(networkChat, /profile\?\.enabled && canManageNetwork && tab === 'chats' && !selectedChat && <Button[^>]+aria-label="New chat"/);
});

test('AI Advisor new-chat action is hidden while a conversation is open', () => {
  assert.match(advisor, /\{!current && <Button[^>]+onClick=\{newChat\}><Plus[^>]+>New chat<\/Button>\}/);
});
