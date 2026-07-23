import { existsSync } from "node:fs";
import { join } from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";

const logger = pino({ level: "silent" });
const authDirectory = process.env.WHATSAPP_AUTH_DIRECTORY || join(process.cwd(), "data", "whatsapp-auth");

export function createWhatsAppConnector({ isChatEnabled, onChats, onGroupMessage, onPlanningMessage, onLocationStaffMessage, onVerificationMessage, onReady }) {
  let socket = null;
  let reconnectTimer = null;
  let generation = 0;
  let processingQueue = Promise.resolve();
  const chatMetadata = new Map();
  const eligiblePhones = new Set();
  const eligiblePhoneKeys = new Set();
  const phoneByJid = new Map();
  const recentPlanningText = new Map();
  const pendingPlanningImages = new Map();
  let credentials = null;
  let state = {
    status: existsSync(join(authDirectory, "creds.json")) ? "connecting" : "waiting-for-qr",
    message: "Starting WhatsApp connector…",
    qrDataUrl: null,
    account: null,
    lastMessageAt: null,
    lastError: null,
  };

  async function start() {
    const currentGeneration = ++generation;
    clearTimeout(reconnectTimer);
    if (socket) {
      try { socket.end(undefined); } catch { /* already closed */ }
      socket = null;
    }

    state = { ...state, status: "connecting", message: "Connecting to WhatsApp…", qrDataUrl: null, lastError: null };
    const { state: auth, saveCreds } = await useMultiFileAuthState(authDirectory);
    if (process.env.WHATSAPP_FORCE_HISTORY_SYNC_ON_START === "true") {
      auth.creds.accountSyncCounter = 0;
      auth.creds.processedHistoryMessages = [];
      await saveCreds();
      delete process.env.WHATSAPP_FORCE_HISTORY_SYNC_ON_START;
    }
    credentials = auth.creds;
    if (currentGeneration !== generation) return;

    const nextSocket = makeWASocket({
      auth,
      browser: Browsers.macOS("Boat Tracker"),
      logger,
      markOnlineOnConnect: false,
      syncFullHistory: true,
      generateHighQualityLinkPreview: false,
    });
    socket = nextSocket;
    nextSocket.ev.on("creds.update", saveCreds);
    nextSocket.ev.on("connection.update", async (update) => {
      if (currentGeneration !== generation) return;
      if (update.qr) {
        state = {
          ...state,
          status: "waiting-for-qr",
          message: "Scan this QR code in WhatsApp → Linked devices",
          qrDataUrl: await QRCode.toDataURL(update.qr, { width: 360, margin: 1 }),
        };
      }
      if (update.connection === "open") {
        state = {
          ...state,
          status: "connected",
          message: "Connected for employee account verification.",
          qrDataUrl: null,
          account: nextSocket.user?.id || null,
          lastError: null,
        };
        await refreshGroups(nextSocket);
        await onReady?.();
      }
      if (update.connection === "close") {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        socket = null;
        state = {
          ...state,
          status: loggedOut ? "logged-out" : "reconnecting",
          message: loggedOut ? "WhatsApp was logged out. Pair it again." : "Connection lost; reconnecting…",
          qrDataUrl: null,
          account: loggedOut ? null : state.account,
          lastError: update.lastDisconnect?.error?.message || null,
        };
        if (!loggedOut && currentGeneration === generation) reconnectTimer = setTimeout(start, 2500);
      }
    });
    nextSocket.ev.on("groups.upsert", () => refreshGroups(nextSocket));
    nextSocket.ev.on("groups.update", () => refreshGroups(nextSocket));
    nextSocket.ev.on("messages.upsert", ({ messages, type }) => {
      if (!["notify", "append"].includes(type) || currentGeneration !== generation) return;
      enqueueMessages(nextSocket, messages, currentGeneration);
    });
    nextSocket.ev.on("messaging-history.set", ({ messages }) => {
      if (currentGeneration !== generation || !messages?.length) return;
      const timestamps = messages.map((message) => Number(message.messageTimestamp || 0) * 1000).filter(Number.isFinite);
      const range = timestamps.length ? ` (${new Date(Math.min(...timestamps)).toISOString()} – ${new Date(Math.max(...timestamps)).toISOString()})` : "";
      console.log(`WhatsApp history batch: ${messages.length} messages${range}`);
      enqueueMessages(nextSocket, messages, currentGeneration);
    });
  }

  async function rescanHistory(requests, count = 250) {
    if (!socket || state.status !== "connected") throw new Error("WhatsApp is not connected");
    const results = [];
    for (const request of requests) {
      if (!request.anchorId) {
        results.push({ chatId: request.chatId, requested: false, error: "No local message anchor" });
        continue;
      }
      try {
        const requestId = await socket.fetchMessageHistory(count, {
          remoteJid: request.chatId,
          fromMe: Boolean(request.fromMe),
          id: request.anchorId,
        }, request.anchorTimestamp || Date.now());
        results.push({ chatId: request.chatId, requested: true, requestId });
      } catch (error) {
        results.push({ chatId: request.chatId, requested: false, error: error.message });
      }
    }
    // Requesting placeholder resends synchronizes encrypted history records;
    // it does not send a chat message or notification to any participant.
    for (const notification of credentials?.processedHistoryMessages || []) {
      try { await socket.requestPlaceholderResend(notification.key, { messageTimestamp: notification.messageTimestamp }); } catch { /* unavailable history chunk */ }
    }
    state = { ...state, message: `Read-only history scan requested for ${results.filter((item) => item.requested).length} groups.` };
    return results;
  }

  function enqueueMessages(activeSocket, messages, currentGeneration) {
    processingQueue = processingQueue.then(async () => {
      if (currentGeneration !== generation) return;
      const chronological = [...messages].sort((left, right) => Number(left.messageTimestamp || 0) - Number(right.messageTimestamp || 0));
      for (const message of chronological) {
        try {
          await processMessage(activeSocket, message);
        } catch (error) {
          state = { ...state, lastError: `WhatsApp message processing failed: ${error.message}` };
          console.error("WhatsApp message processing failed", error);
        }
      }
    });
  }

  async function refreshGroups(activeSocket = socket) {
    if (!activeSocket) return;
    try {
      const [groupResult, communityResult] = await Promise.allSettled([
        activeSocket.groupFetchAllParticipating(),
        activeSocket.communityFetchAllParticipating(),
      ]);
      const combined = new Map();
      if (groupResult.status === "fulfilled") {
        for (const group of Object.values(groupResult.value)) combined.set(group.id, group);
      }
      if (communityResult.status === "fulfilled") {
        for (const community of Object.values(communityResult.value)) combined.set(community.id, community);
      }
      const communities = [...combined.values()].filter((item) => item.isCommunity);
      for (const community of communities) {
        try {
          const linked = await activeSocket.communityFetchLinkedGroups(community.id);
          for (const linkedGroup of linked.linkedGroups || []) {
            if (!linkedGroup.id) continue;
            let group = combined.get(linkedGroup.id);
            if (!group || !(group.participants || []).length) {
              try { group = await activeSocket.groupMetadata(linkedGroup.id); } catch { continue; }
            }
            combined.set(linkedGroup.id, { ...group, linkedParent: group.linkedParent || community.id });
          }
        } catch {
          // groupFetchAllParticipating still supplies the normal fallback.
        }
      }
      const chats = [...combined.values()].map(normalizeChatMetadata);
      for (const chat of chats) chatMetadata.set(chat.id, chat);
      onChats(chats);
      eligiblePhones.clear();
      eligiblePhoneKeys.clear();
      phoneByJid.clear();
      for (const group of combined.values()) {
        const metadata = normalizeChatMetadata(group);
        if (metadata.isCommunity || metadata.isAnnouncement || !await isChatEnabled(metadata.id, metadata)) continue;
        for (const participant of group.participants || []) {
          const phone = await resolveParticipantPhone(activeSocket, participant);
          if (!phone) continue;
          eligiblePhones.add(phone);
          for (const key of comparablePhoneKeys(phone)) eligiblePhoneKeys.add(key);
          for (const jid of [participant.id, participant.lid, participant.phoneNumber]) {
            if (jid) phoneByJid.set(jidKey(jid), phone);
          }
        }
      }
    } catch (error) {
      console.error("Could not load WhatsApp groups", error.message);
    }
  }

  async function processMessage(activeSocket, message) {
    const chatId = message.key?.remoteJid;
    if (!chatId || !message.message) return;
    const content = unwrapMessage(message.message);
    const imageDocument = String(content.documentMessage?.mimetype || "").startsWith("image/") ? content.documentMessage : null;
    const plainText = content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption
      || imageDocument?.caption || "";
    if (!chatId.endsWith("@g.us")) {
      if (message.key.fromMe) return;
      const senderPhone = resolveDirectSenderPhone(message.key, phoneByJid);
      if (senderPhone && plainText.trim()) {
        await onVerificationMessage?.({
          phone: senderPhone,
          text: plainText.trim(),
          externalMessageId: message.key.id,
          receivedAt: Number(message.messageTimestamp || 0) * 1000 || Date.now(),
        });
      }
      return;
    }
    let metadata = chatMetadata.get(chatId);
    if (!metadata) {
      try {
        metadata = normalizeChatMetadata(await activeSocket.groupMetadata(chatId));
        chatMetadata.set(chatId, metadata);
        onChats([metadata]);
      } catch { return; }
    }
    if (!await isChatEnabled(chatId, metadata)) return;
    const receivedAt = Number(message.messageTimestamp || 0) * 1000 || Date.now();
    await onGroupMessage?.({
      chatId,
      externalMessageId: message.key.id,
      receivedAt,
      fromMe: Boolean(message.key.fromMe),
    });
    const mediaMessage = content.imageMessage || imageDocument;
    if (plainText.trim() && looksLikeCrewContext(plainText)) {
      recentPlanningText.set(chatId, { text: plainText.trim(), receivedAt });
      const pending = pendingPlanningImages.get(chatId) || [];
      const candidate = pending.filter((item) => Math.abs(item.receivedAt - receivedAt) <= 3 * 60 * 1000)
        .sort((left, right) => Math.abs(left.receivedAt - receivedAt) - Math.abs(right.receivedAt - receivedAt))[0];
      if (candidate) {
        pendingPlanningImages.set(chatId, pending.filter((item) => item !== candidate));
        await onPlanningMessage?.({ ...candidate, contextText: plainText.trim() });
      }
    }
    if (plainText.trim()) await onLocationStaffMessage?.({
      chatId,
      chatTitle: metadata.title,
      externalMessageId: message.key.id,
      receivedAt,
      sender: message.key.participant || message.participant || null,
      text: plainText.trim(),
    });
    if (!mediaMessage) return;
    console.log(`WhatsApp planning image read from ${metadata.title} at ${new Date(receivedAt).toISOString()}`);
    const recent = recentPlanningText.get(chatId);
    const compactCrewCard = isLikelyCrewCard(mediaMessage);
    const matchedRecent = compactCrewCard && recent && receivedAt >= recent.receivedAt
      && receivedAt - recent.receivedAt <= 3 * 60 * 1000 ? recent : null;
    const contextText = plainText.trim() || matchedRecent?.text || "";
    // A caption describes one crew card. Reusing it was the main cause of one
    // boat's crew being attached to several subsequent images in history sync.
    if (matchedRecent) recentPlanningText.delete(chatId);
    const image = await downloadMediaMessage(message, "buffer", {}, {
      logger,
      reuploadRequest: activeSocket.updateMediaMessage,
    });
    const planningMessage = {
      chatId,
      chatTitle: metadata.title,
      externalMessageId: message.key.id,
      receivedAt,
      sender: message.key.participant || message.participant || null,
      contextText,
      image,
      mimeType: mediaMessage.mimetype || "image/jpeg",
    };
    if (!contextText && compactCrewCard) {
      const pending = (pendingPlanningImages.get(chatId) || [])
        .filter((item) => receivedAt - item.receivedAt <= 3 * 60 * 1000);
      pending.push(planningMessage);
      pendingPlanningImages.set(chatId, pending.slice(-8));
      setTimeout(async () => {
        const queued = pendingPlanningImages.get(chatId) || [];
        if (!queued.includes(planningMessage)) return;
        pendingPlanningImages.set(chatId, queued.filter((item) => item !== planningMessage));
        try { await onPlanningMessage?.(planningMessage); } catch (error) {
          console.error("Delayed WhatsApp crew-card processing failed", error.message);
        }
      }, 5_000);
    } else {
      await onPlanningMessage?.(planningMessage);
    }
    state = { ...state, message: "Connected. Planning history is read-only; no WhatsApp messages are sent.", lastMessageAt: Date.now() };
  }

  async function logout() {
    generation += 1;
    clearTimeout(reconnectTimer);
    if (socket) await socket.logout();
    socket = null;
    state = { status: "logged-out", message: "Logged out. Reconnect to create a new QR code.", qrDataUrl: null, account: null, lastMessageAt: null, lastError: null };
  }

  return {
    start,
    restart: start,
    logout,
    refreshGroups,
    rescanHistory,
    isEligiblePhone: async (phone) => {
      const matches = () => comparablePhoneKeys(phone).some((key) => eligiblePhoneKeys.has(key));
      if (!matches() && socket) await refreshGroups(socket);
      return matches();
    },
    getVerificationInfo: () => ({
      connected: state.status === "connected",
      phone: phoneFromJid(state.account) || configuredVerificationPhone(),
      eligibleMemberCount: eligiblePhones.size,
    }),
    getState: () => ({ ...state }),
  };
}

function looksLikeCrewContext(value) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length >= 2 && lines.some((line) => /^[@＠]/.test(line));
}

function isLikelyCrewCard(mediaMessage) {
  const width = Number(mediaMessage?.width || 0), height = Number(mediaMessage?.height || 0);
  return width > 0 && height > 0 && width > height && height <= 700;
}

function normalizeChatMetadata(group) {
  return {
    id: group.id,
    title: group.subject || group.id,
    linkedParent: group.linkedParent || null,
    isCommunity: Boolean(group.isCommunity),
    isAnnouncement: Boolean(group.isCommunityAnnounce),
  };
}

function unwrapMessage(message) {
  let current = message;
  while (current?.ephemeralMessage?.message || current?.viewOnceMessage?.message || current?.viewOnceMessageV2?.message
    || current?.documentWithCaptionMessage?.message || current?.editedMessage?.message) {
    current = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message
      || current.documentWithCaptionMessage?.message || current.editedMessage?.message;
  }
  return current || {};
}

function resolveDirectSenderPhone(key, phoneByJid) {
  for (const jid of [key.remoteJidAlt, key.participantAlt, key.remoteJid, key.participant]) {
    if (!jid) continue;
    const direct = phoneFromJid(jid);
    if (direct) return direct;
    const mapped = phoneByJid.get(jidKey(jid));
    if (mapped) return mapped;
  }
  return null;
}

function phoneFromJid(jid) {
  const value = String(jid || "");
  if (value.includes("@lid") || (value.includes("@") && !value.includes("@s.whatsapp.net") && !value.includes("@hosted"))) return null;
  let digits = value.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `31${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

async function resolveParticipantPhone(activeSocket, participant) {
  for (const candidate of [participant.phoneNumber, participant.id]) {
    const phone = phoneFromJid(candidate);
    if (phone) return phone;
  }
  for (const candidate of [participant.lid, participant.id]) {
    if (!String(candidate || "").includes("@lid")) continue;
    try {
      const phoneJid = await activeSocket.signalRepository?.lidMapping?.getPNForLID(jidKey(candidate));
      const phone = phoneFromJid(phoneJid);
      if (phone) return phone;
    } catch {
      // Some privacy IDs have no locally cached phone mapping.
    }
  }
  return null;
}

function comparablePhoneKeys(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `31${digits.slice(1)}`;
  const keys = new Set([digits]);
  if (digits.startsWith("31") && digits.length === 11) {
    keys.add(`0${digits.slice(2)}`);
    keys.add(digits.slice(2));
  }
  return [...keys].filter(Boolean);
}

function jidKey(jid) {
  return String(jid || "").replace(/:\d+@/, "@");
}

function configuredVerificationPhone() {
  const digits = String(process.env.WHATSAPP_VERIFICATION_NUMBER || "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}
