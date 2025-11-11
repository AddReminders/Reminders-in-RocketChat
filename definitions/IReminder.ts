import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { RecurringReminderFrequencies } from '../enums/Ui';

interface LinkedMessageRoomBase {
	type: RoomType;
	url: string;
}

interface LinkedMessageRoomChannelOrGroupOrLivechat
	extends LinkedMessageRoomBase {
	type: RoomType.CHANNEL | RoomType.PRIVATE_GROUP | RoomType.LIVE_CHAT;
	name: string;
}

interface LinkedMessageRoomDM extends LinkedMessageRoomBase {
	type: RoomType.DIRECT_MESSAGE;
	otherParticipants: string[];
}

interface LinkedMessageRoomUnknown {
	type: 'unknown';
}

export interface IReminder {
	id: string;
	description: string;
	linkedMessage?: {
		id: string;
		url: string;
		/* deprecated after version 2.0.1 */
		msgAdditionalInfoPreview?: string;
		metadata: {
			fromUser: {
				username: string;
				directMessageLink: string;
			};
			fromRoom:
				| LinkedMessageRoomChannelOrGroupOrLivechat
				| LinkedMessageRoomDM
				| LinkedMessageRoomUnknown;
		};
	};
	roomId: string; // room id where this task was created
	audience?: {
		type: 'room' | 'user';
		ids?: string[]; // deprecated after version 2.3.0. Use audience.audienceIds instead.
		audienceIds: string[];
	};
	createdAt: Date; // should always be utc 0
	timeZone: {
		utcOffset: number;
		name?: string;
	};
	frequency: RecurringReminderFrequencies;
	createdBy: string; // id of the user
	dueDate: Date; // should always be utc 0
	completedAt?: Date; // should always be utc 0
	status: 'active' | 'completed';
	messageId?: string; // message id of the reminder which the bot will send on due date
	schedularJobId?: string; // schedular job id of the reminder
	// deprecated after version 2.2.0, use schedularJobId instead
	jobId?: string; // job id of the reminder job which will send the reminder on due date
}
