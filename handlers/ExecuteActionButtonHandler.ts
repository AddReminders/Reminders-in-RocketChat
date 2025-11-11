import {
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { UIKitActionButtonInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { Durations, ReminderRecipientsType } from '../enums/Ui';
import { isDMWithAppBot } from '../lib/Room/Room';
import { t } from '../lib/Translation/translation';
import { getUserPreference } from '../lib/UserPreference';
import { RemindApp } from '../RemindApp';
import { dialogModal } from '../ui/modals/DialogModal';
import { msgReminderCreationModal } from '../ui/modals/MsgReminderCreateModal/Modal';
import { createTaskCreationModal } from '../ui/modals/TaskCreateModal/Modal';
import { createReminderListModal } from '../ui/modals/TaskResultModal/Modal';

export class ExecuteActionButtonHandler {
	constructor(
		private readonly app: RemindApp,
		private readonly read: IRead,
		private readonly http: IHttp,
		private readonly modify: IModify,
		private readonly persistence: IPersistence,
	) {}

	public async run(context: UIKitActionButtonInteractionContext) {
		const { actionId, room, user, message } = context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			user.id,
		);
		const { language } = userPreference;

		switch (actionId) {
			case 'remind_me_about_this_msg_action': {
				if (!message) {
					throw new Error('Message is required');
				}

				const modal = await msgReminderCreationModal({
					app: this.app,
					read: this.read,
					persistence: this.persistence,
					modify: this.modify,
					room,
					user,
					message,
					currentDuration: Durations.HOUR_1,
					userPreference,
				});

				return context
					.getInteractionResponder()
					.openModalViewResponse(modal);
			}
			case 'show_my_reminders_room_action': {
				const modal = await createReminderListModal({
					app: this.app,
					modify: this.modify,
					read: this.read,
					user,
					showCompleted: false,
					userPreference,
					logger: this.app.getLogger(),
					persistence: this.persistence,
				});
				return context
					.getInteractionResponder()
					.openModalViewResponse(modal);
			}
			case 'add_reminder_message_box_action': {
				try {
					const { type, slugifiedName } = room;
					let recipientType = ReminderRecipientsType.ME;
					let initialTargetAudience = '';
					switch (type) {
						case RoomType.PRIVATE_GROUP:
						case RoomType.CHANNEL: {
							recipientType = ReminderRecipientsType.CHANNEL;
							initialTargetAudience = `#${slugifiedName}`;
							break;
						}
						case RoomType.DIRECT_MESSAGE: {
							if (
								await isDMWithAppBot(
									this.read,
									this.app.getID(),
									room,
								)
							) {
								recipientType = ReminderRecipientsType.ME;
							} else {
								recipientType = ReminderRecipientsType.USER;
								const allDMParticipants = await this.read
									.getRoomReader()
									.getMembers(room.id);
								const otherParticipants = allDMParticipants
									.filter((member) => member.id !== user.id)
									.map((member) => `@${member.username}`)
									.join(',');
								initialTargetAudience = otherParticipants;
							}
						}
					}
					const modal = await createTaskCreationModal({
						modify: this.modify,
						read: this.read,
						persistence: this.persistence,
						roomId: room.id,
						userId: user.id,
						recipientType,
						initialTargetAudience,
						userPreference,
					});
					return context
						.getInteractionResponder()
						.openModalViewResponse(modal);
				} catch (e) {
					this.app.getLogger().error(e);
					const errorModal = dialogModal({
						title: t('error', language),
						modify: this.modify,
						text: t(
							'error_add_reminder_message_box_action_failed',
							language,
						),
						language,
					});
					return context
						.getInteractionResponder()
						.openModalViewResponse(errorModal);
				}
			}
			case 'manage_all_reminders_room_action': {
				const modal = await createReminderListModal({
					app: this.app,
					modify: this.modify,
					read: this.read,
					user,
					showCompleted: false,
					userPreference,
					logger: this.app.getLogger(),
					persistence: this.persistence,
					manageRoomReminder: {
						roomId: room.id,
					},
				});
				return context
					.getInteractionResponder()
					.openModalViewResponse(modal);
			}
			default: {
				return context.getInteractionResponder().errorResponse();
			}
		}
	}
}
