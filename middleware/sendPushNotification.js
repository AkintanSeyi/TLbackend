const { Expo } = require('expo-server-sdk');
let expo = new Expo();

const sendPushNotification = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return;

  const messages = [];
  for (let token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.error(`Token ${token} is not a valid Expo push token`);
      continue;
    }

    messages.push({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: data, // e.g., { type: 'chat', conversationId: '123' }
      priority: 'high',
      channelId: 'messages',
    });
  }

  let chunks = expo.chunkPushNotifications(messages);
  for (let chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error("Error sending chunk:", error);
    }
  }
};

module.exports = sendPushNotification;