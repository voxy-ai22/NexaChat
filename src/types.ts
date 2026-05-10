export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file',
  STICKER = 'sticker',
  GIF = 'gif'
}

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastActive: any; // Firestore Timestamp
  createdAt: any; // Firestore Timestamp
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface MessageUpdate {
  content: string;
  type: MessageType;
  senderId: string;
  senderUsername: string;
  timestamp: any;
  viewOnce?: boolean;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number; // for audio/video
  replyTo?: string; // message ID
  reactions?: { [emoji: string]: string[] }; // emoji -> Array of userIds
  isDeleted?: boolean;
}

export interface Message extends MessageUpdate {
  id: string;
}

export interface Sticker {
  id: string;
  url: string;
  createdBy: string;
}
